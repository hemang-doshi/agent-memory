import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectRoot } from "../config/project-context.js";

import { hasRouterInstalled } from "./instructions-block.js";

export async function doctor({ cwd }: { cwd: string }): Promise<{
  initialized: boolean;
  agentsMdExists: boolean;
  routerInstalled: boolean;
  storePath: string;
  configPath: string;
}> {
  const { gitRoot } = await resolveProjectRoot(cwd);
  const storePath = join(gitRoot, ".agent-memory", "memory.db");
  const configPath = join(gitRoot, ".agent-memory", "config.json");
  const agentsPath = join(gitRoot, "AGENTS.md");
  const agentsMdExists = existsSync(agentsPath);
  const content = agentsMdExists ? readFileSync(agentsPath, "utf8") : "";

  return {
    initialized: existsSync(storePath) && existsSync(configPath),
    agentsMdExists,
    routerInstalled: hasRouterInstalled(content),
    storePath,
    configPath
  };
}
