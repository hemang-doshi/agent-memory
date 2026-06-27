import { readFile } from "node:fs/promises";

import {
  parseCandidateType,
  parseConfidenceLevel,
  parseEvidenceEventType,
  parseMemoryScope,
  parseMemorySource,
  parseMemoryStatus,
  parseMemoryType,
  parsePreflightDecision,
  parseSeverityLevel
} from "../../domain/validators.js";

import {
  BENCHMARK_SCHEMA,
  type BenchmarkCandidateInput,
  type BenchmarkEventInput,
  type BenchmarkExpectations,
  type BenchmarkFixture,
  type BenchmarkMemoryInput,
  type BenchmarkPreflightInput,
  type BenchmarkPreflightExpectation
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, label: string, fixtureName?: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(
    fixtureName
      ? `Invalid benchmark fixture ${fixtureName}: missing ${label}`
      : `Invalid benchmark fixture: missing ${label}`
  );
}

function optionalStringArray(value: unknown, label: string, fixtureName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  throw new Error(`Invalid benchmark fixture ${fixtureName}: ${label} must be an array of strings`);
}

function optionalNumber(value: unknown, label: string, fixtureName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Invalid benchmark fixture ${fixtureName}: ${label} must be a number`);
}

function parseMemory(value: unknown, index: number, fixtureName: string): BenchmarkMemoryInput {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: memories[${index}] must be an object`);
  }

  const memory: BenchmarkMemoryInput = {
    type: parseMemoryType(value.type),
    content: requireString(value.content, `memories[${index}].content`, fixtureName)
  };

  if (value.source !== undefined) memory.source = parseMemorySource(value.source);
  if (value.scope !== undefined) memory.scope = parseMemoryScope(value.scope);
  if (value.summary !== undefined) {
    if (value.summary !== null && typeof value.summary !== "string") {
      throw new Error(`Invalid benchmark fixture ${fixtureName}: memories[${index}].summary must be a string or null`);
    }
    memory.summary = value.summary;
  }
  if (value.confidence !== undefined) memory.confidence = parseConfidenceLevel(value.confidence);
  if (value.paths !== undefined) memory.paths = optionalStringArray(value.paths, `memories[${index}].paths`, fixtureName);
  if (value.tags !== undefined) memory.tags = optionalStringArray(value.tags, `memories[${index}].tags`, fixtureName);
  if (value.severity !== undefined) memory.severity = parseSeverityLevel(value.severity);
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      throw new Error(`Invalid benchmark fixture ${fixtureName}: memories[${index}].metadata must be an object`);
    }
    memory.metadata = value.metadata;
  }
  if (value.status !== undefined) memory.status = parseMemoryStatus(value.status);

  return memory;
}

function parseEvent(value: unknown, index: number, fixtureName: string): BenchmarkEventInput {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: events[${index}] must be an object`);
  }

  const event: BenchmarkEventInput = {
    type: parseEvidenceEventType(value.type),
    summary: requireString(value.summary, `events[${index}].summary`, fixtureName)
  };
  if (value.command !== undefined) event.command = requireString(value.command, `events[${index}].command`, fixtureName);
  if (value.exitCode !== undefined) event.exitCode = optionalNumber(value.exitCode, `events[${index}].exitCode`, fixtureName);
  return event;
}

function parsePreflight(value: unknown, index: number, fixtureName: string): BenchmarkPreflightInput {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: preflightCommands[${index}] must be an object`);
  }

  const input: BenchmarkPreflightInput = {
    command: requireString(value.command, `preflightCommands[${index}].command`, fixtureName)
  };
  if (value.expectDecision !== undefined) input.expectDecision = parsePreflightDecision(value.expectDecision);
  if (value.expectMatchedMemoryIdsAtLeast !== undefined) {
    input.expectMatchedMemoryIdsAtLeast = optionalNumber(
      value.expectMatchedMemoryIdsAtLeast,
      `preflightCommands[${index}].expectMatchedMemoryIdsAtLeast`,
      fixtureName
    );
  }
  return input;
}

function parseCandidate(value: unknown, index: number, fixtureName: string): BenchmarkCandidateInput {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: candidates[${index}] must be an object`);
  }

  const candidate: BenchmarkCandidateInput = {
    type: parseCandidateType(value.type),
    content: requireString(value.content, `candidates[${index}].content`, fixtureName)
  };
  if (value.evidence !== undefined) {
    candidate.evidence = requireString(value.evidence, `candidates[${index}].evidence`, fixtureName);
  }
  if (value.evidenceEventIndex !== undefined) {
    candidate.evidenceEventIndex = optionalNumber(
      value.evidenceEventIndex,
      `candidates[${index}].evidenceEventIndex`,
      fixtureName
    );
  }
  return candidate;
}

function parsePreflightExpectation(
  value: unknown,
  index: number,
  fixtureName: string
): BenchmarkPreflightExpectation {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: expectations.preflight[${index}] must be an object`);
  }

  const expectation: BenchmarkPreflightExpectation = {
    command: requireString(value.command, `expectations.preflight[${index}].command`, fixtureName),
    decision: parsePreflightDecision(value.decision)
  };
  if (value.matchedMemoryIdsAtLeast !== undefined) {
    expectation.matchedMemoryIdsAtLeast = optionalNumber(
      value.matchedMemoryIdsAtLeast,
      `expectations.preflight[${index}].matchedMemoryIdsAtLeast`,
      fixtureName
    );
  }
  return expectation;
}

