import { randomUUID } from "node:crypto";

import { ensureString } from "../domain/guards.js";
import type { CreateMemoryInput, MemoryRecord } from "../domain/types.js";
import {
  parseCommandPolicyMatchType,
  parseConfidenceLevel,
  parseMemoryScope,
  parseMemorySource,
  parseMemoryStatus,
  parseMemoryType,
  parsePreflightDecision,
  parseSeverityLevel,
  validateRegexPattern
} from "../domain/validators.js";

import { loadProject } from "./context.js";

function validateCommandPolicyMetadata(metadata: Record<string, unknown>): void {
  const commandPattern = metadata.commandPattern;
  if (typeof commandPattern !== "string" || commandPattern.trim().length === 0) {
    throw new Error("Missing required command policy metadata: commandPattern");
  }

  const matchType = parseCommandPolicyMatchType(metadata.matchType ?? "substring");
  parsePreflightDecision(metadata.decision ?? "warn");
  if (matchType === "regex") {
    validateRegexPattern(commandPattern);
  }
}

export async function createMemory(input: CreateMemoryInput): Promise<MemoryRecord> {
  const loaded = await loadProject(input.cwd);

  try {
    const now = new Date().toISOString();
    const type = parseMemoryType(input.type);
    const metadata = input.metadata ?? {};
    if (type === "command_policy") {
      validateCommandPolicyMetadata(metadata);
    }

    const memory: MemoryRecord = {
      id: `mem_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      projectId: loaded.project.projectId,
      scope: input.scope === undefined ? loaded.context.config.default_scope : parseMemoryScope(input.scope),
      type,
      content: ensureString(input.content, "content"),
      summary: input.summary ?? null,
      status: input.status === undefined ? "active" : parseMemoryStatus(input.status),
      confidence: input.confidence === undefined ? "high" : parseConfidenceLevel(input.confidence),
      source: parseMemorySource(input.source),
      paths: input.paths ?? [],
      tags: input.tags ?? [],
      severity: input.severity === undefined ? "medium" : parseSeverityLevel(input.severity),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: input.expiresAt ?? null,
      relatedMemoryIds: input.relatedMemoryIds ?? [],
      supersedesMemoryId: input.supersedesMemoryId ?? null,
      metadata
    };

    loaded.repo.createMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_created",
      actor: "user",
      payload: { memoryId: memory.id, type: memory.type, source: memory.source }
    });

    return memory;
  } finally {
    loaded.close();
  }
}
