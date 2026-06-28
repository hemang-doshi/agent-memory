import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectRoot } from "../config/project-context.js";

import { hasRouterInstalled } from "./instructions-block.js";
import { getKeywordIndexHealth, type KeywordIndexHealth } from "./keyword-index.js";
import { getVectorIndexHealth, type VectorIndexHealth } from "../vector/vector-index.js";

export async function doctor({ cwd, includeIndex = false }: { cwd: string; includeIndex?: boolean }): Promise<{
  initialized: boolean;
  agentsMdExists: boolean;
  routerInstalled: boolean;
  storePath: string;
  configPath: string;
  index?: {
    keyword: KeywordIndexHealth | null;
    vector: VectorIndexHealth | null;
  };
}> {
  const { gitRoot } = await resolveProjectRoot(cwd);
  const storePath = join(gitRoot, ".agent-memory", "memory.db");
  const configPath = join(gitRoot, ".agent-memory", "config.json");
  const agentsPath = join(gitRoot, "AGENTS.md");
  const agentsMdExists = existsSync(agentsPath);
  const content = agentsMdExists ? readFileSync(agentsPath, "utf8") : "";
  const initialized = existsSync(storePath) && existsSync(configPath);

  return {
    initialized,
    agentsMdExists,
    routerInstalled: hasRouterInstalled(content),
    storePath,
    configPath,
    ...(includeIndex
      ? {
          index: {
            keyword: initialized ? await getKeywordIndexHealth({ cwd }) : null,
            vector: initialized ? await getVectorIndexHealth({ cwd }) : null
          }
        }
      : {})
  };
}
