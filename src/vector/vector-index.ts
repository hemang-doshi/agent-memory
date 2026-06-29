import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { MemoryRecord, ProjectConfig } from "../domain/types.js";
import { loadProject } from "../core/context.js";
import { isAgentVisibleMemory } from "../core/memory-eligibility.js";

import { cosineSimilarity, createEmbeddingProvider } from "./provider.js";

interface VectorIndexEntry {
  memoryId: string;
  contentHash: string;
  embedding: number[];
  updatedAt: string;
}

interface VectorIndexFile {
  schemaVersion: "agent-memory.vector-index.v1";
  projectId: string;
  provider: string;
  dimensions: number;
  generatedAt: string;
  entries: VectorIndexEntry[];
}

export interface VectorIndexHealth {
  indexedMemories: number;
  eligibleMemories: number;
  stale: boolean;
  provider: string;
  dimensions: number;
}

export interface VectorSearchMatch {
  memoryId: string;
  score: number;
}

function memoryVectorText(memory: MemoryRecord): string {
  return [
    memory.content,
    memory.summary ?? "",
    memory.type,
    memory.tags.join(" "),
    memory.paths.join(" "),
    JSON.stringify(memory.metadata)
  ].join("\n");
}

function contentHash(memory: MemoryRecord): string {
  return `${memory.updatedAt}:${memoryVectorText(memory)}`;
}

function vectorIndexPath(memoryDir: string): string {
  return join(memoryDir, "vector-index.json");
}

function emptyIndex(projectId: string, provider: string, dimensions: number): VectorIndexFile {
  return {
    schemaVersion: "agent-memory.vector-index.v1",
    projectId,
    provider,
    dimensions,
    generatedAt: new Date().toISOString(),
    entries: []
  };
}

function readIndex(path: string, projectId: string, provider: string, dimensions: number): VectorIndexFile {
  if (!existsSync(path)) {
    return emptyIndex(projectId, provider, dimensions);
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as VectorIndexFile;
  if (parsed.schemaVersion !== "agent-memory.vector-index.v1" || parsed.projectId !== projectId) {
    return emptyIndex(projectId, provider, dimensions);
  }
  return parsed;
}

function readIndexUnsafe(path: string): VectorIndexFile | null {
  if (!existsSync(path)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as VectorIndexFile;
  if (parsed.schemaVersion !== "agent-memory.vector-index.v1") {
    return null;
  }
  return parsed;
}

function visibleMemories(memories: MemoryRecord[], config: Parameters<typeof isAgentVisibleMemory>[0]["config"]): MemoryRecord[] {
  return memories.filter((memory) => isAgentVisibleMemory({ memory, config }));
}

export async function rebuildVectorIndex({ cwd }: { cwd: string }): Promise<VectorIndexHealth> {
  const loaded = await loadProject(cwd);
  try {
    const provider = createEmbeddingProvider(loaded.context.config.vector.provider);
    const memories = visibleMemories(
      loaded.repo.listMemories(loaded.project.projectId),
      loaded.context.config
    );
    const entries = memories.map((memory) => ({
      memoryId: memory.id,
      contentHash: contentHash(memory),
      embedding: provider.embed(memoryVectorText(memory)),
      updatedAt: memory.updatedAt
    }));
    const index: VectorIndexFile = {
      schemaVersion: "agent-memory.vector-index.v1",
      projectId: loaded.project.projectId,
      provider: provider.name,
      dimensions: provider.dimensions,
      generatedAt: new Date().toISOString(),
      entries
    };
    writeFileSync(vectorIndexPath(loaded.context.memoryDir), JSON.stringify(index, null, 2));
    return {
      indexedMemories: entries.length,
      eligibleMemories: memories.length,
      stale: false,
      provider: provider.name,
      dimensions: provider.dimensions
    };
  } finally {
    loaded.close();
  }
}

export async function getVectorIndexHealth({ cwd }: { cwd: string }): Promise<VectorIndexHealth> {
  const loaded = await loadProject(cwd);
  try {
    const provider = createEmbeddingProvider(loaded.context.config.vector.provider);
    const memories = visibleMemories(
      loaded.repo.listMemories(loaded.project.projectId),
      loaded.context.config
    );
    const index = readIndex(
      vectorIndexPath(loaded.context.memoryDir),
      loaded.project.projectId,
      provider.name,
      provider.dimensions
    );
    const indexed = new Map(index.entries.map((entry) => [entry.memoryId, entry]));
    const stale =
      index.provider !== provider.name ||
      index.dimensions !== provider.dimensions ||
      index.entries.length !== memories.length ||
      memories.some((memory) => indexed.get(memory.id)?.contentHash !== contentHash(memory));
    return {
      indexedMemories: index.entries.length,
      eligibleMemories: memories.length,
      stale,
      provider: provider.name,
      dimensions: provider.dimensions
    };
  } finally {
    loaded.close();
  }
}

export async function searchVectorIndex({
  cwd,
  query,
  limit
}: {
  cwd: string;
  query: string;
  limit: number;
}): Promise<VectorSearchMatch[]> {
  const loaded = await loadProject(cwd);
  try {
    const provider = createEmbeddingProvider(loaded.context.config.vector.provider);
    const path = vectorIndexPath(loaded.context.memoryDir);
    let index = readIndex(path, loaded.project.projectId, provider.name, provider.dimensions);
    const health = await getVectorIndexHealth({ cwd });
    if (health.stale) {
      await rebuildVectorIndex({ cwd });
      index = readIndex(path, loaded.project.projectId, provider.name, provider.dimensions);
    }
    const queryEmbedding = provider.embed(query);
    return index.entries
      .map((entry) => ({
        memoryId: entry.memoryId,
        score: cosineSimilarity(queryEmbedding, entry.embedding)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.memoryId.localeCompare(right.memoryId))
      .slice(0, Math.max(0, Math.floor(limit)));
  } finally {
    loaded.close();
  }
}

export function searchVectorIndexReadOnly({
  memoryDir,
  query,
  limit,
  visibleMemoryIds,
  projectId,
  providerId = "local"
}: {
  memoryDir: string;
  query: string;
  limit: number;
  visibleMemoryIds: Set<string>;
  projectId: string;
  providerId?: "local" | "mock";
}): VectorSearchMatch[] {
  const provider = createEmbeddingProvider(providerId);
  const path = vectorIndexPath(memoryDir);
  const index = readIndexUnsafe(path);
  if (!index || index.entries.length === 0) {
    return [];
  }
  if (index.projectId !== projectId) {
    return [];
  }
  if (index.provider !== provider.name) {
    return [];
  }
  if (index.dimensions !== provider.dimensions) {
    return [];
  }
  const queryEmbedding = provider.embed(query);
  return index.entries
    .filter((entry) => visibleMemoryIds.has(entry.memoryId))
    .map((entry) => ({
      memoryId: entry.memoryId,
      score: cosineSimilarity(queryEmbedding, entry.embedding)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.memoryId.localeCompare(right.memoryId))
    .slice(0, Math.max(0, Math.floor(limit)));
}

