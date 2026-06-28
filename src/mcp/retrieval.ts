import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, RetrievalMode } from "../domain/types.js";
import { parseCommandPolicyMatchType } from "../domain/validators.js";
import { selectAgentVisibleMemories } from "../core/memory-visibility.js";
import { buildPackSections, formatPackMarkdown } from "../formatters/pack-markdown.js";
import { searchVectorIndexReadOnly } from "../vector/vector-index.js";

import { McpRequestError, type LoadedReadOnlyProject, type McpPackResult, type RetrievalInput, type ScoredMemory } from "./types.js";

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length > 1)
    )
  );
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
  if (signals.pinned) reasons.push("pinned");
  if (signals.commandMatch) reasons.push("command match");
  if (signals.pathMatch) reasons.push("path match");
  if (signals.tagMatch) reasons.push("tag match");
  if (signals.tokenOverlap > 0) {
    reasons.push(`${signals.tokenOverlap} query token${signals.tokenOverlap === 1 ? "" : "s"}`);
  }
  if (signals.mistakeBoost) reasons.push("regression prevention");
  if (signals.keywordMatch) reasons.push("keyword match");
  if (signals.priority > 0) reasons.push(`priority ${signals.priority}`);
  return reasons.join(", ") || "eligible memory";
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
  if (memory.status === "active") score += 12;
  if (memory.pinned) score += 40;

  const haystack =
    `${memory.content} ${memory.summary ?? ""} ${memory.tags.join(" ")} ${memory.paths.join(" ")}`.toLowerCase();
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
  if (pathMatch) score += 12;

  const tagMatch = memory.tags.some((tag) => queryTokens.includes(tag.toLowerCase()));
  if (tagMatch) score += 10;

  const commandMatch = commandMatches(command, memory);
  if (commandMatch) score += 20;

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
  if (mistakeBoost) score += 18;

  const signals: ScoredMemory["signals"] = {
    tokenOverlap,
    pathMatch,
    tagMatch,
    commandMatch,
    pinned: memory.pinned,
    priority: memory.priority,
    recencyBoost,
    useCountBoost,
    mistakeBoost,
    conflictWinner: false,
    modes: ["deterministic"]
  };

  return { memory, score, signals, reason: describeReason(signals) };
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

