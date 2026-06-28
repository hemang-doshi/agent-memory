import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { initProject } from "../src/core/init-project.js";
import { listCandidates } from "../src/core/candidate-list.js";
import { createMemory } from "../src/core/create-memory.js";
import {
  exportMemoryStore,
  importMemoryStore,
  ingestFileAsCandidates
} from "../src/ingestion/index.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("V2 ingestion import export", () => {
  test("ingests files as proposed candidates with provenance", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-ingest");
    workspaces.push(cwd);
    await initProject({ cwd });
    const docsPath = join(cwd, "AGENTS.md");
    await writeFile(docsPath, "Use pnpm for package operations.");

    const result = await ingestFileAsCandidates({ cwd, file: "AGENTS.md" });
    expect(result.chunks).toBe(1);

    const candidates = await listCandidates({ cwd });
    expect(candidates).toEqual([
      expect.objectContaining({
        candidateId: result.candidateIds[0],
        candidateStatus: "proposed",
        source: "imported_doc",
        metadata: expect.objectContaining({
          ingestion: expect.objectContaining({ sourcePath: "AGENTS.md" })
        })
      })
    ]);
  });

  test("rejects secret-bearing imports", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-ingest-secret");
    workspaces.push(cwd);
    await initProject({ cwd });
    await writeFile(join(cwd, "secret.log"), "token=abcdefghijklmnopqrstuvwxyz123456");

    await expect(ingestFileAsCandidates({ cwd, file: "secret.log" })).rejects.toThrow(
      "possible secret detected"
    );
  });

  test("exports and imports memory store JSON with provenance", async () => {
    const cwd = await createTempWorkspace("agentmem-v2-export");
    workspaces.push(cwd);
    await initProject({ cwd });
    await createMemory({
      cwd,
      content: "Use pnpm for package operations.",
      type: "workflow_rule",
      source: "user_explicit"
    });
    const exportPath = join(cwd, "agentmem-export.json");

    const exported = await exportMemoryStore({ cwd, output: "agentmem-export.json" });
    expect(exported.memories).toHaveLength(1);

    const importedCwd = await createTempWorkspace("agentmem-v2-import");
    workspaces.push(importedCwd);
    await initProject({ cwd: importedCwd });
    await writeFile(join(importedCwd, "agentmem-export.json"), await (await import("node:fs/promises")).readFile(exportPath, "utf8"));

    await expect(importMemoryStore({ cwd: importedCwd, file: "agentmem-export.json" })).resolves.toEqual({
      importedMemories: 1,
      importedCandidates: 0
    });
  });
});
