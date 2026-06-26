import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectRoot } from "../config/project-context.js";

import { upsertRouterBlock } from "./instructions-block.js";

export async function installInstructions({ cwd }: { cwd: string }): Promise<{
  agentsPath: string;
  routerInstalled: true;
}> {
  const { gitRoot } = await resolveProjectRoot(cwd);
  const agentsPath = join(gitRoot, "AGENTS.md");
  const current = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "";
  writeFileSync(agentsPath, upsertRouterBlock(current));

  return { agentsPath, routerInstalled: true };
}
