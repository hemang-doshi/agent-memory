import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMemory } from "../create-memory.js";
import { generatePack } from "../generate-pack.js";
import { initProject } from "../init-project.js";
import { preflightCommand } from "../preflight-command.js";
import { proposeCandidate } from "../candidate-propose.js";
import { recordEvidenceEvent } from "../record-event.js";
import { finishSession } from "../session-finish.js";
import { getSessionReceipt } from "../session-receipt.js";
import { startSession } from "../session-start.js";
import type { EventRecord } from "../../domain/types.js";

import type {
  BenchmarkCheck,
  BenchmarkFixture,
  BenchmarkResult
} from "./types.js";

function pass(name: string): BenchmarkCheck {
  return { name, passed: true };
}

function fail(name: string, message: string): BenchmarkCheck {
  return { name, passed: false, message };
}

function includesCheck(markdown: string, text: string): BenchmarkCheck {
  return markdown.includes(text)
    ? pass(`pack includes expected text: ${text}`)
    : fail(`pack includes expected text: ${text}`, `Missing expected pack text: ${text}`);
}

function excludesCheck(markdown: string, text: string): BenchmarkCheck {
  return !markdown.includes(text)
    ? pass(`pack excludes expected text: ${text}`)
    : fail(`pack excludes expected text: ${text}`, `Unexpected pack text present: ${text}`);
}

function countAtLeastCheck(name: string, actual: number, expected: number): BenchmarkCheck {
  return actual >= expected
    ? pass(name)
    : fail(name, `Expected at least ${expected}, got ${actual}`);
}

function countAtMostCheck(name: string, actual: number, expected: number): BenchmarkCheck {
  return actual <= expected
    ? pass(name)
    : fail(name, `Expected at most ${expected}, got ${actual}`);
}

function receiptIncludesCheck(receiptTypes: string[], type: string): BenchmarkCheck {
  return receiptTypes.includes(type)
    ? pass(`receipt includes ${type}`)
    : fail(`receipt includes ${type}`, `Missing receipt type: ${type}`);
}

function receiptExcludesCheck(receiptTypes: string[], type: string): BenchmarkCheck {
  return !receiptTypes.includes(type)
    ? pass(`receipt excludes ${type}`)
    : fail(`receipt excludes ${type}`, `Unexpected receipt type present: ${type}`);
}

async function createTempWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agentmem-benchmark-"));
}

function evaluateNoise({
  fixture,
  markdown,
  matchedMemoryIds
}: {
  fixture: BenchmarkFixture;
  markdown: string;
  matchedMemoryIds: string[];
}): BenchmarkCheck[] {
  if (fixture.expectations.maxNoiseCount === undefined) {
    return [];
  }

  const usefulMatches = fixture.memories.filter((memory) =>
    (fixture.expectations.packIncludes ?? []).some(
      (snippet) => memory.content.includes(snippet) && markdown.includes(snippet)
    )
  ).length;
  const noiseCount = Math.max(0, matchedMemoryIds.length - usefulMatches);
  return [
    countAtMostCheck(
      "noise count within maximum",
      noiseCount,
      fixture.expectations.maxNoiseCount
    )
  ];
}