function parseExpectations(value: unknown, fixtureName: string): BenchmarkExpectations {
  if (!isRecord(value)) {
    throw new Error(`Invalid benchmark fixture ${fixtureName}: missing expectations`);
  }

  const expectations: BenchmarkExpectations = {};
  if (value.packIncludes !== undefined) expectations.packIncludes = optionalStringArray(value.packIncludes, "expectations.packIncludes", fixtureName);
  if (value.packExcludes !== undefined) expectations.packExcludes = optionalStringArray(value.packExcludes, "expectations.packExcludes", fixtureName);
  if (value.matchedMemoryCountAtLeast !== undefined) expectations.matchedMemoryCountAtLeast = optionalNumber(value.matchedMemoryCountAtLeast, "expectations.matchedMemoryCountAtLeast", fixtureName);
  if (value.matchedMemoryCountAtMost !== undefined) expectations.matchedMemoryCountAtMost = optionalNumber(value.matchedMemoryCountAtMost, "expectations.matchedMemoryCountAtMost", fixtureName);
  if (value.maxNoiseCount !== undefined) expectations.maxNoiseCount = optionalNumber(value.maxNoiseCount, "expectations.maxNoiseCount", fixtureName);
  if (value.candidateCount !== undefined) expectations.candidateCount = optionalNumber(value.candidateCount, "expectations.candidateCount", fixtureName);
  if (value.receiptTypes !== undefined) expectations.receiptTypes = optionalStringArray(value.receiptTypes, "expectations.receiptTypes", fixtureName);
  if (value.receiptTypesAbsent !== undefined) expectations.receiptTypesAbsent = optionalStringArray(value.receiptTypesAbsent, "expectations.receiptTypesAbsent", fixtureName);
  if (value.preflight !== undefined) {
    if (!Array.isArray(value.preflight)) {
      throw new Error(`Invalid benchmark fixture ${fixtureName}: expectations.preflight must be an array`);
    }
    expectations.preflight = value.preflight.map((entry, index) =>
      parsePreflightExpectation(entry, index, fixtureName)
    );
  }

  return expectations;
}

export function parseBenchmarkFixture(value: unknown): BenchmarkFixture {
  if (!isRecord(value)) {
    throw new Error("Invalid benchmark fixture: expected object");
  }

  const name = requireString(value.name, "name");
  if (value.schema !== BENCHMARK_SCHEMA) {
    throw new Error(`Invalid benchmark fixture ${name}: expected schema ${BENCHMARK_SCHEMA}`);
  }

  const memories = value.memories === undefined ? [] : value.memories;
  const events = value.events === undefined ? [] : value.events;
  const preflightCommands = value.preflightCommands === undefined ? [] : value.preflightCommands;
  const candidates = value.candidates === undefined ? [] : value.candidates;

  if (!Array.isArray(memories)) throw new Error(`Invalid benchmark fixture ${name}: memories must be an array`);
  if (!Array.isArray(events)) throw new Error(`Invalid benchmark fixture ${name}: events must be an array`);
  if (!Array.isArray(preflightCommands)) throw new Error(`Invalid benchmark fixture ${name}: preflightCommands must be an array`);
  if (!Array.isArray(candidates)) throw new Error(`Invalid benchmark fixture ${name}: candidates must be an array`);

  const fixture: BenchmarkFixture = {
    schema: BENCHMARK_SCHEMA,
    name,
    task: requireString(value.task, "task", name),
    memories: memories.map((memory, index) => parseMemory(memory, index, name)),
    events: events.map((event, index) => parseEvent(event, index, name)),
    preflightCommands: preflightCommands.map((preflight, index) => parsePreflight(preflight, index, name)),
    candidates: candidates.map((candidate, index) => parseCandidate(candidate, index, name)),
    expectations: parseExpectations(value.expectations, name)
  };

  if (value.description !== undefined) {
    fixture.description = requireString(value.description, "description", name);
  }
  if (value.packTask !== undefined) {
    fixture.packTask = requireString(value.packTask, "packTask", name);
  }

  for (const [index, candidate] of fixture.candidates.entries()) {
    if (
      candidate.evidenceEventIndex !== undefined &&
      (candidate.evidenceEventIndex < 0 || candidate.evidenceEventIndex >= fixture.events.length)
    ) {
      throw new Error(
        `Invalid benchmark fixture ${name}: candidates[${index}].evidenceEventIndex points to missing event`
      );
    }
  }

  return fixture;
}

export async function loadBenchmarkFixture(path: string): Promise<BenchmarkFixture> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid benchmark fixture at ${path}: ${message}`);
  }

  return parseBenchmarkFixture(parsed);
}
