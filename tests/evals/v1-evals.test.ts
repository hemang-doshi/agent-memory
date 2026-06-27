import { afterEach, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

import { createMemory } from "../../src/core/create-memory.js";
import { generatePack } from "../../src/core/generate-pack.js";
import { initProject } from "../../src/core/init-project.js";
import { retrieveMemories } from "../../src/core/retrieve-memories.js";
import type { CreateMemoryInput, MemoryRecord } from "../../src/domain/types.js";
import { cleanupWorkspace, createTempWorkspace } from "../helpers.js";

const fixtureUrl = new URL("../../benchmarks/fixtures/v1/eval-cases.json", import.meta.url);
const packetMarkdownGoldenUrl = new URL(
  "../../benchmarks/goldens/v1/packet-markdown.md",
  import.meta.url
);
const packetJsonGoldenUrl = new URL("../../benchmarks/goldens/v1/packet-json.json", import.meta.url);

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

interface FixtureMemory
  extends Omit<CreateMemoryInput, "cwd" | "supersedesMemoryId"> {
  label: string;
  project?: "local" | "foreign";
  supersedes?: string;
}

interface RetrievalCase {
  name: string;
  task: string;
  files?: string[];
  command?: string;
  maxResults?: number;
  memories: FixtureMemory[];
  expectedIncluded: string[];
  expectedExcluded: string[];
  expectedReasonIncludes?: Record<string, string>;
}

interface EvalFixture {
  retrievalCases: RetrievalCase[];
  secretRedaction: RetrievalCase & {
    rejectedWriteContent: string;
    blockedLeakSentinel: string;
  };
  packetGolden: {
    task: string;
    memories: FixtureMemory[];
  };
  contextDelta: {
    task: string;
    expectedMemoryAwareText: string;
    memories: FixtureMemory[];
  };
}

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, "utf8")) as T;
}

async function createWorkspace(prefix: string): Promise<string> {
  const cwd = await createTempWorkspace(prefix);
  workspaces.push(cwd);
  await initProject({ cwd });
  return cwd;
}

async function seedMemories(
  cwd: string,
  memories: FixtureMemory[]
): Promise<{
  labelToMemory: Map<string, MemoryRecord>;
  idToLabel: Map<string, string>;
}> {
  const labelToMemory = new Map<string, MemoryRecord>();
  const idToLabel = new Map<string, string>();

  for (const fixtureMemory of memories) {
    const supersedesMemoryId = fixtureMemory.supersedes
      ? labelToMemory.get(fixtureMemory.supersedes)?.id
      : undefined;
    if (fixtureMemory.supersedes && !supersedesMemoryId) {
      throw new Error(`Unknown superseded memory label: ${fixtureMemory.supersedes}`);
    }

    const { label, project, supersedes, ...input } = fixtureMemory;
    const memory = await createMemory({
      cwd,
      ...input,
      ...(supersedesMemoryId ? { supersedesMemoryId } : {})
    });

    if (project === "foreign") {
      const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
      db.prepare("UPDATE memories SET project_id = ? WHERE id = ?").run("proj_foreign", memory.id);
      db.close();
    }

    labelToMemory.set(label, memory);
    idToLabel.set(memory.id, label);
  }

  return { labelToMemory, idToLabel };
}

function labelsForResults(results: MemoryRecord[], idToLabel: Map<string, string>): string[] {
  return results.map((memory) => idToLabel.get(memory.id) ?? memory.id);
}

function expectFixtureRecall(
  fixtureCase: Pick<RetrievalCase, "expectedIncluded" | "expectedExcluded">,
  labels: string[]
): void {
  expect(labels).toEqual(expect.arrayContaining(fixtureCase.expectedIncluded));
  for (const excluded of fixtureCase.expectedExcluded) {
    expect(labels).not.toContain(excluded);
  }
}

function normalizeMarkdown(markdown: string, idToLabel: Map<string, string>): string {
  let normalized = markdown
    .replace(/^Project: .+$/m, "Project: <project>")
    .replace(/^Generated: .+$/m, "Generated: <timestamp>")
    .trimEnd();

  for (const [id, label] of idToLabel) {
    normalized = normalized.replaceAll(id, `<mem:${label}>`);
  }

  return `${normalized}\n`;
}