export async function runBenchmarkFixture(fixture: BenchmarkFixture): Promise<BenchmarkResult> {
  const workspace = await createTempWorkspace();

  try {
    await initProject({ cwd: workspace });
    const session = await startSession({ cwd: workspace, task: fixture.task });

    for (const memory of fixture.memories) {
      await createMemory({
        cwd: workspace,
        type: memory.type,
        content: memory.content,
        source: memory.source ?? "cli",
        scope: memory.scope,
        summary: memory.summary,
        confidence: memory.confidence,
        paths: memory.paths,
        tags: memory.tags,
        severity: memory.severity,
        metadata: memory.metadata,
        status: memory.status
      });
    }

    const recordedEvents: EventRecord[] = [];
    for (const event of fixture.events) {
      recordedEvents.push(
        await recordEvidenceEvent({
          cwd: workspace,
          sessionId: session.sessionId,
          type: event.type,
          summary: event.summary,
          command: event.command,
          exitCode: event.exitCode
        })
      );
    }

    const pack = await generatePack({
      cwd: workspace,
      task: fixture.packTask ?? fixture.task,
      sessionId: session.sessionId
    });

    const preflightResults = [];
    for (const input of fixture.preflightCommands) {
      const result = await preflightCommand({
        cwd: workspace,
        command: input.command,
        sessionId: session.sessionId
      });
      preflightResults.push({
        command: input.command,
        decision: result.decision,
        matchedMemoryIds: result.matchedMemoryIds
      });
    }

    const candidateIds: string[] = [];
    const candidateEvidenceEventIds: string[][] = [];
    for (const candidate of fixture.candidates) {
      const evidenceEvent =
        candidate.evidenceEventIndex === undefined
          ? undefined
          : recordedEvents[candidate.evidenceEventIndex];
      const proposed = await proposeCandidate({
        cwd: workspace,
        sessionId: session.sessionId,
        type: candidate.type,
        content: candidate.content,
        evidence: candidate.evidence ?? (evidenceEvent ? undefined : "Benchmark fixture evidence."),
        evidenceEventId: evidenceEvent?.eventId
      });
      candidateIds.push(proposed.candidateId);
      candidateEvidenceEventIds.push(proposed.evidenceEventIds);
    }

    await finishSession({
      cwd: workspace,
      sessionId: session.sessionId,
      summary: `Benchmark ${fixture.name} complete.`
    });
    const receipt = await getSessionReceipt({ cwd: workspace, sessionId: session.sessionId });
    const receiptTypes = receipt.receipts.map((entry) => entry.type);

    const checks: BenchmarkCheck[] = [
      ...(fixture.expectations.packIncludes ?? []).map((text) => includesCheck(pack.markdown, text)),
      ...(fixture.expectations.packExcludes ?? []).map((text) => excludesCheck(pack.markdown, text))
    ];

    if (fixture.expectations.matchedMemoryCountAtLeast !== undefined) {
      checks.push(
        countAtLeastCheck(
          "matched memory count at least",
          pack.matchedMemoryIds.length,
          fixture.expectations.matchedMemoryCountAtLeast
        )
      );
    }

    if (fixture.expectations.matchedMemoryCountAtMost !== undefined) {
      checks.push(
        countAtMostCheck(
          "matched memory count at most",
          pack.matchedMemoryIds.length,
          fixture.expectations.matchedMemoryCountAtMost
        )
      );
    }

    checks.push(...evaluateNoise({ fixture, markdown: pack.markdown, matchedMemoryIds: pack.matchedMemoryIds }));

    for (const input of fixture.preflightCommands) {
      if (input.expectDecision === undefined) {
        continue;
      }
      const actual = preflightResults.find((result) => result.command === input.command);
      checks.push(
        actual?.decision === input.expectDecision
          ? pass(`preflight ${input.command} decision`)
          : fail(
              `preflight ${input.command} decision`,
              `Expected preflight decision ${input.expectDecision} for ${input.command}, got ${actual?.decision ?? "missing"}`
            )
      );
      if (input.expectMatchedMemoryIdsAtLeast !== undefined) {
        checks.push(
          countAtLeastCheck(
            `preflight ${input.command} matched memory count`,
            actual?.matchedMemoryIds.length ?? 0,
            input.expectMatchedMemoryIdsAtLeast
          )
        );
      }
    }

    for (const expected of fixture.expectations.preflight ?? []) {
      const actual = preflightResults.find((result) => result.command === expected.command);
      checks.push(
        actual?.decision === expected.decision
          ? pass(`preflight expectation ${expected.command} decision`)
          : fail(
              `preflight expectation ${expected.command} decision`,
              `Expected preflight decision ${expected.decision} for ${expected.command}, got ${actual?.decision ?? "missing"}`
            )
      );
      if (expected.matchedMemoryIdsAtLeast !== undefined) {
        checks.push(
          countAtLeastCheck(
            `preflight expectation ${expected.command} matched memory count`,
            actual?.matchedMemoryIds.length ?? 0,
            expected.matchedMemoryIdsAtLeast
          )
        );
      }
    }

    if (fixture.expectations.candidateCount !== undefined) {
      checks.push(
        candidateIds.length === fixture.expectations.candidateCount
          ? pass("candidate count")
          : fail(
              "candidate count",
              `Expected ${fixture.expectations.candidateCount} candidates, got ${candidateIds.length}`
            )
      );
    }

    fixture.candidates.forEach((candidate, index) => {
      if (candidate.evidenceEventIndex === undefined) {
        return;
      }

      const expectedEventId = recordedEvents[candidate.evidenceEventIndex]?.eventId;
      const actualEventIds = candidateEvidenceEventIds[index] ?? [];
      const candidateId = candidateIds[index];
      const candidateReceipt = receipt.receipts.find(
        (entry) =>
          entry.type === "candidate_proposed" &&
          entry.payload.candidateId === candidateId
      );
      const receiptEvidenceEventIds = Array.isArray(candidateReceipt?.payload.evidenceEventIds)
        ? candidateReceipt.payload.evidenceEventIds.filter((item): item is string => typeof item === "string")
        : [];
      checks.push(
        expectedEventId && actualEventIds.includes(expectedEventId)
          ? pass(`candidate ${index} cites evidence event`)
          : fail(
              `candidate ${index} cites evidence event`,
              `Expected candidate ${index} to cite evidence event ${expectedEventId ?? "missing"}`
            )
      );
      checks.push(
        expectedEventId && receiptEvidenceEventIds.includes(expectedEventId)
          ? pass(`candidate ${index} receipt cites evidence event`)
          : fail(
              `candidate ${index} receipt cites evidence event`,
              `Expected candidate ${index} receipt to cite evidence event ${expectedEventId ?? "missing"}`
            )
      );
    });

    checks.push(...(fixture.expectations.receiptTypes ?? []).map((type) => receiptIncludesCheck(receiptTypes, type)));
    checks.push(
      ...(fixture.expectations.receiptTypesAbsent ?? []).map((type) => receiptExcludesCheck(receiptTypes, type))
    );

    const notes: string[] = [];
    if (fixture.expectations.maxNoiseCount !== undefined) {
      notes.push("maxNoiseCount uses matched memories minus memories whose content appears in packIncludes.");
    }

    return {
      name: fixture.name,
      passed: checks.every((check) => check.passed),
      checks,
      sessionId: session.sessionId,
      matchedMemoryIds: pack.matchedMemoryIds,
      preflightResults,
      candidateIds,
      candidateEvidenceEventIds,
      receiptTypes,
      notes
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
