import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, RetrievalMode, RetrieveMemoriesInput } from "../domain/types.js";
import { rerankMemories, type RerankReceipt } from "../ranking/reranker.js";
import { searchVectorIndex } from "../vector/vector-index.js";
import { parseCommandPolicyMatchType } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { excludeRelationSupersededMemories, isAgentVisibleMemory } from "./memory-eligibility.js";

function tokenize(text: string): string[] {
  return Array.from(new Set(text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 1)));
}

interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
  signals: {
    tokenOverlap: number;
    pathMatch: boolean;
    tagMatch: boolean;
    commandMatch: boolean;
    pinned: boolean;
    priority: number;
    recencyBoost: number;
    useCountBoost: number;
    mistakeBoost: boolean;
    conflictWinner: boolean;
    keywordMatch?: boolean;
    keywordRank?: number;
    vectorMatch?: boolean;
    vectorScore?: number;
    modes?: RetrievalMode[];
  };
  reason: string;
}

function commandMatches(command: string | undefined, memory: MemoryRecord): boolean {
  if (!command || memory.type !== "command_policy") {
    return false;
  }

  const pattern =
    typeof memory.metadata.commandPattern === "string" ? memory.metadata.commandPattern : "";
  if (!pattern) {
    return false;
  }

  let matchType: "substring" | "exact" | "regex";
  try {
    matchType = parseCommandPolicyMatchType(memory.metadata.matchType ?? "substring");
  } catch {
    return false;
  }

  if (matchType === "exact") {
    return command === pattern;
  }

  if (matchType === "regex") {
    try {
      return new RegExp(pattern).test(command);
    } catch {
      return false;
    }
  }

  return command.includes(pattern);
}

function scoreMemory(
  memory: MemoryRecord,
  queryTokens: string[],
  files: string[],
  command: string | undefined
): ScoredMemory {
  let score = TYPE_PRIORITIES[memory.type] ?? 0;
  score += (SEVERITY_SCORES[memory.severity] ?? 0) * 10;
  score += (CONFIDENCE_SCORES[memory.confidence] ?? 0) * 6;
  score += memory.priority * 8;
  if (memory.status === "active") {
    score += 12;
  }
  if (memory.pinned) {
    score += 40;
  }

  const haystack = `${memory.content} ${memory.summary ?? ""} ${memory.tags.join(" ")} ${memory.paths.join(" ")}`.toLowerCase();
  let tokenOverlap = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      tokenOverlap += 1;
      score += 6;
    }
  }

  const pathMatch =
    files.length > 0 &&
    memory.paths.some((path) => files.some((file) => path.includes(file) || file.includes(path)));
  if (pathMatch) {
    score += 12;
  }

  const tagMatch = memory.tags.some((tag) => queryTokens.includes(tag.toLowerCase()));
  if (tagMatch) {
    score += 10;
  }

  const commandMatch = commandMatches(command, memory);
  if (commandMatch) {
    score += 20;
  }

  const recencyBoost = calculateRecencyBoost(memory);
  score += recencyBoost;
  const useCountBoost = Math.min(memory.useCount, 10);
  score += useCountBoost;

  const mistakeBoost =
    (memory.type === "failed_attempt" ||
      memory.type === "agent_mistake" ||
      memory.type === "known_fix" ||
      memory.type === "rejected_approach") &&
    (tokenOverlap > 0 || pathMatch || tagMatch);
  if (mistakeBoost) {
    score += 18;
  }

  const signals = {
    tokenOverlap,
    pathMatch,
    tagMatch,
    commandMatch,
    pinned: memory.pinned,
    priority: memory.priority,
    recencyBoost,
    useCountBoost,
    mistakeBoost,
    conflictWinner: false
  };
  return {
    memory,
    score,
    signals,
    reason: describeReason(signals)
  };
}

function hasRelevanceSignal(scored: ScoredMemory): boolean {
  return (
    scored.signals.tokenOverlap > 0 ||
    scored.signals.pathMatch ||
    scored.signals.tagMatch ||
    scored.signals.commandMatch ||
    scored.signals.pinned ||
    scored.signals.priority > 0
  );
}

function calculateRecencyBoost(memory: MemoryRecord): number {
  const basis = memory.lastRetrievedAt ?? memory.lastUsedAt ?? memory.createdAt;
  const timestamp = Date.parse(basis);
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  if (ageDays <= 7) {
    return 8;
  }
  if (ageDays <= 30) {
    return 4;
  }
  return 0;
}

