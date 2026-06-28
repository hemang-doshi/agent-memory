import type { MemoryRecord, RerankerMode } from "../domain/types.js";

export interface RerankReceipt {
  provider: RerankerMode;
  applied: boolean;
  fallback: boolean;
  reason: string;
}

export interface RerankResult {
  memories: MemoryRecord[];
  receipt: RerankReceipt;
}

interface StructuredRerankItem {
  memoryId: string;
  score: number;
  reason?: string;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_./-]+/)
      .filter((token) => token.length > 1)
  );
}

export function parseStructuredRerankerOutput(output: string): StructuredRerankItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Invalid reranker output: expected JSON.");
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { rankings?: unknown }).rankings)
      ? (parsed as { rankings: unknown[] }).rankings
      : null;

  if (!items) {
    throw new Error("Invalid reranker output: expected an array or rankings array.");
  }

  return items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid reranker output: ranking item must be an object.");
    }
    const record = item as Record<string, unknown>;
    if (typeof record.memoryId !== "string" || record.memoryId.length === 0) {
      throw new Error("Invalid reranker output: ranking item missing memoryId.");
    }
    if (typeof record.score !== "number" || !Number.isFinite(record.score)) {
      throw new Error("Invalid reranker output: ranking item missing numeric score.");
    }
    return {
      memoryId: record.memoryId,
      score: record.score,
      reason: typeof record.reason === "string" ? record.reason : undefined
    };
  });
}

function attachRerankMetadata(memory: MemoryRecord, receipt: RerankReceipt, reason?: string): MemoryRecord {
  return {
    ...memory,
    metadata: {
      ...memory.metadata,
      rerank: {
        provider: receipt.provider,
        applied: receipt.applied,
        fallback: receipt.fallback,
        reason: reason ?? receipt.reason
      }
    }
  };
}

export function rerankMemories({
  memories,
  task,
  provider,
  timeoutMs
}: {
  memories: MemoryRecord[];
  task: string;
  provider: RerankerMode;
  timeoutMs?: number;
}): RerankResult {
  if (provider === "none" || provider === "noop") {
    const receipt: RerankReceipt = {
      provider,
      applied: false,
      fallback: true,
      reason: "No-op reranker preserved retrieval order."
    };
    return { memories: memories.map((memory) => attachRerankMetadata(memory, receipt)), receipt };
  }

  if (provider === "mock") {
    return mockRerank({ memories, task, provider, timeoutMs });
  }

  return llmProviderRerank({ memories, task, provider, timeoutMs });
}

function mockRerank({
  memories,
  task,
  provider,
  timeoutMs
}: {
  memories: MemoryRecord[];
  task: string;
  provider: RerankerMode;
  timeoutMs?: number;
}): RerankResult {
  try {
    const taskTokens = tokenize(task);
    const ranked = memories
      .map((memory, index) => {
        const memoryTokens = tokenize([
          memory.content,
          memory.summary ?? "",
          memory.tags.join(" "),
          memory.paths.join(" ")
        ].join(" "));
        const overlap = Array.from(taskTokens).filter((token) => memoryTokens.has(token)).length;
        return {
          memory,
          score: overlap * 10 + Math.max(0, memories.length - index),
          reason: overlap > 0 ? `mock overlap=${overlap}` : "mock original-order fallback"
        };
      })
      .sort((left, right) => right.score - left.score || left.memory.id.localeCompare(right.memory.id));

    const receipt: RerankReceipt = {
      provider,
      applied: true,
      fallback: false,
      reason: "Mock reranker applied deterministic lexical ranking."
    };

    return {
      memories: ranked.map((entry) => attachRerankMetadata(entry.memory, receipt, entry.reason)),
      receipt
    };
  } catch {
    const receipt: RerankReceipt = {
      provider,
      applied: false,
      fallback: true,
      reason: "Mock reranker failed, falling back to original order."
    };
    return {
      memories: memories.map((memory) => attachRerankMetadata(memory, receipt, "fallback")),
      receipt
    };
  }
}

function llmProviderRerank({
  memories,
  task,
  provider,
  timeoutMs
}: {
  memories: MemoryRecord[];
  task: string;
  provider: RerankerMode;
  timeoutMs?: number;
}): RerankResult {
  const receipt: RerankReceipt = {
    provider,
    applied: false,
    fallback: true,
    reason: `LLM reranker provider "${provider}" is not connected. External LLM reranking requires a configured provider adapter.`
  };
  return {
    memories: memories.map((memory) => attachRerankMetadata(memory, receipt)),
    receipt
  };
}

