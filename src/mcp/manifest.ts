import type { JsonRecord, ProjectConfig } from "../domain/types.js";

import type { LoadedReadOnlyProject, McpManifest, McpResourceDefinition, McpToolDefinition } from "./types.js";

export const MCP_RESOURCE_URIS = {
  project: "agent-memory://project",
  memories: "agent-memory://memories",
  pack: "agent-memory://pack",
  sessionReceipt: "agent-memory://session/receipt",
  candidates: "agent-memory://candidates",
  scan: "agent-memory://scan",
  retrievalExplanation: "agent-memory://retrieval/explanation"
} as const;

export const MCP_TOOL_NAMES = {
  project: "agent_memory_project",
  listMemories: "agent_memory_list_memories",
  retrieve: "agent_memory_retrieve",
  explain: "agent_memory_explain",
  pack: "agent_memory_pack",
  sessionReceipt: "agent_memory_session_receipt",
  listCandidates: "agent_memory_list_candidates",
  scan: "agent_memory_scan",
  protocolStart: "agent_memory_protocol_start",
  inject: "agent_memory_inject",
  preflight: "agent_memory_preflight",
  eventRecord: "agent_memory_event_record",
  protocolCheck: "agent_memory_protocol_check",
  createMemory: "agent_memory_create_memory",
  updateMemory: "agent_memory_update_memory",
  forgetMemory: "agent_memory_forget_memory",
  proposeCandidate: "agent_memory_candidate_propose",
  rejectCandidate: "agent_memory_candidate_reject",
  approveCandidate: "agent_memory_candidate_approve"
} as const;

export const RESOURCE_DEFINITIONS: McpResourceDefinition[] = [
  {
    uri: MCP_RESOURCE_URIS.project,
    name: "project",
    description: "Current Agent Memory project metadata and MCP permission state.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.memories,
    name: "memories",
    description: "Project memory records visible from the local store.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.pack,
    name: "pack",
    description: "Read-only project memory pack for a task.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.sessionReceipt,
    name: "session receipt",
    description: "Protocol receipt summary for a session.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.candidates,
    name: "candidates",
    description: "Memory candidates and review status.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.scan,
    name: "scan",
    description: "Read-only safety scan over stored memories, events, and candidates.",
    mimeType: "application/json",
    readOnly: true
  },
  {
    uri: MCP_RESOURCE_URIS.retrievalExplanation,
    name: "retrieval explanation",
    description: "Explanation data for why a memory was retrieved or recorded.",
    mimeType: "application/json",
    readOnly: true
  }
];

export const TOOL_ALIASES = new Map<string, string>([
  ["project", MCP_TOOL_NAMES.project],
  ["project.info", MCP_TOOL_NAMES.project],
  ["memory.list", MCP_TOOL_NAMES.listMemories],
  ["memories.list", MCP_TOOL_NAMES.listMemories],
  ["memory.retrieve", MCP_TOOL_NAMES.retrieve],
  ["retrieve", MCP_TOOL_NAMES.retrieve],
  ["retrieval.explain", MCP_TOOL_NAMES.explain],
  ["memory.explain", MCP_TOOL_NAMES.explain],
  ["explain", MCP_TOOL_NAMES.explain],
  ["pack.generate", MCP_TOOL_NAMES.pack],
  ["pack", MCP_TOOL_NAMES.pack],
  ["session.receipt", MCP_TOOL_NAMES.sessionReceipt],
  ["candidates.list", MCP_TOOL_NAMES.listCandidates],
  ["candidate.list", MCP_TOOL_NAMES.listCandidates],
  ["scan", MCP_TOOL_NAMES.scan],
  ["scan.safety", MCP_TOOL_NAMES.scan],
  ["protocol.start", MCP_TOOL_NAMES.protocolStart],
  ["inject", MCP_TOOL_NAMES.inject],
  ["memory.inject", MCP_TOOL_NAMES.inject],
  ["preflight", MCP_TOOL_NAMES.preflight],
  ["command.preflight", MCP_TOOL_NAMES.preflight],
  ["event.record", MCP_TOOL_NAMES.eventRecord],
  ["protocol.check", MCP_TOOL_NAMES.protocolCheck],
  ["memory.create", MCP_TOOL_NAMES.createMemory],
  ["memory.update", MCP_TOOL_NAMES.updateMemory],
  ["memory.forget", MCP_TOOL_NAMES.forgetMemory],
  ["candidate.propose", MCP_TOOL_NAMES.proposeCandidate],
  ["candidate.reject", MCP_TOOL_NAMES.rejectCandidate],
  ["candidate.approve", MCP_TOOL_NAMES.approveCandidate]
]);

export function normalizeToolName(name: string): string {
  return TOOL_ALIASES.get(name) ?? name;
}

export function isKnownToolName(name: string): boolean {
  const normalized = normalizeToolName(name);
  return [...READ_TOOL_DEFINITIONS, ...WRITE_TOOL_DEFINITIONS].some(
    (tool) => tool.name === normalized
  );
}

