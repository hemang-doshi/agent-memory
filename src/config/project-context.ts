import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { execFile as rawExecFile } from "node:child_process";
import { promisify } from "node:util";

import { DEFAULT_PROJECT_CONFIG } from "../domain/defaults.js";
import type { InitProjectResult, ProjectConfig, ProjectRecord, RerankerMode, RetrievalMode } from "../domain/types.js";
import { parseMemoryScope, parsePreflightDecision } from "../domain/validators.js";

const execFile = promisify(rawExecFile);

function parseDefaultPreflightDecision(value: unknown): ProjectConfig["preflight"]["default_decision"] {
  const parsed = parsePreflightDecision(value);
  if (parsed === "block") {
    throw new Error("Invalid preflight.default_decision: block. Expected one of: allow, warn");
  }

  return parsed;
}

function parseVectorProvider(value: unknown): ProjectConfig["vector"]["provider"] {
  if (value === "local" || value === "mock" || value === "external") {
    return value;
  }
  throw new Error(`Invalid vector.provider: ${String(value)}. Expected one of: local, mock, external`);
}

function parseRerankerProvider(value: unknown): RerankerMode {
  if (value === "none" || value === "noop" || value === "mock") {
    return value;
  }
  throw new Error(`Invalid rerank.provider: ${String(value)}. Expected one of: none, noop, mock`);
}

function parseRetrievalMode(value: unknown): RetrievalMode {
  if (value === "deterministic" || value === "keyword" || value === "hybrid" || value === "vector") {
    return value;
  }
  throw new Error(`Invalid retrieval.default_mode: ${String(value)}. Expected one of: deterministic, keyword, hybrid, vector`);
}

export interface ProjectContext {
  cwd: string;
  gitRoot: string;
  isGitBacked: boolean;
  memoryDir: string;
  storePath: string;
  configPath: string;
  config: ProjectConfig;
  warning?: string;
}

export const NOT_INITIALIZED_MESSAGE =
  "Agent Memory is not initialized for this project. Run `agentmem init` first.";

export interface InitProjectContextOptions {
  gitInit?: boolean;
}

export async function initProjectContext(
  cwd: string,
  options: InitProjectContextOptions = {}
): Promise<ProjectContext> {
  if (options.gitInit && !(await isInsideGitRepo(cwd))) {
    await initializeGitRepo(cwd);
  }

  const { gitRoot, isGitBacked } = await resolveProjectRoot(cwd);
  const memoryDir = join(gitRoot, ".agent-memory");
  const storePath = join(memoryDir, "memory.db");
  const configPath = join(memoryDir, "config.json");
  const warning = isGitBacked
    ? undefined
    : "Warning: not inside a Git repository. Make sure `.agent-memory/` is not committed if you later initialize Git.";

  mkdirSync(memoryDir, { recursive: true });
  const config = ensureConfig(configPath, gitRoot);
  if (isGitBacked) {
    await ensureAgentMemoryExcluded(gitRoot);
  }

  return { cwd, gitRoot, isGitBacked, memoryDir, storePath, configPath, config, warning };
}

export async function loadExistingProjectContext(cwd: string): Promise<ProjectContext> {
  const { gitRoot, isGitBacked } = await resolveProjectRoot(cwd);
  const memoryDir = join(gitRoot, ".agent-memory");
  const storePath = join(memoryDir, "memory.db");
  const configPath = join(memoryDir, "config.json");

  if (!existsSync(configPath) || !existsSync(storePath)) {
    throw new Error(NOT_INITIALIZED_MESSAGE);
  }

  const config = loadConfig(configPath);
  return { cwd, gitRoot, isGitBacked, memoryDir, storePath, configPath, config };
}

export async function initializeGitRepo(cwd: string): Promise<void> {
  if (await isInsideGitRepo(cwd)) {
    return;
  }

  await execFile("git", ["init", "-b", "main"], { cwd });
}