function normalizePacket(
  packet: Awaited<ReturnType<typeof generatePack>>,
  idToLabel: Map<string, string>
): unknown {
  return {
    ...packet,
    project: "<project>",
    generatedAt: "<timestamp>",
    sections: packet.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        id: `<mem:${idToLabel.get(item.id) ?? item.id}>`
      }))
    })),
    markdown: "<normalized-markdown>",
    matchedMemoryIds: packet.matchedMemoryIds.map((id) => `<mem:${idToLabel.get(id) ?? id}>`)
  };
}

function buildContext(task: string, pack?: { sections: Array<{ items: Array<{ content: string }> }> }): string {
  const memoryLines =
    pack?.sections.flatMap((section) => section.items.map((item) => `- ${item.content}`)) ?? [];

  return [`Task: ${task}`, "Memory directives:", ...(memoryLines.length ? memoryLines : ["- None"])].join(
    "\n"
  );
}

describe("v1 deterministic eval fixtures", async () => {
  const fixture = await readJson<EvalFixture>(fixtureUrl);

  test.each(fixture.retrievalCases)("$name", async (fixtureCase) => {
    const cwd = await createWorkspace(`agentmem-v1-${fixtureCase.name.replaceAll(" ", "-")}`);
    const { idToLabel } = await seedMemories(cwd, fixtureCase.memories);

    const results = await retrieveMemories({
      cwd,
      task: fixtureCase.task,
      files: fixtureCase.files,
      command: fixtureCase.command,
      maxResults: fixtureCase.maxResults
    });
    const labels = labelsForResults(results, idToLabel);

    expectFixtureRecall(fixtureCase, labels);
    for (const [label, reason] of Object.entries(fixtureCase.expectedReasonIncludes ?? {})) {
      const result = results.find((memory) => idToLabel.get(memory.id) === label);
      expect(result?.metadata.retrieval).toMatchObject({
        reason: expect.stringContaining(reason)
      });
    }
  });

  test("secret-like writes are rejected and blocked memories do not enter packets", async () => {
    const cwd = await createWorkspace("agentmem-v1-secret-redaction");
    const { idToLabel } = await seedMemories(cwd, fixture.secretRedaction.memories);

    await expect(
      createMemory({
        cwd,
        content: fixture.secretRedaction.rejectedWriteContent,
        type: "constraint",
        source: "user_explicit"
      })
    ).rejects.toThrow("possible secret detected");

    const pack = await generatePack({ cwd, task: fixture.secretRedaction.task });
    const labels = pack.matchedMemoryIds.map((id) => idToLabel.get(id) ?? id);

    expectFixtureRecall(fixture.secretRedaction, labels);
    expect(pack.markdown).not.toContain(fixture.secretRedaction.blockedLeakSentinel);
    expect(JSON.stringify(pack.sections)).not.toContain(fixture.secretRedaction.blockedLeakSentinel);
    expect(pack.markdown).not.toContain(fixture.secretRedaction.rejectedWriteContent);
  });

  test("packet markdown and JSON match normalized V1 goldens", async () => {
    const cwd = await createWorkspace("agentmem-v1-packet-golden");
    const { idToLabel } = await seedMemories(cwd, fixture.packetGolden.memories);

    const pack = await generatePack({ cwd, task: fixture.packetGolden.task });
    const expectedMarkdown = await readFile(packetMarkdownGoldenUrl, "utf8");
    const expectedJson = await readJson<unknown>(packetJsonGoldenUrl);

    expect(normalizeMarkdown(pack.markdown, idToLabel)).toBe(expectedMarkdown);
    expect(normalizePacket(pack, idToLabel)).toEqual(expectedJson);
  });

  test("with-memory context contains expected directive absent from no-memory context", async () => {
    const cwd = await createWorkspace("agentmem-v1-context-delta");
    await seedMemories(cwd, fixture.contextDelta.memories);

    const pack = await generatePack({ cwd, task: fixture.contextDelta.task });
    const withoutMemory = buildContext(fixture.contextDelta.task);
    const withMemory = buildContext(fixture.contextDelta.task, pack);

    expect(withMemory).toContain(fixture.contextDelta.expectedMemoryAwareText);
    expect(withoutMemory).not.toContain(fixture.contextDelta.expectedMemoryAwareText);
    expect(withMemory).not.toBe(withoutMemory);
  });
});