function describeReason(signals: ScoredMemory["signals"]): string {
  const reasons: string[] = [];
  if (signals.pinned) {
    reasons.push("pinned");
  }
  if (signals.commandMatch) {
    reasons.push("command match");
  }
  if (signals.pathMatch) {
    reasons.push("path match");
  }
  if (signals.tagMatch) {
    reasons.push("tag match");
  }
  if (signals.tokenOverlap > 0) {
    reasons.push(`${signals.tokenOverlap} query token${signals.tokenOverlap === 1 ? "" : "s"}`);
  }
  if (signals.mistakeBoost) {
    reasons.push("regression prevention");
  }
  if (signals.keywordMatch) {
    reasons.push("keyword match");
  }
  if (signals.vectorMatch) {
    reasons.push("vector match");
  }
  if (signals.priority > 0) {
    reasons.push(`priority ${signals.priority}`);
  }
  return reasons.join(", ") || "eligible memory";
}

function resolveConflictGroups(scored: ScoredMemory[]): ScoredMemory[] {
  const winners = new Map<string, ScoredMemory>();
  const ungrouped: ScoredMemory[] = [];

  for (const entry of scored) {
    const group = entry.memory.conflictGroup;
    if (!group) {
      ungrouped.push(entry);
      continue;
    }

    const current = winners.get(group);
    if (!current || entry.score > current.score) {
      winners.set(group, entry);
    }
  }

  for (const winner of winners.values()) {
    winner.signals.conflictWinner = true;
    winner.reason = `${winner.reason}, conflict winner`;
    winner.memory.metadata = {
      ...winner.memory.metadata,
      retrieval: {
        score: winner.score,
        signals: winner.signals,
        reason: winner.reason
      }
    };
  }

  return [...ungrouped, ...winners.values()];
}

function attachRetrievalMetadata(scored: ScoredMemory): MemoryRecord {
  return {
    ...scored.memory,
    metadata: {
      ...scored.memory.metadata,
      retrieval: {
        score: scored.score,
        signals: scored.signals,
        reason: scored.reason
      }
    }
  };
}

function attachRetrievalMetadataForMode(scored: ScoredMemory, mode: RetrievalMode): MemoryRecord {
  const memory = attachRetrievalMetadata(scored);
  const retrieval = memory.metadata.retrieval;
  if (!retrieval || typeof retrieval !== "object") {
    return memory;
  }

  return {
    ...memory,
    metadata: {
      ...memory.metadata,
      retrieval: {
        ...retrieval,
        mode
      }
    }
  };
}

function selectResults(scored: ScoredMemory[], maxResults: number): ScoredMemory[] {
  const resolved = resolveConflictGroups(scored).sort((left, right) => right.score - left.score);
  const guaranteed = resolved.filter((entry) => entry.memory.pinned || entry.memory.priority > 0);
  const regular = resolved.filter((entry) => !entry.memory.pinned && entry.memory.priority <= 0);
  const selected: ScoredMemory[] = [];
  const seen = new Set<string>();

  for (const entry of [...guaranteed, ...regular]) {
    if (selected.length >= maxResults) {
      break;
    }
    if (seen.has(entry.memory.id)) {
      continue;
    }
    selected.push(entry);
    seen.add(entry.memory.id);
  }

  return selected;
}

function scoreKeywordMatches({
  memories,
  keywordMatches
}: {
  memories: MemoryRecord[];
  keywordMatches: Array<{ memoryId: string; rank: number }>;
}): ScoredMemory[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  return keywordMatches.flatMap((match, index) => {
    const memory = byId.get(match.memoryId);
    if (!memory) {
      return [];
    }

    const rankScore = Math.max(0, 100 - index);
    const signals: ScoredMemory["signals"] = {
      tokenOverlap: 0,
      pathMatch: false,
      tagMatch: false,
      commandMatch: false,
      pinned: memory.pinned,
      priority: memory.priority,
      recencyBoost: 0,
      useCountBoost: 0,
      mistakeBoost: false,
      conflictWinner: false,
      keywordMatch: true,
      keywordRank: match.rank,
      modes: ["keyword"]
    };
    return [{
      memory,
      score: rankScore + memory.priority * 8 + (memory.pinned ? 40 : 0),
      signals,
      reason: describeReason(signals)
    }];
  });
}

function scoreVectorMatches({
  memories,
  vectorMatches
}: {
  memories: MemoryRecord[];
  vectorMatches: Array<{ memoryId: string; score: number }>;
}): ScoredMemory[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  return vectorMatches.flatMap((match) => {
    const memory = byId.get(match.memoryId);
    if (!memory) {
      return [];
    }

    const signals: ScoredMemory["signals"] = {
      tokenOverlap: 0,
      pathMatch: false,
      tagMatch: false,
      commandMatch: false,
      pinned: memory.pinned,
      priority: memory.priority,
      recencyBoost: 0,
      useCountBoost: 0,
      mistakeBoost: false,
      conflictWinner: false,
      vectorMatch: true,
      vectorScore: match.score,
      modes: ["vector"]
    };
    return [{
      memory,
      score: match.score * 100 + memory.priority * 8 + (memory.pinned ? 40 : 0),
      signals,
      reason: describeReason(signals)
    }];
  });
}

