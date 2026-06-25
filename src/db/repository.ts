import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { EventRecord, JsonRecord, MemoryRecord, ProjectRecord } from "../domain/types.js";

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  return JSON.parse(value) as T;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export class AgentMemoryRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsertProject(project: ProjectRecord): void {
    this.db
      .prepare(
        `INSERT INTO projects (
          project_id, name, git_root, git_remote_hash, created_at, updated_at, config_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          name = excluded.name,
          git_root = excluded.git_root,
          git_remote_hash = excluded.git_remote_hash,
          updated_at = excluded.updated_at,
          config_path = excluded.config_path`
      )
      .run(
        project.projectId,
        project.name,
        project.gitRoot,
        project.gitRemoteHash,
        project.createdAt,
        project.updatedAt,
        project.configPath
      );
  }

  getProjectByRoot(gitRoot: string): ProjectRecord | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE git_root = ? LIMIT 1")
      .get(gitRoot) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return {
      projectId: String(row.project_id),
      name: String(row.name),
      gitRoot: String(row.git_root),
      gitRemoteHash: row.git_remote_hash ? String(row.git_remote_hash) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      configPath: String(row.config_path)
    };
  }

  insertMemory(memory: MemoryRecord): void {
    this.db
      .prepare(
        `INSERT INTO memories (
          id, project_id, scope, type, content, summary, status, confidence, source,
          paths_json, tags_json, severity, created_at, updated_at, last_used_at,
          expires_at, related_memory_ids_json, supersedes_memory_id, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        memory.id,
        memory.projectId,
        memory.scope,
        memory.type,
        memory.content,
        memory.summary,
        memory.status,
        memory.confidence,
        memory.source,
        stringifyJson(memory.paths),
        stringifyJson(memory.tags),
        memory.severity,
        memory.createdAt,
        memory.updatedAt,
        memory.lastUsedAt,
        memory.expiresAt,
        stringifyJson(memory.relatedMemoryIds),
        memory.supersedesMemoryId,
        stringifyJson(memory.metadata)
      );

    this.syncMemoryLinks(memory.id, memory.relatedMemoryIds);
  }

  updateMemory(memory: MemoryRecord): void {
    this.db
      .prepare(
        `UPDATE memories SET
          scope = ?,
          type = ?,
          content = ?,
          summary = ?,
          status = ?,
          confidence = ?,
          source = ?,
          paths_json = ?,
          tags_json = ?,
          severity = ?,
          created_at = ?,
          updated_at = ?,
          last_used_at = ?,
          expires_at = ?,
          related_memory_ids_json = ?,
          supersedes_memory_id = ?,
          metadata_json = ?
        WHERE id = ?`
      )
      .run(
        memory.scope,
        memory.type,
        memory.content,
        memory.summary,
        memory.status,
        memory.confidence,
        memory.source,
        stringifyJson(memory.paths),
        stringifyJson(memory.tags),
        memory.severity,
        memory.createdAt,
        memory.updatedAt,
        memory.lastUsedAt,
        memory.expiresAt,
        stringifyJson(memory.relatedMemoryIds),
        memory.supersedesMemoryId,
        stringifyJson(memory.metadata),
        memory.id
      );

    this.syncMemoryLinks(memory.id, memory.relatedMemoryIds);
  }

  listMemories(projectId: string): MemoryRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE project_id = ? ORDER BY created_at DESC")
      .all(projectId) as Record<string, unknown>[];

    return rows.map((row) => this.mapMemory(row));
  }

  getMemory(memoryId: string): MemoryRecord | null {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE id = ? LIMIT 1")
      .get(memoryId) as Record<string, unknown> | undefined;

    return row ? this.mapMemory(row) : null;
  }

  insertEvent(input: Omit<EventRecord, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }): EventRecord {
    const event: EventRecord = {
      eventId: input.eventId ?? `evt_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      projectId: input.projectId,
      eventType: input.eventType,
      timestamp: input.timestamp ?? new Date().toISOString(),
      actor: input.actor,
      payload: input.payload
    };

    this.db
      .prepare(
        `INSERT INTO events (event_id, project_id, event_type, timestamp, actor, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.eventId,
        event.projectId,
        event.eventType,
        event.timestamp,
        event.actor,
        stringifyJson(event.payload)
      );

    return event;
  }

  listEvents(projectId: string, memoryId?: string): EventRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE project_id = ? ORDER BY timestamp DESC")
      .all(projectId) as Record<string, unknown>[];

    return rows
      .map((row) => this.mapEvent(row))
      .filter((event) => {
        if (!memoryId) {
          return true;
        }

        const payload = event.payload as JsonRecord;
        const matchedIds = Array.isArray(payload.matchedMemoryIds)
          ? payload.matchedMemoryIds
          : [];
        return payload.memoryId === memoryId || matchedIds.includes(memoryId);
      });
  }

  private syncMemoryLinks(memoryId: string, relatedIds: string[]): void {
    this.db.prepare("DELETE FROM memory_links WHERE memory_id = ?").run(memoryId);

    const insert = this.db.prepare(
      "INSERT INTO memory_links (memory_id, related_memory_id) VALUES (?, ?)"
    );

    for (const relatedId of relatedIds) {
      insert.run(memoryId, relatedId);
    }
  }

  private mapMemory(row: Record<string, unknown>): MemoryRecord {
    return {
      id: String(row.id),
      projectId: row.project_id ? String(row.project_id) : null,
      scope: String(row.scope) as MemoryRecord["scope"],
      type: String(row.type) as MemoryRecord["type"],
      content: String(row.content),
      summary: row.summary ? String(row.summary) : null,
      status: String(row.status) as MemoryRecord["status"],
      confidence: String(row.confidence) as MemoryRecord["confidence"],
      source: String(row.source) as MemoryRecord["source"],
      paths: parseJson(row.paths_json, []),
      tags: parseJson(row.tags_json, []),
      severity: String(row.severity) as MemoryRecord["severity"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      relatedMemoryIds: parseJson(row.related_memory_ids_json, []),
      supersedesMemoryId: row.supersedes_memory_id ? String(row.supersedes_memory_id) : null,
      metadata: parseJson(row.metadata_json, {})
    };
  }

  private mapEvent(row: Record<string, unknown>): EventRecord {
    return {
      eventId: String(row.event_id),
      projectId: String(row.project_id),
      eventType: String(row.event_type) as EventRecord["eventType"],
      timestamp: String(row.timestamp),
      actor: String(row.actor) as EventRecord["actor"],
      payload: parseJson(row.payload_json, {})
    };
  }
}