export async function isInsideGitRepo(cwd: string): Promise<boolean> {
  try {
    const result = await execFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function resolveProjectRoot(cwd: string): Promise<{ gitRoot: string; isGitBacked: boolean }> {
  try {
    const result = await execFile("git", ["rev-parse", "--show-toplevel"], { cwd });
    return { gitRoot: result.stdout.trim() || cwd, isGitBacked: true };
  } catch {
    return { gitRoot: cwd, isGitBacked: false };
  }
}

export async function resolveGitRoot(cwd: string): Promise<string> {
  return (await resolveProjectRoot(cwd)).gitRoot;
}

export async function resolveRemoteHash(gitRoot: string): Promise<string | null> {
  try {
    const result = await execFile("git", ["remote", "get-url", "origin"], { cwd: gitRoot });
    const remote = result.stdout.trim();
    if (!remote) {
      return null;
    }

    return createHash("sha1").update(remote).digest("hex");
  } catch {
    return null;
  }
}

export async function buildProjectRecord(context: ProjectContext): Promise<ProjectRecord> {
  const gitRemoteHash = await resolveRemoteHash(context.gitRoot);
  const now = new Date().toISOString();
  const projectId = context.config.project_id ?? `proj_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  if (!context.config.project_id) {
    context.config.project_id = projectId;
    writeFileSync(context.configPath, JSON.stringify(context.config, null, 2));
  }

  return {
    projectId,
    name: context.config.project_name || basename(context.gitRoot) || "agent-memory-preflight",
    gitRoot: context.gitRoot,
    gitRemoteHash,
    createdAt: now,
    updatedAt: now,
    configPath: context.configPath
  };
}

export function ensureConfig(configPath: string, gitRoot: string): ProjectConfig {
  if (!existsSync(configPath)) {
    const config = {
      ...DEFAULT_PROJECT_CONFIG,
      project_id: `proj_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      project_name: basename(gitRoot) || DEFAULT_PROJECT_CONFIG.project_name
    } satisfies ProjectConfig;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  return loadConfig(configPath);
}

export function loadConfig(configPath: string): ProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error(`Invalid Agent Memory config at ${configPath}: malformed JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid Agent Memory config at ${configPath}: expected object.`);
  }

  const raw = parsed as Partial<ProjectConfig>;
  const rawPreflight =
    raw.preflight && typeof raw.preflight === "object" ? raw.preflight : {};
  const rawRetrieval =
    raw.retrieval && typeof raw.retrieval === "object" ? raw.retrieval : {};
  const rawVector =
    raw.vector && typeof raw.vector === "object" ? raw.vector : {};
  const rawRerank =
    raw.rerank && typeof raw.rerank === "object" ? raw.rerank : {};
  const rawMcp =
    raw.mcp && typeof raw.mcp === "object" ? raw.mcp : {};

  const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    ...raw,
    default_scope:
      raw.default_scope === undefined
        ? DEFAULT_PROJECT_CONFIG.default_scope
        : parseMemoryScope(raw.default_scope),
    preflight: {
      enabled:
        (rawPreflight as Partial<ProjectConfig["preflight"]>).enabled === undefined
          ? DEFAULT_PROJECT_CONFIG.preflight.enabled
          : Boolean((rawPreflight as Partial<ProjectConfig["preflight"]>).enabled),
      default_decision:
        (rawPreflight as Partial<ProjectConfig["preflight"]>).default_decision === undefined
          ? DEFAULT_PROJECT_CONFIG.preflight.default_decision
          : parseDefaultPreflightDecision(
              (rawPreflight as Partial<ProjectConfig["preflight"]>).default_decision
            ),
      enforce_warn_exit_code:
        (rawPreflight as Partial<ProjectConfig["preflight"]>).enforce_warn_exit_code === undefined
          ? DEFAULT_PROJECT_CONFIG.preflight.enforce_warn_exit_code
          : Number((rawPreflight as Partial<ProjectConfig["preflight"]>).enforce_warn_exit_code),
      enforce_block_exit_code:
        (rawPreflight as Partial<ProjectConfig["preflight"]>).enforce_block_exit_code === undefined
          ? DEFAULT_PROJECT_CONFIG.preflight.enforce_block_exit_code
          : Number((rawPreflight as Partial<ProjectConfig["preflight"]>).enforce_block_exit_code)
    },
    retrieval: {
      ...DEFAULT_PROJECT_CONFIG.retrieval,
      ...rawRetrieval,
      default_mode:
        (rawRetrieval as Partial<ProjectConfig["retrieval"]>).default_mode === undefined
          ? DEFAULT_PROJECT_CONFIG.retrieval.default_mode
          : parseRetrievalMode((rawRetrieval as Partial<ProjectConfig["retrieval"]>).default_mode)
    },
    vector: {
      enabled:
        (rawVector as Partial<ProjectConfig["vector"]>).enabled === undefined
          ? DEFAULT_PROJECT_CONFIG.vector.enabled
          : Boolean((rawVector as Partial<ProjectConfig["vector"]>).enabled),
      provider:
        (rawVector as Partial<ProjectConfig["vector"]>).provider === undefined
          ? DEFAULT_PROJECT_CONFIG.vector.provider
          : parseVectorProvider((rawVector as Partial<ProjectConfig["vector"]>).provider)
    },
    rerank: {
      enabled:
        (rawRerank as Partial<ProjectConfig["rerank"]>).enabled === undefined
          ? DEFAULT_PROJECT_CONFIG.rerank.enabled
          : Boolean((rawRerank as Partial<ProjectConfig["rerank"]>).enabled),
      provider:
        (rawRerank as Partial<ProjectConfig["rerank"]>).provider === undefined
          ? DEFAULT_PROJECT_CONFIG.rerank.provider
          : parseRerankerProvider((rawRerank as Partial<ProjectConfig["rerank"]>).provider),
      timeout_ms:
        (rawRerank as Partial<ProjectConfig["rerank"]>).timeout_ms === undefined
          ? DEFAULT_PROJECT_CONFIG.rerank.timeout_ms
          : Number((rawRerank as Partial<ProjectConfig["rerank"]>).timeout_ms)
    },
    mcp: {
      write_tools_enabled:
        (rawMcp as Partial<ProjectConfig["mcp"]>).write_tools_enabled === undefined
          ? DEFAULT_PROJECT_CONFIG.mcp.write_tools_enabled
          : Boolean((rawMcp as Partial<ProjectConfig["mcp"]>).write_tools_enabled),
      candidate_approval_enabled:
        (rawMcp as Partial<ProjectConfig["mcp"]>).candidate_approval_enabled === undefined
          ? DEFAULT_PROJECT_CONFIG.mcp.candidate_approval_enabled
          : Boolean((rawMcp as Partial<ProjectConfig["mcp"]>).candidate_approval_enabled)
    }
  };

  if (!Number.isFinite(config.memory_pack_token_budget) || config.memory_pack_token_budget <= 0) {
    throw new Error("Invalid memory_pack_token_budget: expected a positive number.");
  }

  if (!Number.isFinite(config.retrieval.max_results) || config.retrieval.max_results <= 0) {
    throw new Error("Invalid retrieval.max_results: expected a positive number.");
  }

  if (!Number.isFinite(config.rerank.timeout_ms) || config.rerank.timeout_ms <= 0) {
    throw new Error("Invalid rerank.timeout_ms: expected a positive number.");
  }

  return config;
}

export async function ensureAgentMemoryExcluded(gitRoot: string): Promise<void> {
  const result = await execFile("git", ["rev-parse", "--git-path", "info/exclude"], {
    cwd: gitRoot
  });
  const rawExcludePath = result.stdout.trim();
  const excludePath = isAbsolute(rawExcludePath) ? rawExcludePath : resolve(gitRoot, rawExcludePath);
  mkdirSync(dirname(excludePath), { recursive: true });
  const current = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(".agent-memory/")) {
    return;
  }

  const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(excludePath, `${prefix}.agent-memory/\n`);
}

export function toInitProjectResult(
  project: ProjectRecord,
  context: ProjectContext
): InitProjectResult {
  return {
    projectId: project.projectId,
    name: project.name,
    gitRoot: project.gitRoot,
    storePath: context.storePath,
    configPath: context.configPath,
    warning: context.warning
  };
}