function mergeHybridScores(
  deterministicScored: ScoredMemory[],
  keywordScored: ScoredMemory[],
  vectorScored: ScoredMemory[]
): ScoredMemory[] {
  const merged = new Map<string, ScoredMemory>();

  for (const entry of deterministicScored) {
    merged.set(entry.memory.id, {
      ...entry,
      signals: {
        ...entry.signals,
        modes: ["deterministic"]
      }
    });
  }

  const mergeEntry = (entry: ScoredMemory, source: RetrievalMode) => {
    const current = merged.get(entry.memory.id);
    if (!current) {
      merged.set(entry.memory.id, {
        ...entry,
        signals: {
          ...entry.signals,
          modes: [source]
        }
      });
      return;
    }

    const signals: ScoredMemory["signals"] = {
      ...current.signals,
      keywordMatch: current.signals.keywordMatch || entry.signals.keywordMatch,
      keywordRank: entry.signals.keywordRank ?? current.signals.keywordRank,
      vectorMatch: current.signals.vectorMatch || entry.signals.vectorMatch,
      vectorScore: entry.signals.vectorScore ?? current.signals.vectorScore,
      modes: Array.from(new Set([...(current.signals.modes ?? []), source]))
    };
    merged.set(entry.memory.id, {
      memory: current.memory,
      score: current.score + entry.score,
      signals,
      reason: describeReason(signals)
    });
  };

  for (const entry of keywordScored) {
    mergeEntry(entry, "keyword");
  }

  for (const entry of vectorScored) {
    mergeEntry(entry, "vector");
  }

  return Array.from(merged.values()).sort((left, right) => right.score - left.score);
}

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd);

  try {
    const mode = input.mode ?? "deterministic";
    const files = input.files ?? [];
    const queryTokens = tokenize(`${input.task} ${input.command ?? ""}`);
    const now = Date.now();
    const memories = excludeRelationSupersededMemories(
      loaded.repo.listMemories(loaded.project.projectId)
    );

    const visibleMemories = memories.filter((memory) =>
      isAgentVisibleMemory({
        memory,
        config: loaded.context.config,
        now
      })
    );
    const deterministicScored = visibleMemories
      .map((memory) => scoreMemory(memory, queryTokens, files, input.command))
      .filter(hasRelevanceSignal)
      .sort((left, right) => right.score - left.score);
    const keywordScored =
      mode === "keyword" || mode === "hybrid"
        ? scoreKeywordMatches({
            memories: visibleMemories,
            keywordMatches: loaded.repo.searchKeywordIndex(
              loaded.project.projectId,
              `${input.task} ${input.command ?? ""}`,
              Math.max(input.maxResults ?? loaded.context.config.retrieval.max_results, 1) * 4
            )
          })
        : [];
    const vectorScored =
      mode === "vector" || mode === "hybrid"
        ? scoreVectorMatches({
            memories: visibleMemories,
            vectorMatches: await searchVectorIndex({
              cwd: input.cwd,
              query: `${input.task} ${input.command ?? ""}`,
              limit: Math.max(input.maxResults ?? loaded.context.config.retrieval.max_results, 1) * 4
            })
          })
        : [];
    const scored =
      mode === "keyword"
        ? keywordScored
        : mode === "vector"
          ? vectorScored
        : mode === "hybrid"
          ? mergeHybridScores(deterministicScored, keywordScored, vectorScored)
          : deterministicScored;
    const resolved = selectResults(
      scored,
      input.maxResults ?? loaded.context.config.retrieval.max_results
    );
    let results = resolved.map((entry) => attachRetrievalMetadataForMode(entry, mode));
    let rerankReceipt: RerankReceipt | null = null;
    if (input.rerank || loaded.context.config.rerank.enabled) {
      const reranked = rerankMemories({
        memories: results,
        task: input.task,
        provider: input.reranker ?? loaded.context.config.rerank.provider,
        timeoutMs: loaded.context.config.rerank.timeout_ms
      });
      results = reranked.memories;
      rerankReceipt = reranked.receipt;
    }
    const matchedMemoryIds = results.map((memory) => memory.id);

    loaded.repo.markMemoriesRetrieved(matchedMemoryIds);

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "memory_retrieved",
      actor: "system",
      payload: {
        task: input.task,
        command: input.command ?? null,
        mode,
        matchedMemoryIds,
        rerank: rerankReceipt,
        scoring: resolved.map((entry) => ({
          memoryId: entry.memory.id,
          score: entry.score,
          reason: entry.reason,
          signals: entry.signals
        }))
      }
    });

    return results;
  } finally {
    loaded.close();
  }
}
