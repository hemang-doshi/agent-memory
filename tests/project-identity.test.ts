import { existsSync, readFileSync, renameSync } from "node:fs";
import { mkdtemp, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "src", "cli", "main.ts");
const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliBase: [string, string[]] = ["node", [tsxCli, cliPath]];

async function runCli(args: string[], cwd: string) {
  return run("node", [tsxCli, cliPath, ...args], { cwd });
}

async function createTempGitWorkspace(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  const resolved = await realpath(dir);
  await run("git", ["init", "-b", "main"], { cwd: resolved });
  return resolved;
}

describe("project identity", () => {
  it("writes project_id to config on init", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-init-");
    await runCli(["init", "--json"], cwd);
    const config = JSON.parse(readFileSync(join(cwd, ".agent-memory", "config.json"), "utf8"));
    expect(typeof config.project_id).toBe("string");
    expect(config.project_id.startsWith("proj_")).toBe(true);
  });

  it("preserves memory visibility after repo move", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-move-");
    await runCli(["init", "--json"], cwd);

    const { stdout } = await runCli([
      "add",
      "Use pnpm for package operations.",
      "--type", "workflow_rule",
      "--json"
    ], cwd);
    const created = JSON.parse(stdout) as { id: string };

    const moved = `${cwd}-moved`;
    renameSync(cwd, moved);

    const { stdout: listOut } = await runCli(["list", "--json"], moved);
    const memories = JSON.parse(listOut) as Array<{ id: string; content: string }>;
    const found = memories.find((m) => m.id === created.id);
    expect(found).toBeDefined();
    expect(found?.content).toBe("Use pnpm for package operations.");
  });

  it("opens from subdirectory with same project identity", async () => {
    const cwd = await createTempGitWorkspace("agentmem-pid-subdir-");
    await run("mkdir", ["-p", "src/sub"], { cwd });
    await runCli(["init", "--json"], cwd);

    const { stdout } = await runCli(["init", "--json"], join(cwd, "src", "sub"));
    const fromSubdir = JSON.parse(stdout) as { projectId: string };
    const config = JSON.parse(readFileSync(join(cwd, ".agent-memory", "config.json"), "utf8"));
    expect(fromSubdir.projectId).toBe(config.project_id);
  });
});