function scoreKeywordMatches(
  memories: MemoryRecord[],
  keywordMatches: Array<{ memoryId: string; rank: number }>
): ScoredMemory[] {
  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  return keywordMatches.flatMap((match, index) => {
    const memory = byId.get(match.memoryId);
    if (!memory) return [];

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
      score: Math.max(0, 100 - index) + memory.priority * 8 + (memory.pinned ? 40 : 0),
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
    if (!memory) return [];

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

function mergeScores(...sources: ScoredMemory[][]): ScoredMemory[] {
  const merged = new Map<string, ScoredMemory>();
  for (const source of sources) {
    for (const entry of source) {
      const current = merged.get(entry.memory.id);
      if (!current) {
        merged.set(entry.memory.id, entry);
        continue;
      }

      const modes = Array.from(
        new Set([...(current.signals.modes ?? []), ...(entry.signals.modes ?? [])])
      ) as RetrievalMode[];
      const signals: ScoredMemory["signals"] = {
        ...current.signals,
        keywordMatch: current.signals.keywordMatch || entry.signals.keywordMatch,
        keywordRank: entry.signals.keywordRank ?? current.signals.keywordRank,
        vectorMatch: current.signals.vectorMatch || entry.signals.vectorMatch,
        vectorScore: entry.signals.vectorScore ?? current.signals.vectorScore,
        modes
      };
      merged.set(entry.memory.id, {
        memory: current.memory,
        score: current.score + entry.score,
        signals,
        reason: describeReason(signals)
      });
    }
  }
  return Array.from(merged.values());
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

  const conflictWinners = Array.from(winners.values()).map((entry) => {
    const signals = { ...entry.signals, conflictWinner: true };
    return {
      ...entry,
      signals,
      reason: `${describeReason(signals)}, conflict winner`
    };
  });

  return [...ungrouped, ...conflictWinners];
}

function selectResults(scored: ScoredMemory[], maxResults: number): ScoredMemory[] {
  const resolved = resolveConflictGroups(scored).sort((left, right) => right.score - left.score);
  const guaranteed = resolved.filter((entry) => entry.memory.pinned || entry.memory.priority > 0);
  const regular = resolved.filter((entry) => !entry.memory.pinned && entry.memory.priority <= 0);
  const selected: ScoredMemory[] = [];
  const seen = new Set<string>();

  for (const entry of [...guaranteed, ...regular]) {
    if (selected.length >= maxResults) break;
    if (seen.has(entry.memory.id)) continue;
    selected.push(entry);
    seen.add(entry.memory.id);
  }

  return selected;
}

function attachRetrievalMetadata(scored: ScoredMemory, mode: RetrievalMode): MemoryRecord {
  return {
    ...scored.memory,
    metadata: {
      ...scored.memory.metadata,
      retrieval: {
        score: scored.score,
        signals: scored.signals,
        reason: scored.reason,
        mode
      }
    }
  };
}

export function retrieveReadOnly(
  loaded: LoadedReadOnlyProject,
  input: RetrievalInput
): MemoryRecord[] {
  const mode = input.mode ?? "deterministic";
  const maxResults = Math.max(1, Math.floor(input.maxResults ?? loaded.config.retrieval.max_results));
  const query = `${input.task} ${input.command ?? ""}`;
  const visibleMemories = selectAgentVisibleMemories({
    memories: loaded.repo.listMemories(loaded.project.projectId),
    config: loaded.config,
    now: Date.now()
  });
  const deterministicScored = visibleMemories
    .map((memory) => scoreMemory(memory, tokenize(query), input.files ?? [], input.command))
    .filter(hasRelevanceSignal)
    .sort((left, right) => right.score - left.score);
  const keywordScored =
    mode === "keyword" || mode === "hybrid"
      ? scoreKeywordMatches(
          visibleMemories,
          loaded.repo.searchKeywordIndex(loaded.project.projectId, query, maxResults * 4)
        )
      : [];
  const visibleIds = new Set(visibleMemories.map((m) => m.id));
  const vectorMatches =
    mode === "vector" || mode === "hybrid"
      ? searchVectorIndexReadOnly({
          memoryDir: loaded.memoryDir,
          query,
          limit: maxResults * 4,
          visibleMemoryIds: visibleIds,
          projectId: loaded.project.projectId
        })
      : [];
  const vectorScored =
    vectorMatches.length > 0
      ? scoreVectorMatches({ memories: visibleMemories, vectorMatches })
      : [];
  const scored =
    mode === "keyword"
      ? keywordScored
      : mode === "vector"
        ? vectorScored
      : mode === "hybrid"
        ? mergeScores(deterministicScored, keywordScored, vectorScored)
        : deterministicScored;

  return selectResults(scored, maxResults).map((entry) => attachRetrievalMetadata(entry, mode));
}

export function generatePackReadOnly(
  loaded: LoadedReadOnlyProject,
  input: RetrievalInput
): McpPackResult {
  const memories = retrieveReadOnly(loaded, input);
  const generatedAt = new Date().toISOString();
  const budgetCharacters = loaded.config.memory_pack_token_budget * 4;

  return {
    schemaVersion: "agent-memory.packet.v1",
    project: loaded.project.name,
    task: input.task,
    generatedAt,
    scope: loaded.config.default_scope,
    safety: "Secrets are blocked from trusted writes and blocked/redacted memories are not injected.",
    sections: buildPackSections(memories),
    markdown: formatPackMarkdown(loaded.project.name, memories, { generatedAt, budgetCharacters }),
    matchedMemoryIds: memories.map((memory) => memory.id)
  };
}
