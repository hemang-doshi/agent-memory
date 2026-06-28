import type {
  EventRecord,
  JsonRecord,
  MemoryRecord,
  ProjectConfig,
  ProjectRecord,
  RetrievalMode
} from "../domain/types.js";
import type { AgentMemoryRepository } from "../db/repository.js";
import type { PackSection } from "../formatters/pack-markdown.js";

export type McpErrorCode =
  | "not_initialized"
  | "invalid_request"
  | "unknown_method"
  | "unknown_tool"
  | "unknown_resource"
  | "write_disabled"
  | "candidate_approval_disabled"
  | "unsupported";

export class McpRequestError extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = "McpRequestError";
    this.code = code;
  }
}

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  enabled: boolean;
  permission?: "read" | "write" | "candidate_approval";
  inputSchema: JsonRecord;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json" | "text/markdown";
  readOnly: true;
}

export interface McpManifest {
  schemaVersion: "agent-memory.mcp.manifest.v1";
  server: {
    name: "agent-memory";
    version: "v2";
    readOnlyDefault: true;
    shellCommands: false;
  };
  project: {
    projectId: string;
    name: string;
    root: string;
    configPath: string;
  };
  permissions: {
    writeToolsEnabled: boolean;
    candidateApprovalEnabled: boolean;
  };
  resources: McpResourceDefinition[];
  tools: McpToolDefinition[];
}

export interface McpRequest {
  cwd: string;
  method: string;
  params?: unknown;
}

export interface LoadedReadOnlyProject {
  cwd: string;
  root: string;
  memoryDir: string;
  storePath: string;
  configPath: string;
  config: ProjectConfig;
  project: ProjectRecord;
  repo: AgentMemoryRepository;
  close: () => void;
}

export interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
  signals: {
    tokenOverlap: number;
    pathMatch: boolean;
    tagMatch: boolean;
    commandMatch: boolean;
    pinned: boolean;
    priority: number;
    recencyBoost: number;
    useCountBoost: number;
    mistakeBoost: boolean;
    conflictWinner: boolean;
    keywordMatch?: boolean;
    keywordRank?: number;
    vectorMatch?: boolean;
    vectorScore?: number;
    modes?: RetrievalMode[];
  };
  reason: string;
}

export interface RetrievalInput {
  task: string;
  files?: string[];
  command?: string;
  maxResults?: number;
  mode?: RetrievalMode;
}

export interface McpPackResult {
  schemaVersion: "agent-memory.packet.v1";
  project: string;
  task: string;
  generatedAt: string;
  scope: string;
  safety: string;
  sections: PackSection[];
  markdown: string;
  matchedMemoryIds: string[];
}

export interface McpScanFinding {
  source: string;
  id: string;
  field: string;
  label: string;
  severity: "low" | "medium" | "high";
}

export interface McpScanResult {
  findings: McpScanFinding[];
  summary: string;
}

export interface ExplainedMemory {
  memory: MemoryRecord;
  relatedEvents: EventRecord[];
}
