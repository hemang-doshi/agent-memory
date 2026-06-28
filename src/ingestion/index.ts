import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  exportMemoryData,
  exportMemoryJson,
  importMemoryJson,
  type AgentMemoryJsonExport
} from "./json.js";
import { ingestFile, ingestLog, type IngestionResult } from "./sources.js";

export * from "./chunking.js";
export * from "./json.js";
export * from "./sources.js";

export interface IngestResult {
  sourcePath: string;
  candidateIds: string[];
  chunks: number;
}

export async function ingestFileAsCandidates({
  cwd,
  file,
  as = "candidates"
}: {
  cwd: string;
  file: string;
  as?: "candidates";
}): Promise<IngestResult> {
  if (as !== "candidates") {
    throw new Error("ingest currently supports only --as candidates");
  }
  const result = await ingestFile({ cwd, filePath: file, target: "candidate" });
  return {
    sourcePath: result.chunks[0]?.content ? resolve(cwd, file) : resolve(cwd, file),
    candidateIds: result.candidates.map((candidate) => candidate.candidateId),
    chunks: result.chunks.length
  };
}

export async function ingestLogAsCandidates({
  cwd,
  file,
  as = "candidates"
}: {
  cwd: string;
  file: string;
  as?: "candidates";
}): Promise<IngestResult> {
  if (as !== "candidates") {
    throw new Error("ingest-log currently supports only --as candidates");
  }
  const log = readFileSync(resolve(cwd, file), "utf8");
  const result = await ingestLog({ cwd, log, logName: file, target: "candidate" });
  return {
    sourcePath: resolve(cwd, file),
    candidateIds: result.candidates.map((candidate) => candidate.candidateId),
    chunks: result.chunks.length
  };
}

export async function exportMemoryStore({
  cwd,
  output,
  pretty = true
}: {
  cwd: string;
  output?: string;
  pretty?: boolean;
}): Promise<AgentMemoryJsonExport> {
  const data = await exportMemoryData({ cwd, pretty });
  if (output) {
    writeFileSync(resolve(cwd, output), JSON.stringify(data, null, pretty ? 2 : 0));
  }
  return data;
}

export async function importMemoryStore({
  cwd,
  file
}: {
  cwd: string;
  file: string;
}): Promise<{
  importedMemories: number;
  importedCandidates: number;
}> {
  const result = await importMemoryJson({
    cwd,
    json: readFileSync(resolve(cwd, file), "utf8")
  });
  return {
    importedMemories: result.memoriesImported,
    importedCandidates: result.candidatesImported
  };
}

export function summarizeIngestion(result: IngestionResult): {
  target: string;
  chunks: number;
  candidateIds: string[];
  memoryIds: string[];
} {
  return {
    target: result.target,
    chunks: result.chunks.length,
    candidateIds: result.candidates.map((candidate) => candidate.candidateId),
    memoryIds: result.memories.map((memory) => memory.id)
  };
}

export { exportMemoryJson };
