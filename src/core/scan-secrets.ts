import { loadProject } from "./context.js";

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
  { pattern: /\b(?:postgres|mysql|mongodb):\/\/[^:]+:[^@\s]+@/i, label: "database connection string with credentials" }
];

export interface ScanFinding {
  source: string;
  id: string;
  field: string;
  label: string;
}

export interface ScanResult {
  findings: ScanFinding[];
  summary: string;
}

export async function scanForSecrets({ cwd }: { cwd: string }): Promise<ScanResult> {
  const loaded = await loadProject(cwd);

  try {
    const findings: ScanFinding[] = [];

    const memories = loaded.repo.listMemories(loaded.project.projectId);
    for (const memory of memories) {
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(memory.content)) {
          findings.push({ source: "memory", id: memory.id, field: "content", label });
        }
        if (memory.summary && pattern.test(memory.summary)) {
          findings.push({ source: "memory", id: memory.id, field: "summary", label });
        }
      }
      const metadataStr = JSON.stringify(memory.metadata);
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(metadataStr)) {
          findings.push({ source: "memory", id: memory.id, field: "metadata", label });
        }
      }
    }

    const events = loaded.repo.listEvents(loaded.project.projectId);
    for (const event of events) {
      const payloadStr = JSON.stringify(event.payload);
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(payloadStr)) {
          findings.push({ source: "event", id: event.eventId, field: "payload", label });
        }
      }
    }

    const candidates = loaded.repo.listMemoryCandidates(loaded.project.projectId);
    for (const candidate of candidates) {
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(candidate.content)) {
          findings.push({ source: "candidate", id: candidate.candidateId, field: "content", label });
        }
        if (pattern.test(candidate.evidence)) {
          findings.push({ source: "candidate", id: candidate.candidateId, field: "evidence", label });
        }
      }
      const metadataStr = JSON.stringify(candidate.metadata);
      for (const { pattern, label } of SECRET_PATTERNS) {
        if (pattern.test(metadataStr)) {
          findings.push({ source: "candidate", id: candidate.candidateId, field: "metadata", label });
        }
      }
    }

    const summary = findings.length === 0
      ? "No potential secrets found."
      : `Found ${findings.length} potential secret(s) in local store.`;

    return { findings, summary };
  } finally {
    loaded.close();
  }
}
