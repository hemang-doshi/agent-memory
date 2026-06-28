export const MEMORY_TYPES = [
  "decision",
  "constraint",
  "preference",
  "command_policy",
  "failed_attempt",
  "known_fix",
  "agent_mistake",
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
  "quarantined",
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
export const EVIDENCE_EVENT_TYPES = [
  "test_result",
  "command_result",
  "user_correction",
  "agent_observation"
] as const;
export const RECEIPT_TYPES = [
  "session_started",
  "event_recorded",
  "pack_loaded",
  "preflight_checked",
  "warning_triggered",
  "block_triggered",
  "candidate_proposed",
  "candidate_reviewed",
  "evidence_recorded",
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
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];
export type ReceiptType = (typeof RECEIPT_TYPES)[number];
export type CandidateType = (typeof CANDIDATE_TYPES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type RetrievalMode = "deterministic" | "keyword" | "hybrid" | "vector";
export type RerankerMode = "none" | "noop" | "mock";
export type TrustLevel = "trusted" | "reviewed" | "low" | "untrusted";

export type JsonRecord = Record<string, unknown>;

export interface ProjectConfig {
  project_id?: string;
  project_name: string;
  memory_pack_token_budget: number;
  default_scope: MemoryScope;
  preflight: {
    enabled: boolean;
    default_decision: Exclude<PreflightDecision, "block">;
    enforce_warn_exit_code: number;
    enforce_block_exit_code: number;
  };
  retrieval: {
    include_unverified: boolean;
    include_stale: boolean;
    max_results: number;
    default_mode: RetrievalMode;
  };
  vector: {
    enabled: boolean;
    provider: "local" | "mock" | "external";
  };
  rerank: {
    enabled: boolean;
    provider: RerankerMode;
    timeout_ms: number;
  };
  mcp: {
    write_tools_enabled: boolean;
    candidate_approval_enabled: boolean;
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
  pinned: boolean;
  priority: number;
  useCount: number;
  lastRetrievedAt: string | null;
  lastInjectedAt: string | null;
  expiresAt: string | null;
  relatedMemoryIds: string[];
  supersedesMemoryId: string | null;
  conflictGroup: string | null;
  safetyFlags: string[];
  redactionStatus: "none" | "redacted" | "blocked";
  trustLevel: TrustLevel;
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
    | "pack_generated"
    | "evidence_recorded"
    | "reusable_observation"
    | EvidenceEventType;
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

export interface ProtocolComplianceReport {
  sessionId: string;
  task: string;
  status: "active" | "finished";
  compliant: boolean;
  required: {
    sessionStarted: boolean;
    packLoaded: boolean;
    sessionFinished: boolean;
  };
  activity: {
    memoriesInjected: string[];
    preflightChecks: number;
    warningsTriggered: number;
    blocksTriggered: number;
    eventsRecorded: number;
    candidatesProposed: number;
    candidatesReviewed: number;
  };
  receiptTypes: string[];
  missingCheckpoints: string[];
  notes: string[];
}

export interface ProtocolStartResult {
  sessionId: string;
  task: string;
  pack: {
    markdown: string;
    matchedMemoryIds: string[];
  };
  nextSteps: string[];
}

export interface DogfoodReport {
  sessionId: string;
  task: string;
  status: "active" | "finished";
  protocol: {
    compliant: boolean;
    missingCheckpoints: string[];
    required: {
      sessionStarted: boolean;
      packLoaded: boolean;
      sessionFinished: boolean;
    };
  };
  activity: {
    memoriesInjected: string[];
    preflightChecks: number;
    warningsTriggered: number;
    blocksTriggered: number;
    eventsRecorded: number;
    candidatesProposed: number;
    candidatesReviewed: number;
  };
  signals: {
    memoryUsed: boolean;
    preflightUsed: boolean;
    evidenceCaptured: boolean;
    learningCaptured: boolean;
    reviewHappened: boolean;
  };
  notes: string[];
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
  evidenceEventIds: string[];
  candidateStatus: CandidateStatus;
  proposedBy: "agent" | "user" | "system";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  targetMemoryId: string | null;
  metadata: JsonRecord;
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
  pinned?: boolean;
  priority?: number;
  expiresAt?: string | null;
  relatedMemoryIds?: string[];
  supersedesMemoryId?: string | null;
  conflictGroup?: string | null;
  safetyFlags?: string[];
  redactionStatus?: MemoryRecord["redactionStatus"];
  trustLevel?: TrustLevel;
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
  mode?: RetrievalMode;
  explain?: boolean;
  rerank?: boolean;
  reranker?: RerankerMode;
  dryRun?: boolean;
}

export interface PreflightResult {
  decision: PreflightDecision;
  reason: string;
  message: string;
  matchedMemoryIds: string[];
  suggestedAction?: string;
}

export interface ManagePlan {
  counts: Record<CandidateStatus, number>;
  proposedCandidates: Array<{
    candidateId: string;
    type: CandidateType;
    content: string;
    evidence: string;
    sessionId: string | null;
    createdAt: string;
  }>;
}
