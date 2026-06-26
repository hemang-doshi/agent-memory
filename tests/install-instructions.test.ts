import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { doctor } from "../src/core/doctor.js";
import { initProject } from "../src/core/init-project.js";
import { AGENT_MEMORY_ROUTER_BLOCK, AGENT_MEMORY_START_MARKER } from "../src/core/instructions-block.js";
import { installInstructions } from "../src/core/install-instructions.js";
import { uninstallInstructions } from "../src/core/uninstall-instructions.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

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
    expect(readFileSync(agentsPath, "utf8")).toContain("## Agent Memory Router");
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
  });

  test("replaces old managed block only", async () => {
    const cwd = await createTempWorkspace("agentmem-install-replace");
    workspaces.push(cwd);
    const agentsPath = join(cwd, "AGENTS.md");
    writeFileSync(
      agentsPath,
      [
        "# Keep",
        "",
        "<!-- agent-memory:start -->",
        "old block",
        "<!-- agent-memory:end -->",
        "",
        "Tail"
      ].join("\n")
    );

    await installInstructions({ cwd });

    const content = readFileSync(agentsPath, "utf8");
    expect(content).toContain("# Keep");
    expect(content).toContain("Tail");
    expect(content).not.toContain("old block");
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
