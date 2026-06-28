import { loadProject } from "../core/context.js";
import { requireSession } from "../core/protocol-receipts.js";
import type {
  CandidateStatus,
  ConfidenceLevel,
  JsonRecord,
  MemoryCandidateRecord,
  MemoryRecord,
  MemoryScope,
  MemorySource,
  MemoryStatus,
  MemoryType,
  ProjectRecord,
  SeverityLevel,
  TrustLevel
} from "../domain/types.js";
import {
  assertNoObviousSecret,
  assertNoObviousSecretInUnknown,
  parseCandidateStatus,
  parseCandidateType,
  parseConfidenceLevel,
  parseMemoryScope,
  parseMemorySource,
  parseMemoryStatus,
  parseMemoryType,
  parseSeverityLevel,
  validateMemoryRecordForType
} from "../domain/validators.js";

export const AGENT_MEMORY_JSON_FORMAT = "agent-memory-v2-json";

export interface AgentMemoryJsonProvenance {
  projectId: string;
  projectName: string;
  gitRoot: string;
  gitRemoteHash: string | null;
}

export interface AgentMemoryJsonExport {
  format: typeof AGENT_MEMORY_JSON_FORMAT;
  version: 1;
  exportedAt: string;
  provenance: AgentMemoryJsonProvenance;
  memories: MemoryRecord[];
  candidates: MemoryCandidateRecord[];
}

export interface ExportMemoryJsonInput {
  cwd: string;
  includeMemories?: boolean;
  includeCandidates?: boolean;
  pretty?: boolean;
}

export interface ImportMemoryJsonInput {
  cwd: string;
  json: string | AgentMemoryJsonExport;
  sessionId?: string;
  importMemories?: boolean;
  importCandidates?: boolean;
  duplicateStrategy?: "skip" | "error";
}

export interface ImportMemoryJsonResult {
  memoriesImported: number;
  candidatesImported: number;
  importedMemoryIds: string[];
  importedCandidateIds: string[];
  skippedMemoryIds: string[];
  skippedCandidateIds: string[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid import JSON: ${label} must be an object.`);
  }
  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid import JSON: ${label} must be a string.`);
  }
  return value;
}

function readOptionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readString(value, label);
}

function readNumber(value: unknown, label: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid import JSON: ${label} must be a number.`);
  }
  return value;
}

function readBoolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid import JSON: ${label} must be a boolean.`);
  }
  return value;
}

