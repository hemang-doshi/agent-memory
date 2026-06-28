import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const run = promisify(execFile);
const workspaces: string[] = [];
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cliPath = resolve(repoRoot, "src/cli/main.ts");
const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function runCli(args: string[], cwd: string) {
  return run("node", [tsxCli, cliPath, ...args], { cwd });
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("CLI smoke tests", () => {
  test("prints compact help for empty usage and help flags", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-help");
    workspaces.push(cwd);

    const noCommand = await runCli([], cwd);
    expect(noCommand.stdout).toContain("Agent Memory CLI");

    const help = await runCli(["help"], cwd);
    expect(help.stdout).toContain("agentmem init");

    const helpFlag = await runCli(["--help"], cwd);
    expect(helpFlag.stdout).toContain("agentmem preflight");
  });

  test("shows a help hint for unknown commands", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-unknown");
    workspaces.push(cwd);

    await expect(runCli(["wat"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Run `agentmem help` for usage.")
    });
  });

  test("initializes a project and emits JSON for pack and preflight", async () => {
    const cwd = await createTempWorkspace("agentmem-cli");
    workspaces.push(cwd);

    await runCli(["init"], cwd);

    await runCli(
      [
        "policy",
        "Do not run npm run render unless explicitly requested.",
        "--match",
        "npm run render",
        "--decision",
        "warn",
        "--suggest",
        "Run pnpm test instead."
      ],
      cwd
    );

    const pack = await runCli(
      [
        "pack",
        "Implement the reel scene",
        "--json"
      ],
      cwd
    );

    const packJson = JSON.parse(pack.stdout) as { markdown: string };
    expect(packJson.markdown).toContain("# Project Memory Pack");

    const preflight = await runCli(
      [
        "preflight",
        "--command",
        "npm run render",
        "--json"
      ],
      cwd
    );

    const preflightJson = JSON.parse(preflight.stdout) as { decision: string };
    expect(preflightJson.decision).toBe("warn");
  });

  test("supports V1 add retrieve inject update forget and event commands", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-v1");
    workspaces.push(cwd);

    await runCli(["init"], cwd);

    const created = await runCli(
      [
        "add",
        "Use pnpm for package operations.",
        "--type",
        "workflow_rule",
        "--pinned",
        "--priority",
        "2",
        "--tags",
        "package-manager",
        "--json"
      ],
      cwd
    );
    const createdJson = JSON.parse(created.stdout) as { id: string; pinned: boolean };
    expect(createdJson.pinned).toBe(true);

    const retrieved = await runCli(["retrieve", "package manager setup", "--json"], cwd);
    const retrievedJson = JSON.parse(retrieved.stdout) as { matchedMemoryIds: string[] };
    expect(retrievedJson.matchedMemoryIds).toContain(createdJson.id);

    const injected = await runCli(["inject", "package manager setup", "--format", "json"], cwd);
    const injectedJson = JSON.parse(injected.stdout) as { schemaVersion: string; sections: unknown[] };
    expect(injectedJson.schemaVersion).toBe("agent-memory.packet.v1");
    expect(injectedJson.sections.length).toBeGreaterThan(0);

    const updated = await runCli(
      [
        "update",
        createdJson.id,
        "--reason",
        "Clarify package manager.",
        "--content",
        "Use pnpm for all package operations.",
        "--json"
      ],
      cwd
    );
    const updatedJson = JSON.parse(updated.stdout) as { content: string };
    expect(updatedJson.content).toBe("Use pnpm for all package operations.");

    const session = await runCli(["session", "start", "CLI V1 smoke", "--json"], cwd);
    const sessionJson = JSON.parse(session.stdout) as { sessionId: string };
    const event = await runCli(
      [
        "event",
        "record",
        "--session",
        sessionJson.sessionId,
        "--type",
        "command_result",
        "--summary",
        "CLI V1 smoke test passed.",
        "--json"
      ],
      cwd
    );
    const eventJson = JSON.parse(event.stdout) as { eventId: string; eventType: string };
    expect(eventJson.eventType).toBe("command_result");

    const candidate = await runCli(
      [
        "candidate",
        "propose",
        "--session",
        sessionJson.sessionId,
        "--type",
        "workflow_rule",
        "--content",
        "Use pnpm for package operations.",
        "--evidence-event",
        eventJson.eventId,
        "--json"
      ],
      cwd
    );
    const candidateJson = JSON.parse(candidate.stdout) as { evidenceEventIds: string[] };
    expect(candidateJson.evidenceEventIds).toEqual([eventJson.eventId]);

    await expect(
      runCli(
        [
          "event",
          "record",
          "--session",
          "ses_missing",
          "--type",
          "command_result",
          "--summary",
          "Should fail."
        ],
        cwd
      )
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Unknown session: ses_missing")
    });

    const receipt = await runCli(
      ["session", "receipt", "--session", sessionJson.sessionId, "--json"],
      cwd
    );
    const receiptJson = JSON.parse(receipt.stdout) as { receipts: Array<{ type: string }> };
    expect(receiptJson.receipts.map((item) => item.type)).toContain("event_recorded");

    const forgotten = await runCli(
      ["forget", createdJson.id, "--reason", "No longer needed.", "--json"],
      cwd
    );
    const forgottenJson = JSON.parse(forgotten.stdout) as { status: string };
    expect(forgottenJson.status).toBe("archived");

    const evalRun = await runCli(["eval", "--json"], cwd);
    const evalJson = JSON.parse(evalRun.stdout) as { passed: boolean; checks: unknown[] };
    expect(evalJson.passed).toBe(true);
    expect(evalJson.checks.length).toBeGreaterThan(0);
  });

  test("supports keyword index and retrieval explanation commands", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-retrieval-v2");
    workspaces.push(cwd);

    await runCli(["init"], cwd);
    const created = await runCli(
      [
        "add",
        "Billing reconciler retry policy.",
        "--type",
        "architecture_note",
        "--tags",
        "billing",
        "--json"
      ],
      cwd
    );
    const createdJson = JSON.parse(created.stdout) as { id: string };

    const index = await runCli(["index", "--json"], cwd);
    const indexJson = JSON.parse(index.stdout) as {
      indexedMemories: number;
      eligibleMemories: number;
      stale: boolean;
    };
    expect(indexJson).toEqual({
      indexedMemories: 1,
      eligibleMemories: 1,
      stale: false
    });

    const rebuilt = await runCli(["index", "--rebuild", "--json"], cwd);
    expect(JSON.parse(rebuilt.stdout)).toMatchObject({ indexedMemories: 1, stale: false });

    const keyword = await runCli(
      ["retrieve", "reconciler", "--mode", "keyword", "--json"],
      cwd
    );
    const keywordJson = JSON.parse(keyword.stdout) as { matchedMemoryIds: string[] };
    expect(keywordJson.matchedMemoryIds).toEqual([createdJson.id]);

    const explained = await runCli(
      ["retrieve", "reconciler", "--mode", "keyword", "--explain", "--json"],
      cwd
    );
    const explainedJson = JSON.parse(explained.stdout) as {
      explanations: Array<{ memoryId: string; mode: string; reason: string }>;
    };
    expect(explainedJson.explanations).toEqual([
      expect.objectContaining({
        memoryId: createdJson.id,
        mode: "keyword",
        reason: expect.stringContaining("keyword match")
      })
    ]);

    const explainCommand = await runCli(
      ["explain-retrieval", "reconciler", "--mode", "keyword", "--json"],
      cwd
    );
    const explainCommandJson = JSON.parse(explainCommand.stdout) as {
      matchedMemoryIds: string[];
      explanations: Array<{ mode: string }>;
    };
    expect(explainCommandJson.matchedMemoryIds).toEqual([createdJson.id]);
    expect(explainCommandJson.explanations[0]?.mode).toBe("keyword");

    const doctor = await runCli(["doctor", "--index", "--json"], cwd);
    const doctorJson = JSON.parse(doctor.stdout) as {
      index: { keyword: { indexedMemories: number; stale: boolean } };
    };
    expect(doctorJson.index.keyword).toMatchObject({ indexedMemories: 1, stale: false });

    const deepDoctor = await runCli(["doctor", "--deep", "--json"], cwd);
    const deepDoctorJson = JSON.parse(deepDoctor.stdout) as {
      index: { keyword: { indexedMemories: number; stale: boolean } };
    };
    expect(deepDoctorJson.index.keyword).toMatchObject({ indexedMemories: 1, stale: false });
  });

  test("supports V2 production command surfaces", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-v2");
    workspaces.push(cwd);

    await runCli(["init"], cwd);
    const first = await runCli([
      "add",
      "Use pnpm for package operations.",
      "--type",
      "workflow_rule",
      "--json"
    ], cwd);
    const firstJson = JSON.parse(first.stdout) as { id: string };
    const duplicate = await runCli([
      "add",
      "Use pnpm for package operations.",
      "--type",
      "workflow_rule",
      "--json"
    ], cwd);
    const duplicateJson = JSON.parse(duplicate.stdout) as { id: string };

    const vectorIndex = await runCli(["index", "--vector", "--json"], cwd);
    expect(JSON.parse(vectorIndex.stdout)).toMatchObject({
      indexedMemories: 2,
      provider: "local-hash",
      stale: false
    });

    const vectorRetrieve = await runCli([
      "retrieve",
      "package operations",
      "--mode",
      "vector",
      "--rerank",
      "--reranker",
      "mock",
      "--json"
    ], cwd);
    const vectorRetrieveJson = JSON.parse(vectorRetrieve.stdout) as {
      memories: Array<{ metadata: { rerank?: { provider: string } } }>;
    };
    expect(vectorRetrieveJson.memories[0]?.metadata.rerank).toMatchObject({ provider: "mock" });

    const dedupe = await runCli(["dedupe", "--json"], cwd);
    const dedupeJson = JSON.parse(dedupe.stdout) as { duplicateGroups: Array<{ memoryIds: string[] }> };
    expect(dedupeJson.duplicateGroups[0]?.memoryIds).toEqual([duplicateJson.id, firstJson.id].sort());

    await runCli([
      "merge",
      "--target",
      firstJson.id,
      "--source",
      duplicateJson.id,
      "--reason",
      "Duplicate CLI smoke memory.",
      "--json"
    ], cwd);

    const quality = await runCli(["quality", "--json"], cwd);
    expect(JSON.parse(quality.stdout)).toMatchObject({
      summary: expect.objectContaining({ duplicateGroups: 0 })
    });

    const review = await runCli(["review", "--json"], cwd);
    expect(JSON.parse(review.stdout)).toMatchObject({ needsReview: [] });

    await writeFile(resolve(cwd, "NOTES.md"), "Avoid direct edits to generated files.");
    const ingest = await runCli(["ingest", "NOTES.md", "--as", "candidates", "--json"], cwd);
    expect(JSON.parse(ingest.stdout)).toMatchObject({
      chunks: 1,
      candidateIds: expect.any(Array)
    });

    const exported = await runCli(["export", "--output", "agentmem-export.json", "--json"], cwd);
    expect(JSON.parse(exported.stdout)).toMatchObject({
      format: "agent-memory-v2-json",
      memories: expect.any(Array),
      candidates: expect.any(Array)
    });
    const importCwd = await createTempWorkspace("agentmem-cli-v2-import");
    workspaces.push(importCwd);
    await runCli(["init"], importCwd);
    await writeFile(resolve(importCwd, "agentmem-export.json"), exported.stdout);
    const imported = await runCli(["import", "agentmem-export.json", "--json"], importCwd);
    expect(JSON.parse(imported.stdout)).toMatchObject({
      importedMemories: expect.any(Number),
      importedCandidates: expect.any(Number)
    });

    const audit = await runCli(["audit", "--json"], cwd);
    expect(JSON.parse(audit.stdout)).toMatchObject({
      summary: expect.objectContaining({ findings: 0 })
    });

    const quarantine = await runCli([
      "quarantine",
      firstJson.id,
      "--reason",
      "CLI smoke quarantine.",
      "--json"
    ], cwd);
    expect(JSON.parse(quarantine.stdout)).toMatchObject({
      id: firstJson.id,
      status: "quarantined"
    });

    const mcp = await runCli(["mcp", "serve", "--json"], cwd);
    expect(JSON.parse(mcp.stdout)).toMatchObject({
      manifest: expect.objectContaining({
        server: expect.objectContaining({ readOnlyDefault: true, shellCommands: false }),
        permissions: expect.objectContaining({
          writeToolsEnabled: false,
          candidateApprovalEnabled: false
        })
      })
    });

    const adapters = await runCli(["adapters", "list", "--json"], cwd);
    expect(JSON.parse(adapters.stdout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "codex" })])
    );

    const migration = await runCli(["migrate", "status", "--json"], cwd);
    expect(JSON.parse(migration.stdout)).toMatchObject({
      currentVersion: "4",
      latestVersion: "4",
      pending: []
    });

    const backup = await runCli(["backup", "--json"], cwd);
    expect(JSON.parse(backup.stdout)).toMatchObject({
      files: expect.arrayContaining(["memory.db"])
    });

    const repair = await runCli(["repair", "--json"], cwd);
    expect(JSON.parse(repair.stdout)).toMatchObject({ repaired: true });

    const liveEval = await runCli(["eval", "live", "--json"], cwd);
    expect(JSON.parse(liveEval.stdout)).toMatchObject({
      name: "agent-memory-live-local-harness",
      passed: true
    });
  });

  test("fails clearly for invalid CLI enum inputs and regex policies", async () => {
    const cwd = await createTempWorkspace("agentmem-cli-invalid");
    workspaces.push(cwd);
    await runCli(["init"], cwd);

    await expect(runCli(["remember", "x", "--type", "banana"], cwd)).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid memory type")
    });
    await expect(
      runCli(["remember", "x", "--type", "decision", "--source", "banana"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid memory source")
    });
    await expect(
      runCli(["policy", "x", "--match", "render", "--decision", "explode"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid preflight decision")
    });
    await expect(
      runCli(["policy", "x", "--match", "render", "--match-type", "glob"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid command policy match type")
    });
    await expect(
      runCli(["policy", "x", "--match", "[", "--match-type", "regex"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid regex pattern")
    });
    await expect(
      runCli(["add", "Invalid priority", "--type", "decision", "--priority", "high"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid --priority: expected an integer")
    });
    await expect(
      runCli(["retrieve", "query", "--limit", "many"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid --limit: expected an integer")
    });
    await expect(
      runCli(["retrieve", "query", "--mode", "banana"], cwd)
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Invalid retrieval mode")
    });
  });
});
