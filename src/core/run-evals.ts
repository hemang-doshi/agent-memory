import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMemory } from "./create-memory.js";
import { generatePack } from "./generate-pack.js";
import { initProject } from "./init-project.js";
import { retrieveMemories } from "./retrieve-memories.js";

export interface EvalCheckResult {
  name: string;
  status: "pass" | "fail";
  details: string;
}

export interface EvalRunResult {
  name: "agent-memory-v1-local";
  passed: boolean;
  checks: EvalCheckResult[];
}

async function withWorkspace<T>(name: string, work: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), `${name}-`));
  try {
    await initProject({ cwd });
    return await work(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function check(name: string, condition: boolean, details: string): EvalCheckResult {
  return { name, status: condition ? "pass" : "fail", details };
}

export async function runV1Evals(): Promise<EvalRunResult> {
  const checks: EvalCheckResult[] = [];

  checks.push(
    await withWorkspace("agentmem-eval-basic", async (cwd) => {
      await createMemory({
        cwd,
        content: "Use pnpm for package installs to avoid lockfile drift.",
        type: "workflow_rule",
        source: "user_explicit",
        tags: ["package-manager"]
      });
      await createMemory({
        cwd,
        content: "Use npm install for package installs.",
        type: "workflow_rule",
        source: "cli",
        status: "stale",
        tags: ["package-manager"]
      });

      const results = await retrieveMemories({ cwd, task: "fix lockfile drift in package installs" });
      const contents = results.map((memory) => memory.content);
      return check(
        "basic retrieval",
        contents.includes("Use pnpm for package installs to avoid lockfile drift.") &&
          !contents.includes("Use npm install for package installs."),
        "retrieves active relevant memory and excludes stale conflicting memory"
      );
    })
  );

  checks.push(
    await withWorkspace("agentmem-eval-pinned", async (cwd) => {
      await createMemory({
        cwd,
        content: "Always use pnpm for package operations in this repository.",
        type: "workflow_rule",
        source: "user_explicit",
        pinned: true
      });
      await createMemory({
        cwd,
        content: "database migration query overlap regular memory",
        type: "decision",
        source: "cli"
      });

      const results = await retrieveMemories({
        cwd,
        task: "database migration query overlap",
        maxResults: 1
      });
      return check(
        "pinned inclusion",
        results[0]?.content === "Always use pnpm for package operations in this repository.",
        "pinned memory is included under a tight result cap"
      );
    })
  );

  checks.push(
    await withWorkspace("agentmem-eval-conflict", async (cwd) => {
      const oldRule = await createMemory({
        cwd,
        content: "Use npm for package installs.",
        type: "workflow_rule",
        source: "cli",
        tags: ["package-manager"]
      });
      await createMemory({
        cwd,
        content: "Use pnpm for package installs.",
        type: "workflow_rule",
        source: "user_explicit",
        tags: ["package-manager"],
        supersedesMemoryId: oldRule.id
      });
      await createMemory({
        cwd,
        content: "Prefer npm scripts for test runs.",
        type: "workflow_rule",
        source: "cli",
        tags: ["tests"],
        conflictGroup: "test-runner"
      });
      await createMemory({
        cwd,
        content: "Prefer pnpm for test runs.",
        type: "workflow_rule",
        source: "user_explicit",
        tags: ["tests"],
        conflictGroup: "test-runner",
        priority: 2
      });

      const results = await retrieveMemories({ cwd, task: "package manager tests" });
      const contents = results.map((memory) => memory.content);
      return check(
        "conflict handling",
        contents.includes("Use pnpm for package installs.") &&
          !contents.includes("Use npm for package installs.") &&
          contents.includes("Prefer pnpm for test runs.") &&
          !contents.includes("Prefer npm scripts for test runs."),
        "suppresses superseded and lower-priority conflict memories"
      );
    })
  );

  checks.push(
    await withWorkspace("agentmem-eval-secret", async (cwd) => {
      await createMemory({
        cwd,
        content: "Keep credential examples redacted in docs and tests.",
        type: "constraint",
        source: "user_explicit",
        tags: ["credentials"]
      });
      await createMemory({
        cwd,
        content: "Redacted credential sentinel DO_NOT_LEAK_SENTINEL.",
        type: "constraint",
        source: "manual_edit",
        tags: ["credentials"],
        redactionStatus: "redacted"
      });

      let rejectedSecret = false;
      try {
        await createMemory({
          cwd,
          content: "token=DO_NOT_COMMIT_FAKE",
          type: "constraint",
          source: "user_explicit"
        });
      } catch {
        rejectedSecret = true;
      }

      const pack = await generatePack({ cwd, task: "prepare credential handling packet" });
      return check(
        "secret redaction",
        rejectedSecret &&
          pack.markdown.includes("Keep credential examples redacted") &&
          !pack.markdown.includes("DO_NOT_LEAK_SENTINEL"),
        "rejects obvious secret writes and excludes redacted memories"
      );
    })
  );

  checks.push(
    await withWorkspace("agentmem-eval-context", async (cwd) => {
      await createMemory({
        cwd,
        content: "Always use pnpm before running package tests.",
        type: "workflow_rule",
        source: "user_explicit",
        tags: ["package-manager", "tests"]
      });

      const pack = await generatePack({ cwd, task: "run package tests for the release branch" });
      const withMemory = pack.sections.flatMap((section) => section.items.map((item) => item.content)).join("\n");
      const withoutMemory = "Memory directives:\n- None";
      return check(
        "context delta",
        withMemory.includes("Always use pnpm before running package tests.") &&
          !withoutMemory.includes("Always use pnpm before running package tests."),
        "memory-aware context contains expected directive absent from no-memory context"
      );
    })
  );

  return {
    name: "agent-memory-v1-local",
    passed: checks.every((result) => result.status === "pass"),
    checks
  };
}
