import type {
  CandidateType,
  ConfidenceLevel,
  EvidenceEventType,
  JsonRecord,
  MemoryScope,
  MemorySource,
  MemoryStatus,
  MemoryType,
  PreflightDecision,
  SeverityLevel
} from "../../domain/types.js";

export const BENCHMARK_SCHEMA = "agent-memory-benchmark/v1" as const;

export interface BenchmarkMemoryInput {
  type: MemoryType;
  content: string;
  source?: MemorySource;
  scope?: MemoryScope;
  summary?: string | null;
  confidence?: ConfidenceLevel;
  paths?: string[];
  tags?: string[];
  severity?: SeverityLevel;
  metadata?: JsonRecord;
  status?: MemoryStatus;
}

export interface BenchmarkEventInput {
  type: EvidenceEventType;
  summary: string;
  command?: string;
  exitCode?: number;
}

export interface BenchmarkPreflightInput {
  command: string;
  expectDecision?: PreflightDecision;
  expectMatchedMemoryIdsAtLeast?: number;
}

export interface BenchmarkCandidateInput {
  type: CandidateType;
  content: string;
  evidence?: string;
  evidenceEventIndex?: number;
}

export interface BenchmarkPreflightExpectation {
  command: string;
  decision: PreflightDecision;
  matchedMemoryIdsAtLeast?: number;
}

export interface BenchmarkExpectations {
  packIncludes?: string[];
  packExcludes?: string[];
  matchedMemoryCountAtLeast?: number;
  matchedMemoryCountAtMost?: number;
  maxNoiseCount?: number;
  preflight?: BenchmarkPreflightExpectation[];
  candidateCount?: number;
  receiptTypes?: string[];
  receiptTypesAbsent?: string[];
}

export interface BenchmarkFixture {
  schema: typeof BENCHMARK_SCHEMA;
  name: string;
  description?: string;
  task: string;
  packTask?: string;
  memories: BenchmarkMemoryInput[];
  events: BenchmarkEventInput[];
  preflightCommands: BenchmarkPreflightInput[];
  candidates: BenchmarkCandidateInput[];
  expectations: BenchmarkExpectations;
}

export interface BenchmarkCheck {
  name: string;
  passed: boolean;
  message?: string;
}

export interface BenchmarkResult {
  name: string;
  passed: boolean;
  checks: BenchmarkCheck[];
  sessionId: string;
  matchedMemoryIds: string[];
  preflightResults: Array<{
    command: string;
    decision: PreflightDecision;
    matchedMemoryIds: string[];
  }>;
  candidateIds: string[];
  candidateEvidenceEventIds: string[][];
  receiptTypes: string[];
  notes: string[];
}

export interface BenchmarkRunReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  results: BenchmarkResult[];
}
