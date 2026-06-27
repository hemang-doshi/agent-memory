import { CONFIDENCE_SCORES, SEVERITY_SCORES, TYPE_PRIORITIES } from "../domain/defaults.js";
import type { MemoryRecord, RetrieveMemoriesInput } from "../domain/types.js";
import { parseCommandPolicyMatchType } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { isAgentVisibleMemory } from "./memory-eligibility.js";

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
  if (signals.priority > 0) {
    reasons.push(`priority ${signals.priority}`);
  }
  return reasons.join(", ") || "eligible memory";
}

function excludeSuperseded(memories: MemoryRecord[]): MemoryRecord[] {
  const supersededIds = new Set(
    memories
      .map((memory) => memory.supersedesMemoryId)
      .filter((memoryId): memoryId is string => typeof memoryId === "string" && memoryId.length > 0)
  );
  return memories.filter((memory) => !supersededIds.has(memory.id));
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

export async function retrieveMemories(input: RetrieveMemoriesInput): Promise<MemoryRecord[]> {
  const loaded = await loadProject(input.cwd);

  try {
    const files = input.files ?? [];
    const queryTokens = tokenize(`${input.task} ${input.command ?? ""}`);
    const now = Date.now();
    const memories = excludeSuperseded(loaded.repo.listMemories(loaded.project.projectId));

    const scored = memories
      .filter((memory) =>
        isAgentVisibleMemory({
          memory,
          config: loaded.context.config,
          now
        })
      )
      .map((memory) => scoreMemory(memory, queryTokens, files, input.command))
      .filter(hasRelevanceSignal)
      .sort((left, right) => right.score - left.score);
    const resolved = selectResults(
      scored,
      input.maxResults ?? loaded.context.config.retrieval.max_results
    );
    const results = resolved.map(attachRetrievalMetadata);
    const matchedMemoryIds = results.map((memory) => memory.id);

    loaded.repo.markMemoriesRetrieved(matchedMemoryIds);

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "memory_retrieved",
      actor: "system",
      payload: {
        task: input.task,
        command: input.command ?? null,
        matchedMemoryIds,
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
