import { existsSync, readFileSync, renameSync } from "node:fs";
import { mkdtemp, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const HELPER = join(import.meta.dirname, "helpers.ts");
const isBuilt = existsSync(join(import.meta.dirname, "..", "dist", "cli", "main.js"));
const cliEntry = isBuilt
  ? ["node", join(import.meta.dirname, "..", "dist", "cli", "main.js")]
  : ["node", "--import", "tsx", "src/cli/main.ts"];

async function createTempGitWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const resolved = await realpath(dir);
  await execFile("git", ["init", "-b", "main"], { cwd: resolved });
  return resolved;
}

describe("project identity", () => {
  it("writes project_id to config on init", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-init-");
    await execFile(cliEntry[0]!, [...cliEntry.slice(1), "init", "--json"], { cwd });
    const config = JSON.parse(readFileSync(join(cwd, ".agent-memory", "config.json"), "utf8"));
    expect(typeof config.project_id).toBe("string");
    expect(config.project_id.startsWith("proj_")).toBe(true);
  });

  it("preserves memory visibility after repo move", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-move-");
    await execFile(cliEntry[0]!, [...cliEntry.slice(1), "init", "--json"], { cwd });

    const { stdout } = await execFile(cliEntry[0]!, [
      ...cliEntry.slice(1),
      "add",
      "Use pnpm for package operations.",
      "--type", "workflow_rule",
      "--json"
    ], { cwd });
    const created = JSON.parse(stdout) as { id: string };

    const moved = `${cwd}-moved`;
    renameSync(cwd, moved);

    const { stdout: listOut } = await execFile(cliEntry[0]!, [
      ...cliEntry.slice(1),
      "list",
      "--json"
    ], { cwd: moved });

    const memories = JSON.parse(listOut) as Array<{ id: string; content: string }>;
    const found = memories.find((m) => m.id === created.id);
    expect(found).toBeDefined();
    expect(found?.content).toBe("Use pnpm for package operations.");
  });

  it("opens from subdirectory with same project identity", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-subdir-");
    await execFile("mkdir", ["-p", "src/sub"], { cwd });
    await execFile(cliEntry[0]!, [...cliEntry.slice(1), "init", "--json"], { cwd });

    const { stdout: initOut } = await execFile(cliEntry[0]!, [
      ...cliEntry.slice(1),
      "init",
      "--json"
    ], { cwd: join(cwd, "src/sub") });
    const fromSubdir = JSON.parse(initOut) as { projectId: string };
    const config = JSON.parse(readFileSync(join(cwd, ".agent-memory", "config.json"), "utf8"));
    expect(fromSubdir.projectId).toBe(config.project_id);
  });
});