export function buildTools(config: ProjectConfig): McpToolDefinition[] {
  return [
    ...READ_TOOL_DEFINITIONS.map((tool) => ({ ...tool, enabled: true })),
    ...WRITE_TOOL_DEFINITIONS.map((tool) => ({
      ...tool,
      enabled:
        tool.permission === "candidate_approval"
          ? config.mcp.write_tools_enabled && config.mcp.candidate_approval_enabled
          : config.mcp.write_tools_enabled
    }))
  ];
}

export function buildManifest(loaded: LoadedReadOnlyProject): McpManifest {
  return {
    schemaVersion: "agent-memory.mcp.manifest.v1",
    server: {
      name: "agent-memory",
      version: "v2",
      readOnlyDefault: true,
      shellCommands: false
    },
    project: {
      projectId: loaded.project.projectId,
      name: loaded.project.name,
      root: loaded.root,
      configPath: loaded.configPath
    },
    permissions: {
      writeToolsEnabled: loaded.config.mcp.write_tools_enabled,
      candidateApprovalEnabled: loaded.config.mcp.candidate_approval_enabled
    },
    resources: RESOURCE_DEFINITIONS,
    tools: buildTools(loaded.config)
  };
}

function objectSchema(properties: JsonRecord): JsonRecord {
  return {
    type: "object",
    properties,
    additionalProperties: true
  };
}

const READ_TOOL_DEFINITIONS: Omit<McpToolDefinition, "enabled">[] = [
  {
    name: MCP_TOOL_NAMES.project,
    title: "Project Info",
    description: "Return Agent Memory project metadata and MCP permission state.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({})
  },
  {
    name: MCP_TOOL_NAMES.listMemories,
    title: "List Memories",
    description: "List project memories, optionally filtered by active status.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ activeOnly: { type: "boolean", default: true }, type: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.retrieve,
    title: "Retrieve Memories",
    description: "Retrieve relevant memories for a task without executing shell commands.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({
      task: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      command: { type: "string" },
      maxResults: { type: "number" },
      mode: { type: "string", enum: ["deterministic", "keyword", "hybrid"] }
    })
  },
  {
    name: MCP_TOOL_NAMES.explain,
    title: "Explain Memory",
    description: "Return one memory and related events that explain its provenance and retrieval.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ memoryId: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.pack,
    title: "Generate Memory Pack",
    description: "Generate a read-only memory pack for a task.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({
      task: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      command: { type: "string" }
    })
  },
  {
    name: MCP_TOOL_NAMES.sessionReceipt,
    title: "Session Receipt",
    description: "Summarize protocol receipts for a session.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ sessionId: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.listCandidates,
    title: "List Candidates",
    description: "List memory candidates, optionally filtered by review status.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ status: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.scan,
    title: "Safety Scan",
    description: "Scan stored memory data for secrets and optionally prompt-injection patterns.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ deep: { type: "boolean", default: false } })
  },
  {
    name: MCP_TOOL_NAMES.protocolCheck,
    title: "Protocol Check",
    description: "Read protocol compliance receipts for a session.",
    readOnly: true,
    permission: "read",
    inputSchema: objectSchema({ sessionId: { type: "string" } })
  }
];

const WRITE_TOOL_DEFINITIONS: Omit<McpToolDefinition, "enabled">[] = [
  {
    name: MCP_TOOL_NAMES.protocolStart,
    title: "Protocol Start",
    description: "Start a protocol session and write session/pack receipts. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ task: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.inject,
    title: "Inject Memory Pack",
    description: "Generate and receipt a session-aware memory pack. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({
      task: { type: "string" },
      sessionId: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      command: { type: "string" }
    })
  },
  {
    name: MCP_TOOL_NAMES.preflight,
    title: "Preflight Command",
    description: "Run deterministic command policy preflight and write receipts when sessionId is supplied. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ command: { type: "string" }, sessionId: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.eventRecord,
    title: "Record Event",
    description: "Record evidence in a protocol session. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({
      sessionId: { type: "string" },
      type: { type: "string" },
      summary: { type: "string" },
      command: { type: "string" },
      exitCode: { type: "number" }
    })
  },
  {
    name: MCP_TOOL_NAMES.createMemory,
    title: "Create Memory",
    description: "Write a trusted memory record. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ content: { type: "string" }, type: { type: "string" }, source: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.updateMemory,
    title: "Update Memory",
    description: "Update a trusted memory record. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ memoryId: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.forgetMemory,
    title: "Forget Memory",
    description: "Archive a memory record. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ memoryId: { type: "string" }, reason: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.proposeCandidate,
    title: "Propose Candidate",
    description: "Propose a memory candidate. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({
      sessionId: { type: "string" },
      type: { type: "string" },
      content: { type: "string" },
      evidence: { type: "string" }
    })
  },
  {
    name: MCP_TOOL_NAMES.rejectCandidate,
    title: "Reject Candidate",
    description: "Reject a memory candidate. Disabled unless mcp.write_tools_enabled is true.",
    readOnly: false,
    permission: "write",
    inputSchema: objectSchema({ candidateId: { type: "string" }, reason: { type: "string" } })
  },
  {
    name: MCP_TOOL_NAMES.approveCandidate,
    title: "Approve Candidate",
    description:
      "Approve a memory candidate. Disabled unless both write tools and MCP candidate approval are enabled.",
    readOnly: false,
    permission: "candidate_approval",
    inputSchema: objectSchema({ candidateId: { type: "string" } })
  }
];
