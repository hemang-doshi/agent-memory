import type { JsonRecord } from "../domain/types.js";
import { approveCandidate } from "../core/candidate-approve.js";
import { proposeCandidate } from "../core/candidate-propose.js";
import { rejectCandidate } from "../core/candidate-reject.js";
import { checkProtocolCompliance } from "../core/protocol-check.js";
import { startProtocol } from "../core/protocol-start.js";
import { createMemory } from "../core/create-memory.js";
import { forgetMemory } from "../core/forget-memory.js";
import { generatePack } from "../core/generate-pack.js";
import { preflightCommand } from "../core/preflight-command.js";
import { recordEvidenceEvent } from "../core/record-event.js";
import { updateMemory } from "../core/update-memory.js";
import {
  parseCandidateType,
  parseEvidenceEventType,
  parseMemorySource,
  parseMemoryStatus,
  parseMemoryType
} from "../domain/validators.js";

import {
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  RESOURCE_DEFINITIONS,
  buildManifest,
  buildTools,
  isKnownToolName,
  normalizeToolName
} from "./manifest.js";
import {
  asObject,
  optionalNumber,
  optionalString,
  optionalStringArray,
  optionalBoolean,
  optionalCandidateStatus,
  requireString,
  retrievalInputFromParams
} from "./params.js";
import {
  explainReadOnly,
  listMemoriesReadOnly,
  loadReadOnlyProject,
  projectInfo,
  sessionReceiptReadOnly
} from "./project.js";
import { generatePackReadOnly, retrieveReadOnly } from "./retrieval.js";
import { scanReadOnly } from "./scan.js";
import { McpRequestError, type LoadedReadOnlyProject, type McpManifest, type McpRequest } from "./types.js";

export {
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  McpRequestError
};
export type {
  McpManifest,
  McpPackResult,
  McpRequest,
  McpResourceDefinition,
  McpScanFinding,
  McpScanResult,
  McpToolDefinition
} from "./types.js";

function assertWriteAllowed(loaded: LoadedReadOnlyProject, toolName: string): void {
  if (!loaded.config.mcp.write_tools_enabled) {
    throw new McpRequestError(
      "write_disabled",
      `MCP write tool is disabled by project config: ${toolName}. Set mcp.write_tools_enabled to true to enable write tools.`
    );
  }
}

function assertCandidateApprovalAllowed(loaded: LoadedReadOnlyProject, toolName: string): void {
  assertWriteAllowed(loaded, toolName);
  if (!loaded.config.mcp.candidate_approval_enabled) {
    throw new McpRequestError(
      "candidate_approval_disabled",
      "MCP candidate approval is disabled by project config. Set mcp.candidate_approval_enabled to true to enable candidate approval."
    );
  }
}

async function callTool(
  loaded: LoadedReadOnlyProject,
  toolName: string,
  rawParams: JsonRecord
): Promise<unknown> {
  const name = normalizeToolName(toolName);

  switch (name) {
    case MCP_TOOL_NAMES.project:
      return projectInfo(loaded);
    case MCP_TOOL_NAMES.listMemories:
      return listMemoriesReadOnly(loaded, rawParams);
    case MCP_TOOL_NAMES.retrieve:
      return retrieveReadOnly(loaded, retrievalInputFromParams(rawParams));
    case MCP_TOOL_NAMES.explain:
      return explainReadOnly(loaded, rawParams);
    case MCP_TOOL_NAMES.pack:
      return generatePackReadOnly(loaded, retrievalInputFromParams(rawParams));
    case MCP_TOOL_NAMES.sessionReceipt:
      return sessionReceiptReadOnly(loaded, rawParams);
    case MCP_TOOL_NAMES.listCandidates:
      return loaded.repo.listMemoryCandidates(
        loaded.project.projectId,
        optionalCandidateStatus(rawParams)
      );
    case MCP_TOOL_NAMES.scan:
      return scanReadOnly(loaded, optionalBoolean(rawParams, "deep", false));
    case MCP_TOOL_NAMES.protocolCheck:
      return checkProtocolCompliance({
        cwd: loaded.cwd,
        sessionId: requireString(rawParams, "sessionId")
      });
    case MCP_TOOL_NAMES.protocolStart:
      assertWriteAllowed(loaded, name);
      return startProtocol({
        cwd: loaded.cwd,
        task: requireString(rawParams, "task")
      });
    case MCP_TOOL_NAMES.inject:
      assertWriteAllowed(loaded, name);
      return generatePack({
        cwd: loaded.cwd,
        task: requireString(rawParams, "task"),
        sessionId: optionalString(rawParams, "sessionId"),
        files: optionalStringArray(rawParams, "files"),
        command: optionalString(rawParams, "command")
      });
    case MCP_TOOL_NAMES.preflight:
      assertWriteAllowed(loaded, name);
      return preflightCommand({
        cwd: loaded.cwd,
        command: requireString(rawParams, "command"),
        sessionId: optionalString(rawParams, "sessionId")
      });
    case MCP_TOOL_NAMES.eventRecord:
      assertWriteAllowed(loaded, name);
      return recordEvidenceEvent({
        cwd: loaded.cwd,
        sessionId: requireString(rawParams, "sessionId"),
        type: parseEvidenceEventType(requireString(rawParams, "type")),
        summary: requireString(rawParams, "summary"),
        command: optionalString(rawParams, "command"),
        exitCode: optionalNumber(rawParams, "exitCode")
      });
    case MCP_TOOL_NAMES.createMemory:
      assertWriteAllowed(loaded, name);
      return createMemory({
        cwd: loaded.cwd,
        content: requireString(rawParams, "content"),
        type: parseMemoryType(requireString(rawParams, "type")),
        source: parseMemorySource(optionalString(rawParams, "source") ?? "cli")
      });
    case MCP_TOOL_NAMES.updateMemory:
      assertWriteAllowed(loaded, name);
      return updateMemory({
        cwd: loaded.cwd,
        memoryId: requireString(rawParams, "memoryId"),
        reason: requireString(rawParams, "reason"),
        content: optionalString(rawParams, "content"),
        type:
          optionalString(rawParams, "type") === undefined
            ? undefined
            : parseMemoryType(optionalString(rawParams, "type")),
        status:
          optionalString(rawParams, "status") === undefined
            ? undefined
            : parseMemoryStatus(optionalString(rawParams, "status"))
      });
    case MCP_TOOL_NAMES.forgetMemory:
      assertWriteAllowed(loaded, name);
      return forgetMemory({
        cwd: loaded.cwd,
        memoryId: requireString(rawParams, "memoryId"),
        reason: requireString(rawParams, "reason")
      });
    case MCP_TOOL_NAMES.proposeCandidate:
      assertWriteAllowed(loaded, name);
      return proposeCandidate({
        cwd: loaded.cwd,
        sessionId: requireString(rawParams, "sessionId"),
        type: parseCandidateType(requireString(rawParams, "type")),
        content: requireString(rawParams, "content"),
        evidence: optionalString(rawParams, "evidence"),
        evidenceEventId: optionalString(rawParams, "evidenceEventId")
      });
    case MCP_TOOL_NAMES.rejectCandidate:
      assertWriteAllowed(loaded, name);
      return rejectCandidate({
        cwd: loaded.cwd,
        candidateId: requireString(rawParams, "candidateId"),
        reason: requireString(rawParams, "reason")
      });
    case MCP_TOOL_NAMES.approveCandidate:
      assertCandidateApprovalAllowed(loaded, name);
      return approveCandidate({
        cwd: loaded.cwd,
        candidateId: requireString(rawParams, "candidateId"),
        reason: requireString(rawParams, "reason")
      });
    default:
      throw new McpRequestError("unknown_tool", `Unknown MCP tool: ${toolName}`);
  }
}

