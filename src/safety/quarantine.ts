import type { MemoryRecord } from "../domain/types.js";
import { loadProject } from "../core/context.js";

export async function quarantineMemory({
  cwd,
  memoryId,
  reason,
  redact = false
}: {
  cwd: string;
  memoryId: string;
  reason: string;
  redact?: boolean;
}): Promise<MemoryRecord> {
  if (reason.trim().length === 0) {
    throw new Error("quarantine requires --reason");
  }

  const loaded = await loadProject(cwd);
  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory || memory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    if (memory.status === "quarantined") {
      throw new Error(`Memory is already quarantined: ${memoryId}`);
    }

    memory.status = "quarantined";
    memory.redactionStatus = redact ? "redacted" : memory.redactionStatus;
    memory.safetyFlags = Array.from(new Set([...memory.safetyFlags, "quarantined", "unsafe"]));
    memory.updatedAt = new Date().toISOString();
    memory.metadata = {
      ...memory.metadata,
      quarantine: {
        reason,
        redacted: redact,
        at: memory.updatedAt
      }
    };

    loaded.repo.updateMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: {
        memoryId,
        status: "quarantined",
        safetyFlags: memory.safetyFlags,
        reason,
        redacted: redact
      }
    });

    return memory;
  } finally {
    loaded.close();
  }
}

export async function unquarantineMemory({
  cwd,
  memoryId,
  reason
}: {
  cwd: string;
  memoryId: string;
  reason: string;
}): Promise<MemoryRecord> {
  if (reason.trim().length === 0) {
    throw new Error("unquarantine requires --reason");
  }

  const loaded = await loadProject(cwd);
  try {
    const memory = loaded.repo.getMemory(memoryId);
    if (!memory || memory.projectId !== loaded.project.projectId) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    if (memory.status !== "quarantined") {
      throw new Error(`Memory is not quarantined: ${memoryId} has status ${memory.status}`);
    }

    memory.status = "active";
    memory.redactionStatus = "none";
    memory.safetyFlags = memory.safetyFlags.filter(
      (flag) => flag !== "quarantined" && flag !== "unsafe"
    );
    memory.trustLevel = "reviewed";
    memory.updatedAt = new Date().toISOString();
    memory.metadata = {
      ...memory.metadata,
      unquarantine: {
        reason,
        at: memory.updatedAt,
        previousQuarantine: memory.metadata.quarantine
      }
    };

    loaded.repo.updateMemoryWithEvent(memory, {
      projectId: loaded.project.projectId,
      eventType: "memory_updated",
      actor: "user",
      payload: {
        memoryId,
        status: "active",
        safetyFlags: memory.safetyFlags,
        reason,
        unquarantined: true
      }
    });

    return memory;
  } finally {
    loaded.close();
  }
}

