import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  EventRecord,
  JsonRecord,
  MemoryCandidateRecord,
  MemoryRecord,
  ProjectRecord,
  ProtocolReceiptRecord,
  ReceiptType,
  SessionRecord
} from "../domain/types.js";

function parseJson<T>(value: unknown, fallback: T, field: string): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Corrupt Agent Memory database JSON field: ${field}`);
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export class AgentMemoryRepository {
  constructor(private readonly db: DatabaseSync) {}

  private transaction(work: () => void): void {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

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

  createMemoryWithEvent(
    memory: MemoryRecord,
    event: Omit<EventRecord, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }
  ): void {
    this.transaction(() => {
      this.insertMemory(memory);
      this.insertEvent(event);
    });
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

  updateMemoryWithEvent(
    memory: MemoryRecord,
    event: Omit<EventRecord, "eventId" | "timestamp"> & { eventId?: string; timestamp?: string }
  ): void {
    this.transaction(() => {
      this.updateMemory(memory);
      this.insertEvent(event);
    });
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

  insertSession(session: SessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
          session_id, project_id, task, status, started_at, finished_at, summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.sessionId,
        session.projectId,
        session.task,
        session.status,
        session.startedAt,
        session.finishedAt,
        session.summary
      );
  }

  getSession(sessionId: string): SessionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE session_id = ? LIMIT 1")
      .get(sessionId) as Record<string, unknown> | undefined;

    return row ? this.mapSession(row) : null;
  }

  finishSession({
    sessionId,
    finishedAt,
    summary
  }: {
    sessionId: string;
    finishedAt: string;
    summary: string;
  }): SessionRecord {
    this.db
      .prepare(
        `UPDATE sessions
         SET status = ?, finished_at = ?, summary = ?
         WHERE session_id = ?`
      )
      .run("finished", finishedAt, summary, sessionId);

    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return session;
  }

  insertProtocolReceipt(input: {
    projectId: string;
    sessionId?: string | null;
    receiptType: ReceiptType;
    payload?: JsonRecord;
    receiptId?: string;
    createdAt?: string;
  }): ProtocolReceiptRecord {
    const receipt: ProtocolReceiptRecord = {
      receiptId: input.receiptId ?? `rcp_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
      projectId: input.projectId,
      sessionId: input.sessionId ?? null,
      receiptType: input.receiptType,
      payload: input.payload ?? {},
      createdAt: input.createdAt ?? new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO protocol_receipts (
          receipt_id, project_id, session_id, receipt_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        receipt.receiptId,
        receipt.projectId,
        receipt.sessionId,
        receipt.receiptType,
        stringifyJson(receipt.payload),
        receipt.createdAt
      );

    return receipt;
  }

  listProtocolReceipts(projectId: string, sessionId?: string): ProtocolReceiptRecord[] {
    const rows = sessionId
      ? (this.db
          .prepare(
            `SELECT * FROM protocol_receipts
             WHERE project_id = ? AND session_id = ?
             ORDER BY created_at ASC`
          )
          .all(projectId, sessionId) as Record<string, unknown>[])
      : (this.db
          .prepare(
            `SELECT * FROM protocol_receipts
             WHERE project_id = ?
             ORDER BY created_at DESC`
          )
          .all(projectId) as Record<string, unknown>[]);

    return rows.map((row) => this.mapProtocolReceipt(row));
  }

  insertMemoryCandidate(candidate: MemoryCandidateRecord): void {
    this.db
      .prepare(
        `INSERT INTO memory_candidates (
          candidate_id, project_id, session_id, type, content, scope, source,
          confidence, severity, evidence, candidate_status, proposed_by,
          created_at, reviewed_at, review_reason, target_memory_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        candidate.candidateId,
        candidate.projectId,
        candidate.sessionId,
        candidate.type,
        candidate.content,
        candidate.scope,
        candidate.source,
        candidate.confidence,
        candidate.severity,
        candidate.evidence,
        candidate.candidateStatus,
        candidate.proposedBy,
        candidate.createdAt,
        candidate.reviewedAt,
        candidate.reviewReason,
        candidate.targetMemoryId
      );
  }

  getMemoryCandidate(candidateId: string): MemoryCandidateRecord | null {
    const row = this.db
      .prepare("SELECT * FROM memory_candidates WHERE candidate_id = ? LIMIT 1")
      .get(candidateId) as Record<string, unknown> | undefined;

    return row ? this.mapMemoryCandidate(row) : null;
  }

  updateMemoryCandidate(candidate: MemoryCandidateRecord): void {
    this.db
      .prepare(
        `UPDATE memory_candidates SET
          project_id = ?,
          session_id = ?,
          type = ?,
          content = ?,
          scope = ?,
          source = ?,
          confidence = ?,
          severity = ?,
          evidence = ?,
          candidate_status = ?,
          proposed_by = ?,
          created_at = ?,
          reviewed_at = ?,
          review_reason = ?,
          target_memory_id = ?
        WHERE candidate_id = ?`
      )
      .run(
        candidate.projectId,
        candidate.sessionId,
        candidate.type,
        candidate.content,
        candidate.scope,
        candidate.source,
        candidate.confidence,
        candidate.severity,
        candidate.evidence,
        candidate.candidateStatus,
        candidate.proposedBy,
        candidate.createdAt,
        candidate.reviewedAt,
        candidate.reviewReason,
        candidate.targetMemoryId,
        candidate.candidateId
      );
  }

  approveCandidateWithMemory(input: {
    candidate: MemoryCandidateRecord;
    memory: MemoryRecord;
    receipt: {
      projectId: string;
      sessionId?: string | null;
      receiptType: "candidate_reviewed";
      payload: JsonRecord;
    };
  }): void {
    this.transaction(() => {
      this.insertMemory(input.memory);
      this.updateMemoryCandidate(input.candidate);
      this.insertProtocolReceipt(input.receipt);
    });
  }

  rejectCandidateWithReceipt(input: {
    candidate: MemoryCandidateRecord;
    receipt: {
      projectId: string;
      sessionId?: string | null;
      receiptType: "candidate_reviewed";
      payload: JsonRecord;
    };
  }): void {
    this.transaction(() => {
      this.updateMemoryCandidate(input.candidate);
      this.insertProtocolReceipt(input.receipt);
    });
  }

  listMemoryCandidates(projectId: string, status?: string): MemoryCandidateRecord[] {
    const rows = status
      ? (this.db
          .prepare(
            `SELECT * FROM memory_candidates
             WHERE project_id = ? AND candidate_status = ?
             ORDER BY created_at DESC`
          )
          .all(projectId, status) as Record<string, unknown>[])
      : (this.db
          .prepare(
            `SELECT * FROM memory_candidates
             WHERE project_id = ?
             ORDER BY created_at DESC`
          )
          .all(projectId) as Record<string, unknown>[]);

    return rows.map((row) => this.mapMemoryCandidate(row));
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
      paths: parseJson(row.paths_json, [], "memories.paths_json"),
      tags: parseJson(row.tags_json, [], "memories.tags_json"),
      severity: String(row.severity) as MemoryRecord["severity"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
      relatedMemoryIds: parseJson(
        row.related_memory_ids_json,
        [],
        "memories.related_memory_ids_json"
      ),
      supersedesMemoryId: row.supersedes_memory_id ? String(row.supersedes_memory_id) : null,
      metadata: parseJson(row.metadata_json, {}, "memories.metadata_json")
    };
  }

  private mapEvent(row: Record<string, unknown>): EventRecord {
    return {
      eventId: String(row.event_id),
      projectId: String(row.project_id),
      eventType: String(row.event_type) as EventRecord["eventType"],
      timestamp: String(row.timestamp),
      actor: String(row.actor) as EventRecord["actor"],
      payload: parseJson(row.payload_json, {}, "events.payload_json")
    };
  }

  private mapSession(row: Record<string, unknown>): SessionRecord {
    return {
      sessionId: String(row.session_id),
      projectId: String(row.project_id),
      task: String(row.task),
      status: String(row.status) as SessionRecord["status"],
      startedAt: String(row.started_at),
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      summary: row.summary ? String(row.summary) : null
    };
  }

  private mapProtocolReceipt(row: Record<string, unknown>): ProtocolReceiptRecord {
    return {
      receiptId: String(row.receipt_id),
      projectId: String(row.project_id),
      sessionId: row.session_id ? String(row.session_id) : null,
      receiptType: String(row.receipt_type) as ProtocolReceiptRecord["receiptType"],
      payload: parseJson(row.payload_json, {}, "protocol_receipts.payload_json"),
      createdAt: String(row.created_at)
    };
  }

  private mapMemoryCandidate(row: Record<string, unknown>): MemoryCandidateRecord {
    return {
      candidateId: String(row.candidate_id),
      projectId: String(row.project_id),
      sessionId: row.session_id ? String(row.session_id) : null,
      type: String(row.type) as MemoryCandidateRecord["type"],
      content: String(row.content),
      scope: String(row.scope) as MemoryCandidateRecord["scope"],
      source: String(row.source) as MemoryCandidateRecord["source"],
      confidence: String(row.confidence) as MemoryCandidateRecord["confidence"],
      severity: String(row.severity) as MemoryCandidateRecord["severity"],
      evidence: String(row.evidence),
      candidateStatus: String(row.candidate_status) as MemoryCandidateRecord["candidateStatus"],
      proposedBy: String(row.proposed_by) as MemoryCandidateRecord["proposedBy"],
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      reviewReason: row.review_reason ? String(row.review_reason) : null,
      targetMemoryId: row.target_memory_id ? String(row.target_memory_id) : null
    };
  }
}