function readResource(loaded: LoadedReadOnlyProject, params: JsonRecord): unknown {
  const uri = requireString(params, "uri");
  switch (uri) {
    case MCP_RESOURCE_URIS.project:
      return projectInfo(loaded);
    case MCP_RESOURCE_URIS.memories:
      return listMemoriesReadOnly(loaded, params);
    case MCP_RESOURCE_URIS.pack:
      return generatePackReadOnly(loaded, retrievalInputFromParams(params));
    case MCP_RESOURCE_URIS.sessionReceipt:
      return sessionReceiptReadOnly(loaded, params);
    case MCP_RESOURCE_URIS.candidates:
      return loaded.repo.listMemoryCandidates(loaded.project.projectId, optionalCandidateStatus(params));
    case MCP_RESOURCE_URIS.scan:
      return scanReadOnly(loaded, optionalBoolean(params, "deep", false));
    case MCP_RESOURCE_URIS.retrievalExplanation:
      if (typeof params.memoryId === "string") {
        return explainReadOnly(loaded, params);
      }
      return retrieveReadOnly(loaded, retrievalInputFromParams(params));
    default:
      throw new McpRequestError("unknown_resource", `Unknown MCP resource: ${uri}`);
  }
}

export async function getMcpManifest({ cwd }: { cwd: string }): Promise<McpManifest> {
  const loaded = loadReadOnlyProject(cwd);
  try {
    return buildManifest(loaded);
  } finally {
    loaded.close();
  }
}

export async function handleMcpRequest({ cwd, method, params }: McpRequest): Promise<unknown> {
  const normalizedMethod = method.trim();
  const requestParams = asObject(params);

  if (
    normalizedMethod === "manifest" ||
    normalizedMethod === "mcp/manifest" ||
    normalizedMethod === "initialize"
  ) {
    return getMcpManifest({ cwd });
  }

  const loaded = loadReadOnlyProject(cwd);
  try {
    if (normalizedMethod === "tools/list") {
      return { tools: buildTools(loaded.config) };
    }
    if (normalizedMethod === "resources/list") {
      return { resources: RESOURCE_DEFINITIONS };
    }
    if (normalizedMethod === "resources/read") {
      return readResource(loaded, requestParams);
    }
    if (normalizedMethod === "tools/call") {
      const name = requireString(requestParams, "name");
      const toolParams = asObject(requestParams.arguments ?? requestParams.args ?? {}, "arguments");
      return await callTool(loaded, name, toolParams);
    }
    if (isKnownToolName(normalizedMethod)) {
      return await callTool(loaded, normalizedMethod, requestParams);
    }
  } finally {
    loaded.close();
  }

  throw new McpRequestError("unknown_method", `Unknown MCP method: ${method}`);
}
