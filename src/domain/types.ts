export const MEMORY_TYPES = [
  "decision",
  "constraint",
  "preference",
  "command_policy",
  "failed_attempt",
  "known_fix",
  "fragile_file",
  "workflow_rule",
  "architecture_note",
  "design_rule",
  "rejected_approach",
  "pending_task",
  "tool_quirk"
] as const;

export const MEMORY_STATUSES = [
  "active",
  "unverified",
  "stale",
  "superseded",
  "rejected",
  "archived"
] as const;

export const MEMORY_SOURCES = [
  "user_explicit",
  "agent_reported",
  "cli",
  "imported_doc",
  "command_event",
  "manual_edit"
] as const;

export const MEMORY_SCOPES = [
  "global",
  "user",
  "project",
  "workspace",
  "path",
  "task"
] as const;

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const SEVERITY_LEVELS = ["low", "medium", "high"] as const;
export const PREFLIGHT_DECISIONS = ["allow", "warn", "block"] as const;
export const SESSION_STATUSES = ["active", "finished"] as const;
export const RECEIPT_TYPES = [
  "session_started",
  "pack_loaded",
  "preflight_checked",
  "warning_triggered",
  "block_triggered",
  "candidate_proposed",
  "session_finished"
] as const;
export const CANDIDATE_TYPES = [
  "failed_attempt",
  "known_fix",
  "agent_mistake",
  "workflow_rule",
  "command_policy"
] as const;
export const CANDIDATE_STATUSES = [
  "proposed",
  "approved",
  "rejected",
  "merged",
  "superseded",
  "expired"
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type MemorySource = (typeof MEMORY_SOURCES)[number];
export type MemoryScope = (typeof MEMORY_SCOPES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export type PreflightDecision = (typeof PREFLIGHT_DECISIONS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type ReceiptType = (typeof RECEIPT_TYPES)[number];
export type CandidateType = (typeof CANDIDATE_TYPES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type JsonRecord = Record<string, unknown>;

export interface ProjectConfig {
  project_name: string;
  memory_pack_token_budget: number;
  default_scope: MemoryScope;
  preflight: {
    enabled: boolean;
    default_decision: Exclude<PreflightDecision, "block">;
    block_requires_explicit_policy: boolean;
  };
  retrieval: {
    include_unverified: boolean;
    include_stale: boolean;
    max_results: number;
  };
}

export interface ProjectRecord {
  projectId: string;
  name: string;
  gitRoot: string;
  gitRemoteHash: string | null;
  createdAt: string;
  updatedAt: string;
  configPath: string;
}

export interface MemoryRecord {
  id: string;
  projectId: string | null;
  scope: MemoryScope;
  type: MemoryType;
  content: string;
  summary: string | null;
  status: MemoryStatus;
  confidence: ConfidenceLevel;
  source: MemorySource;
  paths: string[];
  tags: string[];
  severity: SeverityLevel;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  relatedMemoryIds: string[];
  supersedesMemoryId: string | null;
  metadata: JsonRecord;
}

export interface EventRecord {
  eventId: string;
  projectId: string;
  eventType:
    | "memory_created"
    | "memory_updated"
    | "command_preflighted"
    | "memory_retrieved"
    | "memory_marked_stale"
    | "pack_generated";
  timestamp: string;
  actor: "user" | "agent" | "system";
  payload: JsonRecord;
}

export interface SessionRecord {
  sessionId: string;
  projectId: string;
  task: string;
  status: SessionStatus;
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
}

export interface ProtocolReceiptRecord {
  receiptId: string;
  projectId: string;
  sessionId: string | null;
  receiptType: ReceiptType;
  payload: JsonRecord;
  createdAt: string;
}

export interface MemoryCandidateRecord {
  candidateId: string;
  projectId: string;
  sessionId: string | null;
  type: CandidateType;
  content: string;
  scope: MemoryScope;
  source: MemorySource;
  confidence: ConfidenceLevel;
  severity: SeverityLevel;
  evidence: string;
  candidateStatus: CandidateStatus;
  proposedBy: "agent" | "user" | "system";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  targetMemoryId: string | null;
}

export interface InitProjectResult {
  projectId: string;
  name: string;
  gitRoot: string;
  storePath: string;
  configPath: string;
  warning?: string;
}

export interface CreateMemoryInput {
  cwd: string;
  content: string;
  type: MemoryType;
  source: MemorySource;
  scope?: MemoryScope;
  summary?: string | null;
  confidence?: ConfidenceLevel;
  paths?: string[];
  tags?: string[];
  severity?: SeverityLevel;
  expiresAt?: string | null;
  relatedMemoryIds?: string[];
  supersedesMemoryId?: string | null;
  metadata?: JsonRecord;
  status?: MemoryStatus;
}

export interface SearchMemoryInput {
  cwd: string;
  query: string;
  type?: MemoryType;
  path?: string;
  tag?: string;
  activeOnly?: boolean;
}

export interface RetrieveMemoriesInput {
  cwd: string;
  task: string;
  files?: string[];
  command?: string;
  maxResults?: number;
}

export interface PreflightResult {
  decision: PreflightDecision;
  reason: string;
  message: string;
  matchedMemoryIds: string[];
  suggestedAction?: string;
}
