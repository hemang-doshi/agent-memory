import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { doctor } from "../src/core/doctor.js";
import { initProject } from "../src/core/init-project.js";
import {
  AGENT_MEMORY_END_MARKER,
  AGENT_MEMORY_ROUTER_BLOCK,
  AGENT_MEMORY_START_MARKER
} from "../src/core/instructions-block.js";
import { installInstructions } from "../src/core/install-instructions.js";
import { uninstallInstructions } from "../src/core/uninstall-instructions.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

function countMatches(content: string, pattern: RegExp): number {
  return (content.match(pattern) ?? []).length;
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("instruction installer", () => {
  test("creates AGENTS.md if missing", async () => {
    const cwd = await createTempWorkspace("agentmem-install-create");
    workspaces.push(cwd);

    await installInstructions({ cwd });

    const agentsPath = join(cwd, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("## Agent Memory Router");
    expect(content).toContain('agentmem protocol start "<task>" --json');
    expect(content).toContain("agentmem protocol check --session <session-id> --json");
    expect(content).toContain("always memory-aware, rarely noisy");
    expect(content).toContain("Run preflight before risky commands");
    expect(content).toContain("Do not store secrets");
  });

  test("appends block to existing AGENTS.md and preserves content", async () => {
    const cwd = await createTempWorkspace("agentmem-install-append");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(agentsPath, "# Existing\n\nKeep this.");

    await installInstructions({ cwd });

    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("# Existing");
    expect(content).toContain("Keep this.");
    expect(content).toContain(AGENT_MEMORY_START_MARKER);
  });

  test("install is idempotent", async () => {
    const cwd = await createTempWorkspace("agentmem-install-idempotent");
    workspaces.push(cwd);

    await installInstructions({ cwd });
    const once = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    await installInstructions({ cwd });
    const twice = readFileSync(join(cwd, "AGENTS.md"), "utf8");

    expect(twice).toBe(once);
    expect(countMatches(twice, /agent-memory:start/g)).toBe(1);
    expect(countMatches(twice, /agent-memory:end/g)).toBe(1);
  });

  test("replaces old managed block with v0.3 router only", async () => {
    const cwd = await createTempWorkspace("agentmem-install-replace");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(
      agentsPath,
      [
        "# AGENTS.md",
        "",
        "Human content before.",
        "",
        "<!-- agent-memory:start -->",
        "## Agent Memory Router",
        "",
        "Old command:",
        'agentmem session start "<task>" --json',
        'agentmem pack "<task>" --session <session-id> --json',
        "<!-- agent-memory:end -->",
        "",
        "Human content after."
      ].join("\n")
    );

    await installInstructions({ cwd });

    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("Human content before.");
    expect(content).toContain("Human content after.");
    expect(content).toContain('agentmem protocol start "<task>" --json');
    expect(content).toContain("agentmem protocol check --session <session-id> --json");
    expect(content).not.toContain("Old command:");
    expect(content).not.toContain('agentmem pack "<task>" --session <session-id> --json');
    expect(countMatches(content, /agent-memory:start/g)).toBe(1);
    expect(countMatches(content, /agent-memory:end/g)).toBe(1);
  });

  test("preserves human content around managed block", async () => {
    const cwd = await createTempWorkspace("agentmem-install-preserve");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(
      agentsPath,
      [
        "# Repo Instructions",
        "",
        "Human rule before.",
        "",
        AGENT_MEMORY_START_MARKER,
        "old block",
        AGENT_MEMORY_END_MARKER,
        "",
        "Human rule after."
      ].join("\n")
    );

    await installInstructions({ cwd });

    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("Human rule before.");
    expect(content).toContain("Human rule after.");
    expect(content).toContain(AGENT_MEMORY_ROUTER_BLOCK);
  });

  test("uninstall removes managed block only", async () => {
    const cwd = await createTempWorkspace("agentmem-install-uninstall");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(agentsPath, `Intro\n\n${AGENT_MEMORY_ROUTER_BLOCK}\n\nOutro\n`);

    await uninstallInstructions({ cwd });

    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("Intro");
    expect(content).toContain("Outro");
    expect(content).not.toContain(AGENT_MEMORY_START_MARKER);
    expect(content).not.toContain("Agent Memory Router");
  });

  test("uninstall does not create AGENTS.md when missing", async () => {
    const cwd = await createTempWorkspace("agentmem-install-uninstall-missing");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");

    await uninstallInstructions({ cwd });

    expect(existsSync(agentsPath)).toBe(false);
  });

  test("doctor reports router installed or missing", async () => {
    const cwd = await createTempWorkspace("agentmem-doctor");
    workspaces.push(cwd);
    await initProject({ cwd });

    expect(await doctor({ cwd })).toMatchObject({
      initialized: true,
      agentsMdExists: false,
      routerInstalled: false
    });

    await installInstructions({ cwd });
    expect(await doctor({ cwd })).toMatchObject({
      initialized: true,
      agentsMdExists: true,
      routerInstalled: true
    });
  });
});
