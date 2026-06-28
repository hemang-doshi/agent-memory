import type { LoadedReadOnlyProject, McpScanFinding, McpScanResult } from "./types.js";

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bapi[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_\-+/=]{20,}/i, label: "API key assignment" },
  { pattern: /\bsecret\s*[=:]/i, label: "exposed secret assignment" },
  { pattern: /\bpassword\s*[=:]/i, label: "exposed password assignment" },
  { pattern: /\btoken\s*[=:]/i, label: "exposed token assignment" },
  { pattern: /\bBearer\s+ey[A-Za-z0-9_-]+/i, label: "JWT Bearer token" },
  { pattern: /\bsk-[A-Za-z0-9_-]+/, label: "OpenAI API key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key" },
  { pattern: /\bghp_[A-Za-z0-9]{36}\b/, label: "GitHub classic PAT" },
  { pattern: /\bgho_[A-Za-z0-9]{36}\b/, label: "GitHub OAuth token" },
  { pattern: /\bghu_[A-Za-z0-9]{36}\b/, label: "GitHub user token" },
  { pattern: /\bxox[bprs]-[A-Za-z0-9-]+\b/, label: "Slack token" },
  { pattern: /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/, label: "private key block" },
  { pattern: /AIza[0-9A-Za-z\-_]{35,}\b/, label: "Google API key" },
  {
    pattern: /\b(?:postgres|mysql|mongodb):\/\/[^:]+:[^@\s]+@/i,
    label: "database connection string with credentials"
  }
];

const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bignore (all )?(previous|prior|above) instructions\b/i, label: "prompt injection instruction override" },
  { pattern: /\bdisregard (all )?(previous|prior|above) instructions\b/i, label: "prompt injection disregard instruction" },
  { pattern: /\breveal (system|developer|hidden) (prompt|instructions)\b/i, label: "prompt injection prompt exfiltration" },
  { pattern: /\bdo not tell (the )?user\b/i, label: "prompt injection hidden instruction" }
];

function pushPatternFindings({
  findings,
  source,
  id,
  field,
  value,
  deep
}: {
  findings: McpScanFinding[];
  source: string;
  id: string;
  field: string;
  value: string;
  deep: boolean;
}): void {
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      findings.push({ source, id, field, label, severity: "high" });
    }
  }
  if (!deep) {
    return;
  }
  for (const { pattern, label } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      findings.push({ source, id, field, label, severity: "medium" });
    }
  }
}

export function scanReadOnly(loaded: LoadedReadOnlyProject, deep: boolean): McpScanResult {
  const findings: McpScanFinding[] = [];

  for (const memory of loaded.repo.listMemories(loaded.project.projectId)) {
    pushPatternFindings({
      findings,
      source: "memory",
      id: memory.id,
      field: "content",
      value: memory.content,
      deep
    });
    if (memory.summary) {
      pushPatternFindings({
        findings,
        source: "memory",
        id: memory.id,
        field: "summary",
        value: memory.summary,
        deep
      });
    }
    pushPatternFindings({
      findings,
      source: "memory",
      id: memory.id,
      field: "metadata",
      value: JSON.stringify(memory.metadata),
      deep
    });
  }

  for (const event of loaded.repo.listEvents(loaded.project.projectId)) {
    pushPatternFindings({
      findings,
      source: "event",
      id: event.eventId,
      field: "payload",
      value: JSON.stringify(event.payload),
      deep
    });
  }

  for (const candidate of loaded.repo.listMemoryCandidates(loaded.project.projectId)) {
    pushPatternFindings({
      findings,
      source: "candidate",
      id: candidate.candidateId,
      field: "content",
      value: candidate.content,
      deep
    });
    pushPatternFindings({
      findings,
      source: "candidate",
      id: candidate.candidateId,
      field: "evidence",
      value: candidate.evidence,
      deep
    });
    pushPatternFindings({
      findings,
      source: "candidate",
      id: candidate.candidateId,
      field: "metadata",
      value: JSON.stringify(candidate.metadata),
      deep
    });
  }

  return {
    findings,
    summary:
      findings.length === 0
        ? deep
          ? "No potential secrets or prompt-injection patterns found."
          : "No potential secrets found."
        : `Found ${findings.length} potential safety finding(s) in local store.`
  };
}
