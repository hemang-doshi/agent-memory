import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { execFile as rawExecFile } from "node:child_process";
import { promisify } from "node:util";

import { DEFAULT_PROJECT_CONFIG } from "../domain/defaults.js";
import type { InitProjectResult, ProjectConfig, ProjectRecord } from "../domain/types.js";

const execFile = promisify(rawExecFile);

export interface ProjectContext {
  cwd: string;
  gitRoot: string;
  memoryDir: string;
  storePath: string;
  configPath: string;
  config: ProjectConfig;
}

export async function ensureProjectContext(cwd: string): Promise<ProjectContext> {
  const gitRoot = await resolveGitRoot(cwd);
  const memoryDir = join(gitRoot, ".agent-memory");
  const storePath = join(memoryDir, "memory.db");
  const configPath = join(memoryDir, "config.json");

  mkdirSync(memoryDir, { recursive: true });
  const config = ensureConfig(configPath, gitRoot);

  return { cwd, gitRoot, memoryDir, storePath, configPath, config };
}

export async function initializeGitRepo(cwd: string): Promise<void> {
  if (existsSync(join(cwd, ".git"))) {
    return;
  }

  await execFile("git", ["init", "-b", "main"], { cwd });
}

export async function resolveGitRoot(cwd: string): Promise<string> {
  try {
    const result = await execFile("git", ["rev-parse", "--show-toplevel"], { cwd });
    return result.stdout.trim() || cwd;
  } catch {
    return cwd;
  }
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
  const projectId = `proj_${createHash("sha1")
    .update(`${context.gitRoot}:${gitRemoteHash ?? "local"}`)
    .digest("hex")
    .slice(0, 8)}`;
  const name = context.config.project_name || basename(context.gitRoot) || randomUUID();

  return {
    projectId,
    name,
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
      project_name: basename(gitRoot) || DEFAULT_PROJECT_CONFIG.project_name
    } satisfies ProjectConfig;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as ProjectConfig;
  return parsed;
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
    configPath: context.configPath
  };
}