function readStringArray(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid import JSON: ${label} must be a string array.`);
  }
  return value;
}

function readRedactionStatus(value: unknown): MemoryRecord["redactionStatus"] {
  if (value === undefined) {
    return "none";
  }
  if (value === "none" || value === "redacted" || value === "blocked") {
    return value;
  }
  throw new Error("Invalid import JSON: memories.redactionStatus is invalid.");
}

function readTrustLevel(value: unknown, label: string): TrustLevel {
  if (value === undefined) {
    return "reviewed";
  }
  if (value === "trusted" || value === "reviewed" || value === "low" || value === "untrusted") {
    return value;
  }
  throw new Error(`Invalid import JSON: ${label} is invalid.`);
}

function readProposedBy(value: unknown): MemoryCandidateRecord["proposedBy"] {
  if (value === "agent" || value === "user" || value === "system") {
    return value;
  }
  throw new Error("Invalid import JSON: candidates.proposedBy is invalid.");
}

function normalizeMetadata(value: unknown, label: string): JsonRecord {
  if (value === undefined) {
    return {};
  }
  return readRecord(value, label);
}

function normalizeMemory(raw: unknown): MemoryRecord {
  const record = readRecord(raw, "memories[]");
  const memory: MemoryRecord = {
    id: readString(record.id, "memories.id"),
    projectId: readOptionalString(record.projectId, "memories.projectId"),
    scope: parseMemoryScope(record.scope) as MemoryScope,
    type: parseMemoryType(record.type) as MemoryType,
    content: readString(record.content, "memories.content"),
    summary: readOptionalString(record.summary, "memories.summary"),
    status: parseMemoryStatus(record.status ?? "active") as MemoryStatus,
    confidence: parseConfidenceLevel(record.confidence ?? "medium") as ConfidenceLevel,
    source: parseMemorySource(record.source ?? "imported_doc") as MemorySource,
    paths: readStringArray(record.paths, "memories.paths"),
    tags: readStringArray(record.tags, "memories.tags"),
    severity: parseSeverityLevel(record.severity ?? "medium") as SeverityLevel,
    createdAt: readString(record.createdAt, "memories.createdAt"),
    updatedAt: readString(record.updatedAt, "memories.updatedAt"),
    lastUsedAt: readOptionalString(record.lastUsedAt, "memories.lastUsedAt"),
    pinned: readBoolean(record.pinned, "memories.pinned", false),
    priority: readNumber(record.priority, "memories.priority", 0),
    useCount: readNumber(record.useCount, "memories.useCount", 0),
    lastRetrievedAt: readOptionalString(record.lastRetrievedAt, "memories.lastRetrievedAt"),
    lastInjectedAt: readOptionalString(record.lastInjectedAt, "memories.lastInjectedAt"),
    expiresAt: readOptionalString(record.expiresAt, "memories.expiresAt"),
    relatedMemoryIds: readStringArray(record.relatedMemoryIds, "memories.relatedMemoryIds"),
    supersedesMemoryId: readOptionalString(record.supersedesMemoryId, "memories.supersedesMemoryId"),
    conflictGroup: readOptionalString(record.conflictGroup, "memories.conflictGroup"),
    safetyFlags: readStringArray(record.safetyFlags, "memories.safetyFlags"),
    redactionStatus: readRedactionStatus(record.redactionStatus),
    trustLevel: readTrustLevel(record.trustLevel, "memories.trustLevel"),
    metadata: normalizeMetadata(record.metadata, "memories.metadata")
  };

  scanMemory(memory);
  validateMemoryRecordForType(memory);
  return memory;
}

function normalizeCandidate(raw: unknown): MemoryCandidateRecord {
  const record = readRecord(raw, "candidates[]");
  const candidate: MemoryCandidateRecord = {
    candidateId: readString(record.candidateId, "candidates.candidateId"),
    projectId: readString(record.projectId, "candidates.projectId"),
    sessionId: readOptionalString(record.sessionId, "candidates.sessionId"),
    type: parseCandidateType(record.type),
    content: readString(record.content, "candidates.content"),
    scope: parseMemoryScope(record.scope) as MemoryScope,
    source: parseMemorySource(record.source ?? "imported_doc") as MemorySource,
    confidence: parseConfidenceLevel(record.confidence ?? "medium") as ConfidenceLevel,
    severity: parseSeverityLevel(record.severity ?? "medium") as SeverityLevel,
    evidence: readString(record.evidence, "candidates.evidence"),
    evidenceEventIds: readStringArray(record.evidenceEventIds, "candidates.evidenceEventIds"),
    candidateStatus: parseCandidateStatus(record.candidateStatus ?? "proposed") as CandidateStatus,
    proposedBy: readProposedBy(record.proposedBy),
    createdAt: readString(record.createdAt, "candidates.createdAt"),
    reviewedAt: readOptionalString(record.reviewedAt, "candidates.reviewedAt"),
    reviewReason: readOptionalString(record.reviewReason, "candidates.reviewReason"),
    targetMemoryId: readOptionalString(record.targetMemoryId, "candidates.targetMemoryId"),
    metadata: normalizeMetadata(record.metadata, "candidates.metadata")
  };

  scanCandidate(candidate);
  return candidate;
}

function normalizeEnvelope(value: unknown): AgentMemoryJsonExport {
  const envelope = readRecord(value, "root");
  if (envelope.format !== AGENT_MEMORY_JSON_FORMAT || envelope.version !== 1) {
    throw new Error(`Invalid import JSON: expected ${AGENT_MEMORY_JSON_FORMAT} version 1.`);
  }

  const provenance = readRecord(envelope.provenance, "provenance");
  const memories = envelope.memories === undefined ? [] : envelope.memories;
  const candidates = envelope.candidates === undefined ? [] : envelope.candidates;

  if (!Array.isArray(memories)) {
    throw new Error("Invalid import JSON: memories must be an array.");
  }
  if (!Array.isArray(candidates)) {
    throw new Error("Invalid import JSON: candidates must be an array.");
  }

  const normalized: AgentMemoryJsonExport = {
    format: AGENT_MEMORY_JSON_FORMAT,
    version: 1,
    exportedAt: readString(envelope.exportedAt, "exportedAt"),
    provenance: {
      projectId: readString(provenance.projectId, "provenance.projectId"),
      projectName: readString(provenance.projectName, "provenance.projectName"),
      gitRoot: readString(provenance.gitRoot, "provenance.gitRoot"),
      gitRemoteHash: readOptionalString(provenance.gitRemoteHash, "provenance.gitRemoteHash")
    },
    memories: memories.map(normalizeMemory),
    candidates: candidates.map(normalizeCandidate)
  };

  assertNoObviousSecretInUnknown(normalized.provenance, "provenance");
  return normalized;
}

function scanMemory(memory: MemoryRecord): void {
  assertNoObviousSecret(memory.content);
  if (memory.summary) {
    assertNoObviousSecret(memory.summary);
  }
  for (const path of memory.paths) {
    assertNoObviousSecret(path);
  }
  for (const tag of memory.tags) {
    assertNoObviousSecret(tag);
  }
  assertNoObviousSecretInUnknown(memory.metadata, "metadata");
}

function scanCandidate(candidate: MemoryCandidateRecord): void {
  assertNoObviousSecret(candidate.content);
  assertNoObviousSecret(candidate.evidence);
  assertNoObviousSecretInUnknown(candidate.metadata, "metadata");
}

function provenanceMetadata(input: {
  envelope: AgentMemoryJsonExport;
  kind: "memory" | "candidate";
  originalProjectId: string | null;
  originalRecordId: string;
  originalCreatedAt: string;
  importedAt: string;
}): JsonRecord {
  return {
    format: input.envelope.format,
    version: input.envelope.version,
    exportedAt: input.envelope.exportedAt,
    importedAt: input.importedAt,
    recordKind: input.kind,
    originalRecordId: input.originalRecordId,
    originalProjectId: input.originalProjectId,
    originalCreatedAt: input.originalCreatedAt,
    sourceProjectId: input.envelope.provenance.projectId,
    sourceProjectName: input.envelope.provenance.projectName,
    sourceGitRoot: input.envelope.provenance.gitRoot,
    sourceGitRemoteHash: input.envelope.provenance.gitRemoteHash
  };
}

function withImportProvenance(
  metadata: JsonRecord,
  provenance: JsonRecord
): JsonRecord {
  const merged = {
    ...metadata,
    agentMemoryProvenance: provenance
  };
  assertNoObviousSecretInUnknown(merged, "metadata");
  return merged;
}

export async function exportMemoryData({
  cwd,
  includeMemories = true,
  includeCandidates = true
}: ExportMemoryJsonInput): Promise<AgentMemoryJsonExport> {
  const loaded = await loadProject(cwd);

  try {
    const project: ProjectRecord = loaded.project;
    return {
      format: AGENT_MEMORY_JSON_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      provenance: {
        projectId: project.projectId,
        projectName: project.name,
        gitRoot: project.gitRoot,
        gitRemoteHash: project.gitRemoteHash
      },
      memories: includeMemories ? loaded.repo.listMemories(project.projectId) : [],
      candidates: includeCandidates ? loaded.repo.listMemoryCandidates(project.projectId) : []
    };
  } finally {
    loaded.close();
  }
}

export async function exportMemoryJson(input: ExportMemoryJsonInput): Promise<string> {
  const data = await exportMemoryData(input);
  return JSON.stringify(data, null, input.pretty === false ? 0 : 2);
}

export async function importMemoryJson({
  cwd,
  json,
  sessionId,
  importMemories = true,
  importCandidates = true,
  duplicateStrategy = "skip"
}: ImportMemoryJsonInput): Promise<ImportMemoryJsonResult> {
  const jsonText = typeof json === "string" ? json : JSON.stringify(json);
  assertNoObviousSecret(jsonText);
  const parsed = typeof json === "string" ? JSON.parse(jsonText) : json;
  const envelope = normalizeEnvelope(parsed);
  const memories = importMemories ? envelope.memories : [];
  const candidates = importCandidates ? envelope.candidates : [];
  const loaded = await loadProject(cwd);

  try {
    if (sessionId) {
      requireSession(loaded, sessionId);
    }

    const duplicateMemoryIds = memories
      .map((memory) => memory.id)
      .filter((memoryId) => loaded.repo.getMemory(memoryId) !== null);
    const duplicateCandidateIds = candidates
      .map((candidate) => candidate.candidateId)
      .filter((candidateId) => loaded.repo.getMemoryCandidate(candidateId) !== null);

    if (duplicateStrategy === "error" && (duplicateMemoryIds.length > 0 || duplicateCandidateIds.length > 0)) {
      throw new Error(
        `Import contains existing records: ${[...duplicateMemoryIds, ...duplicateCandidateIds].join(", ")}`
      );
    }

    const importedAt = new Date().toISOString();
    const importedMemoryIds: string[] = [];
    const importedCandidateIds: string[] = [];
    const pendingMemoryLinks: Array<{ memory: MemoryRecord; relatedMemoryIds: string[] }> = [];

    for (const memory of memories) {
      if (duplicateMemoryIds.includes(memory.id)) {
        continue;
      }

      const relatedMemoryIds = memory.relatedMemoryIds;
      const importedMemory: MemoryRecord = {
        ...memory,
        projectId: loaded.project.projectId,
        relatedMemoryIds: [],
        metadata: withImportProvenance(
          memory.metadata,
          provenanceMetadata({
            envelope,
            kind: "memory",
            originalProjectId: memory.projectId,
            originalRecordId: memory.id,
            originalCreatedAt: memory.createdAt,
            importedAt
          })
        )
      };
      validateMemoryRecordForType(importedMemory);
      loaded.repo.insertMemory(importedMemory);
      importedMemoryIds.push(importedMemory.id);
      pendingMemoryLinks.push({ memory: importedMemory, relatedMemoryIds });
    }

    for (const { memory, relatedMemoryIds } of pendingMemoryLinks) {
      const existingRelatedIds = relatedMemoryIds.filter((relatedMemoryId) => {
        const related = loaded.repo.getMemory(relatedMemoryId);
        return related?.projectId === loaded.project.projectId;
      });
      if (existingRelatedIds.length > 0) {
        loaded.repo.updateMemory({ ...memory, relatedMemoryIds: existingRelatedIds });
      }
    }

    for (const candidate of candidates) {
      if (duplicateCandidateIds.includes(candidate.candidateId)) {
        continue;
      }

      const targetMemory =
        candidate.targetMemoryId === null ? null : loaded.repo.getMemory(candidate.targetMemoryId);
      const importedCandidate: MemoryCandidateRecord = {
        ...candidate,
        projectId: loaded.project.projectId,
        sessionId: sessionId ?? null,
        targetMemoryId:
          targetMemory?.projectId === loaded.project.projectId ? candidate.targetMemoryId : null,
        metadata: withImportProvenance(
          candidate.metadata,
          provenanceMetadata({
            envelope,
            kind: "candidate",
            originalProjectId: candidate.projectId,
            originalRecordId: candidate.candidateId,
            originalCreatedAt: candidate.createdAt,
            importedAt
          })
        )
      };
      loaded.repo.insertMemoryCandidate(importedCandidate);
      importedCandidateIds.push(importedCandidate.candidateId);
    }

    return {
      memoriesImported: importedMemoryIds.length,
      candidatesImported: importedCandidateIds.length,
      importedMemoryIds,
      importedCandidateIds,
      skippedMemoryIds: duplicateMemoryIds,
      skippedCandidateIds: duplicateCandidateIds
    };
  } finally {
    loaded.close();
  }
}
