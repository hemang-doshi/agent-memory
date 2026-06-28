import { realpath, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { createMemory } from "../core/create-memory.js";
import { loadProject } from "../core/context.js";
import { requireSession, shortId, writeProtocolReceipt } from "../core/protocol-receipts.js";
import type {
  CandidateType,
  ConfidenceLevel,
  JsonRecord,
  MemoryCandidateRecord,
  MemoryRecord,
  MemoryScope,
  MemorySource,
  MemoryType,
  SeverityLevel
} from "../domain/types.js";
import {
  assertNoObviousSecret,
  assertNoObviousSecretInUnknown,
  parseCandidateType,
  parseConfidenceLevel,
  parseMemoryScope,
  parseMemorySource,
  parseMemoryType,
  parseSeverityLevel
} from "../domain/validators.js";

import { chunkText, type ChunkTextOptions, type TextChunk } from "./chunking.js";

export type IngestionTarget = "candidate" | "memory";

export interface IngestionResult {
  target: IngestionTarget;
  chunks: TextChunk[];
  candidates: MemoryCandidateRecord[];
  memories: MemoryRecord[];
}

export interface BaseIngestionInput extends ChunkTextOptions {
  cwd: string;
  sessionId?: string;
  target?: IngestionTarget;
  type?: CandidateType | MemoryType;
  candidateType?: CandidateType;
  memoryType?: MemoryType;
  scope?: MemoryScope;
  confidence?: ConfidenceLevel;
  severity?: SeverityLevel;
  source?: MemorySource;
  evidence?: string;
  tags?: string[];
  metadata?: JsonRecord;
}

export interface IngestFileInput extends BaseIngestionInput {
  filePath: string;
}

export interface IngestLogInput extends BaseIngestionInput {
  log: string;
  logName?: string;
}

interface IngestTextInput extends BaseIngestionInput {
  kind: "file" | "log";
  content: string;
  sourceLabel: string;
  sourcePath?: string;
  defaultCandidateType: CandidateType;
  defaultMemoryType: MemoryType;
  defaultSource: MemorySource;
}

function assertNonEmptyContent(content: string): void {
  if (content.trim().length === 0) {
    throw new Error("ingestion requires non-empty content.");
  }
}

function scanCommonInput(input: {
  content: string;
  sourceLabel: string;
  evidence?: string;
  tags?: string[];
  metadata?: JsonRecord;
}): void {
  assertNoObviousSecret(input.content);
  assertNoObviousSecret(input.sourceLabel);
  if (input.evidence) {
    assertNoObviousSecret(input.evidence);
  }
  for (const tag of input.tags ?? []) {
    assertNoObviousSecret(tag);
  }
  if (input.metadata) {
    assertNoObviousSecretInUnknown(input.metadata, "metadata");
  }
}

function metadataForChunk(input: IngestTextInput, chunk: TextChunk, importedAt: string): JsonRecord {
  const metadata = {
    ...(input.metadata ?? {}),
    ingestion: {
      kind: input.kind,
      sourceLabel: input.sourceLabel,
      ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
      chunkIndex: chunk.index,
      chunkTotal: chunk.total,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      originalChars: input.content.length,
      originalBytes: Buffer.byteLength(input.content, "utf8"),
      importedAt
    }
  };
  assertNoObviousSecretInUnknown(metadata, "metadata");
  return metadata;
}

function evidenceForChunk(input: IngestTextInput, chunk: TextChunk): string {
  const evidence =
    input.evidence ??
    `Imported ${input.kind} ${input.sourceLabel} as chunk ${chunk.index + 1}/${chunk.total}.`;
  assertNoObviousSecret(evidence);
  return evidence;
}

function candidateTypeFor(input: IngestTextInput): CandidateType {
  return parseCandidateType(input.candidateType ?? input.type ?? input.defaultCandidateType);
}

function memoryTypeFor(input: IngestTextInput): MemoryType {
  return parseMemoryType(input.memoryType ?? input.type ?? input.defaultMemoryType);
}

function scopeFor(input: IngestTextInput): MemoryScope {
  return input.scope === undefined ? "project" : parseMemoryScope(input.scope);
}

function confidenceFor(input: IngestTextInput): ConfidenceLevel {
  return parseConfidenceLevel(input.confidence ?? "medium");
}

function severityFor(input: IngestTextInput): SeverityLevel {
  return parseSeverityLevel(input.severity ?? "medium");
}

function sourceFor(input: IngestTextInput): MemorySource {
  return parseMemorySource(input.source ?? input.defaultSource);
}

async function createCandidateChunks(input: IngestTextInput, chunks: TextChunk[]): Promise<MemoryCandidateRecord[]> {
  const loaded = await loadProject(input.cwd);

  try {
    if (input.sessionId) {
      requireSession(loaded, input.sessionId);
    }

    const candidates: MemoryCandidateRecord[] = [];
    const type = candidateTypeFor(input);
    const scope = scopeFor(input);
    const confidence = confidenceFor(input);
    const severity = severityFor(input);
    const source = sourceFor(input);

    for (const chunk of chunks) {
      const now = new Date().toISOString();
      const evidence = evidenceForChunk(input, chunk);
      const candidate: MemoryCandidateRecord = {
        candidateId: shortId("cand"),
        projectId: loaded.project.projectId,
        sessionId: input.sessionId ?? null,
        type,
        content: chunk.content,
        scope,
        source,
        confidence,
        severity,
        evidence,
        evidenceEventIds: [],
        candidateStatus: "proposed",
        proposedBy: "system",
        createdAt: now,
        reviewedAt: null,
        reviewReason: null,
        targetMemoryId: null,
        metadata: metadataForChunk(input, chunk, now)
      };

      loaded.repo.insertMemoryCandidate(candidate);
      writeProtocolReceipt(loaded, {
        sessionId: candidate.sessionId,
        receiptType: "candidate_proposed",
        payload: {
          candidateId: candidate.candidateId,
          type: candidate.type,
          content: candidate.content,
          evidence,
          ingestion: candidate.metadata.ingestion
        }
      });
      candidates.push(candidate);
    }

    return candidates;
  } finally {
    loaded.close();
  }
}

async function createMemoryChunks(input: IngestTextInput, chunks: TextChunk[]): Promise<MemoryRecord[]> {
  const memories: MemoryRecord[] = [];
  const sourcePath = input.sourcePath ? [input.sourcePath] : [];

  for (const chunk of chunks) {
    const now = new Date().toISOString();
    const memory = await createMemory({
      cwd: input.cwd,
      content: chunk.content,
      type: memoryTypeFor(input),
      source: sourceFor(input),
      scope: scopeFor(input),
      confidence: confidenceFor(input),
      severity: severityFor(input),
      paths: sourcePath,
      tags: input.tags ?? [],
      metadata: metadataForChunk(input, chunk, now)
    });
    memories.push(memory);
  }

  return memories;
}

async function ingestText(input: IngestTextInput): Promise<IngestionResult> {
  assertNonEmptyContent(input.content);
  scanCommonInput(input);

  const chunks = chunkText(input.content, {
    maxChunkChars: input.maxChunkChars,
    overlapChars: input.overlapChars
  });
  const target = input.target ?? "candidate";

  if (target === "memory") {
    const memories = await createMemoryChunks(input, chunks);
    return { target, chunks, candidates: [], memories };
  }

  const candidates = await createCandidateChunks(input, chunks);
  return { target, chunks, candidates, memories: [] };
}

async function resolveProjectFile(cwd: string, filePath: string): Promise<{
  absolutePath: string;
  projectRelativePath: string;
}> {
  if (filePath.trim().length === 0) {
    throw new Error("ingestFile requires filePath.");
  }

  assertNoObviousSecret(filePath);
  const loaded = await loadProject(cwd);

  try {
    const absolutePath = resolve(cwd, filePath);
    const [realRoot, realFile] = await Promise.all([
      realpath(loaded.context.gitRoot),
      realpath(absolutePath)
    ]);
    const projectRelativePath = relative(realRoot, realFile);

    if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) {
      throw new Error("Refusing to ingest a file outside the project root.");
    }

    return { absolutePath: realFile, projectRelativePath };
  } finally {
    loaded.close();
  }
}

export async function ingestFile(input: IngestFileInput): Promise<IngestionResult> {
  const { absolutePath, projectRelativePath } = await resolveProjectFile(input.cwd, input.filePath);
  const content = await readFile(absolutePath, "utf8");

  return ingestText({
    ...input,
    kind: "file",
    content,
    sourceLabel: projectRelativePath,
    sourcePath: projectRelativePath,
    defaultCandidateType: "workflow_rule",
    defaultMemoryType: "workflow_rule",
    defaultSource: "imported_doc"
  });
}

export async function ingestLog(input: IngestLogInput): Promise<IngestionResult> {
  const logName = input.logName?.trim() || "inline log";
  assertNoObviousSecret(logName);

  return ingestText({
    ...input,
    kind: "log",
    content: input.log,
    sourceLabel: logName,
    defaultCandidateType: "failed_attempt",
    defaultMemoryType: "failed_attempt",
    defaultSource: "command_event"
  });
}
