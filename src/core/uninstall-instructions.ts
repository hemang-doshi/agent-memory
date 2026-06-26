import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectRoot } from "../config/project-context.js";

import { removeRouterBlock } from "./instructions-block.js";

export async function uninstallInstructions({ cwd }: { cwd: string }): Promise<{
  agentsPath: string;
  routerInstalled: false;
}> {
  const { gitRoot } = await resolveProjectRoot(cwd);
  const agentsPath = join(gitRoot, "AGENTS.md");

  if (!existsSync(agentsPath)) {
    return { agentsPath, routerInstalled: false };
  }

  const current = readFileSync(agentsPath, "utf8");
  writeFileSync(agentsPath, removeRouterBlock(current));

  return { agentsPath, routerInstalled: false };
}
