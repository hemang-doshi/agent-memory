import {
  CONFIDENCE_LEVELS,
  CANDIDATE_STATUSES,
  CANDIDATE_TYPES,
  EVIDENCE_EVENT_TYPES,
  MEMORY_SCOPES,
  MEMORY_SOURCES,
  MEMORY_STATUSES,
  MEMORY_TYPES,
  PREFLIGHT_DECISIONS,
  SEVERITY_LEVELS,
  type CandidateType,
  type CandidateStatus,
  type ConfidenceLevel,
  type EvidenceEventType,
  type MemoryRecord,
  type MemoryScope,
  type MemorySource,
  type MemoryStatus,
  type MemoryType,
  type PreflightDecision,
  type SeverityLevel
} from "./types.js";

export const COMMAND_POLICY_MATCH_TYPES = ["substring", "exact", "regex"] as const;
export type CommandPolicyMatchType = (typeof COMMAND_POLICY_MATCH_TYPES)[number];

function parseEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value === "string" && values.includes(value as T)) {
    return value as T;
  }

  throw new Error(`Invalid ${label}: ${String(value)}. Expected one of: ${values.join(", ")}`);
}

export function parseMemoryType(value: unknown): MemoryType {
  return parseEnum(value, MEMORY_TYPES, "memory type");
}

export function parseMemoryStatus(value: unknown): MemoryStatus {
  return parseEnum(value, MEMORY_STATUSES, "memory status");
}

export function parseMemorySource(value: unknown): MemorySource {
  return parseEnum(value, MEMORY_SOURCES, "memory source");
}

export function parseMemoryScope(value: unknown): MemoryScope {
  return parseEnum(value, MEMORY_SCOPES, "memory scope");
}

export function parseConfidenceLevel(value: unknown): ConfidenceLevel {
  return parseEnum(value, CONFIDENCE_LEVELS, "confidence level");
}

export function parseSeverityLevel(value: unknown): SeverityLevel {
  return parseEnum(value, SEVERITY_LEVELS, "severity level");
}

export function parsePreflightDecision(value: unknown): PreflightDecision {
  return parseEnum(value, PREFLIGHT_DECISIONS, "preflight decision");
}

export function parseCandidateType(value: unknown): CandidateType {
  return parseEnum(value, CANDIDATE_TYPES, "candidate type");
}

export function parseCandidateStatus(value: unknown): CandidateStatus {
  return parseEnum(value, CANDIDATE_STATUSES, "candidate status");
}

export function parseEvidenceEventType(value: unknown): EvidenceEventType {
  return parseEnum(value, EVIDENCE_EVENT_TYPES, "event type");
}

export function parseCommandPolicyMatchType(value: unknown): CommandPolicyMatchType {
  return parseEnum(value, COMMAND_POLICY_MATCH_TYPES, "command policy match type");
}

export function validateRegexPattern(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid regex pattern: ${message}`);
  }
}

export function assertNoObviousSecret(value: string): void {
  const patterns = [
    /\bapi[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_\-+/=]{20,}/i,
    /\bsecret\s*[=:]/i,
    /\bpassword\s*[=:]/i,
    /\btoken\s*[=:]/i,
    /\bBearer\s+ey[A-Za-z0-9_-]+/i,
    /\bsk-[A-Za-z0-9_-]+/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bghp_[A-Za-z0-9]{36}\b/,
    /\bgho_[A-Za-z0-9]{36}\b/,
    /\bghu_[A-Za-z0-9]{36}\b/,
    /\bxox[bprs]-[A-Za-z0-9-]+\b/,
    /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/,
    /AIza[0-9A-Za-z\-_]{35,}\b/,
    /\b(?:postgres|mysql|mongodb):\/\/[^:]+:[^@\s]+@/i
  ];

  if (patterns.some((pattern) => pattern.test(value))) {
    throw new Error("Candidate rejected by hygiene check: possible secret detected.");
  }
}

export function validateMemoryRecordForType(memory: { type: MemoryType; metadata: Record<string, unknown> }): void {
  if (memory.type !== "command_policy") {
    return;
  }

  const commandPattern = memory.metadata.commandPattern;
  if (typeof commandPattern !== "string" || commandPattern.trim().length === 0) {
    throw new Error("Missing required command policy metadata: commandPattern");
  }

  const matchType = parseCommandPolicyMatchType(memory.metadata.matchType ?? "substring");
  parsePreflightDecision(memory.metadata.decision ?? "warn");
  if (matchType === "regex") {
    validateRegexPattern(commandPattern);
  }
}
