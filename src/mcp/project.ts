import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { loadConfig, NOT_INITIALIZED_MESSAGE } from "../config/project-context.js";
import { summarizeSessionReceipts } from "../core/session-receipt.js";
import { AgentMemoryRepository } from "../db/repository.js";
import type { JsonRecord, MemoryRecord, ProjectRecord } from "../domain/types.js";
import { selectAgentVisibleMemories } from "../core/memory-visibility.js";

import { optionalBoolean, requireString } from "./params.js";
import {
  McpRequestError,
  type ExplainedMemory,
  type LoadedReadOnlyProject
} from "./types.js";

function findInitializedRoot(cwd: string): {
  root: string;
  memoryDir: string;
  storePath: string;
  configPath: string;
} | null {
  let current = resolve(cwd);

  while (true) {
    const memoryDir = join(current, ".agent-memory");
    const storePath = join(memoryDir, "memory.db");
    const configPath = join(memoryDir, "config.json");
    if (existsSync(storePath) && existsSync(configPath)) {
      return { root: current, memoryDir, storePath, configPath };
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function mapProjectRow(row: Record<string, unknown>): ProjectRecord {
  return {
    projectId: String(row.project_id),
    name: String(row.name),
    gitRoot: String(row.git_root),
    gitRemoteHash: row.git_remote_hash ? String(row.git_remote_hash) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    configPath: String(row.config_path)
  };
}

export function loadReadOnlyProject(cwd: string): LoadedReadOnlyProject {
  const initialized = findInitializedRoot(cwd);
  if (!initialized) {
    throw new McpRequestError("not_initialized", NOT_INITIALIZED_MESSAGE);
  }

  const config = loadConfig(initialized.configPath);
  const db = new DatabaseSync(initialized.storePath, { readOnly: true });
  db.exec("PRAGMA query_only = ON");

  try {
    const repo = new AgentMemoryRepository(db);
    const fallbackProjectRow = db
      .prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    const project =
      repo.getProjectByRoot(initialized.root) ??
      (fallbackProjectRow ? mapProjectRow(fallbackProjectRow) : null);
    if (!project) {
      throw new McpRequestError("not_initialized", NOT_INITIALIZED_MESSAGE);
    }

    return {
      cwd,
      root: initialized.root,
      memoryDir: initialized.memoryDir,
      storePath: initialized.storePath,
      configPath: initialized.configPath,
      config,
      project,
      repo,
      close: () => db.close()
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function projectInfo(loaded: LoadedReadOnlyProject): JsonRecord {
  return {
    project: {
      ...loaded.project,
      root: loaded.root,
      memoryDir: loaded.memoryDir,
      storePath: loaded.storePath,
      configPath: loaded.configPath
    },
    permissions: {
      writeToolsEnabled: loaded.config.mcp.write_tools_enabled,
      candidateApprovalEnabled: loaded.config.mcp.candidate_approval_enabled
    },
    readOnlyDefault: true,
    shellCommands: false
  };
}

export function listMemoriesReadOnly(
  loaded: LoadedReadOnlyProject,
  params: JsonRecord
): MemoryRecord[] {
  const activeOnly = optionalBoolean(params, "activeOnly", true);
  const type = params.type;
  if (type !== undefined && typeof type !== "string") {
    throw new McpRequestError("invalid_request", "MCP parameter must be a string: type.");
  }

  const memories = loaded.repo.listMemories(loaded.project.projectId);
  const visibleDefaults = selectAgentVisibleMemories({
    memories,
    config: loaded.config
  });

  return visibleDefaults.filter((memory) => {
    if (type && memory.type !== type) {
      return false;
    }
    if (activeOnly && memory.status !== "active") {
      return false;
    }
    return true;
  });
}

export function explainReadOnly(
  loaded: LoadedReadOnlyProject,
  params: JsonRecord
): ExplainedMemory {
  const memoryId = requireString(params, "memoryId");
  const memory = loaded.repo.getMemory(memoryId);
  if (!memory || memory.projectId !== loaded.project.projectId) {
    throw new McpRequestError("invalid_request", `Memory not found: ${memoryId}`);
  }
  return {
    memory,
    relatedEvents: loaded.repo.listEvents(loaded.project.projectId, memoryId)
  };
}

export function sessionReceiptReadOnly(loaded: LoadedReadOnlyProject, params: JsonRecord) {
  const sessionId = requireString(params, "sessionId");
  const session = loaded.repo.getSession(sessionId);
  if (!session || session.projectId !== loaded.project.projectId) {
    throw new McpRequestError("invalid_request", `Unknown session: ${sessionId}`);
  }
  const receipts = loaded.repo.listProtocolReceipts(loaded.project.projectId, sessionId);
  return summarizeSessionReceipts({
    sessionId,
    task: session.task,
    status: session.status,
    receipts
  });
}
