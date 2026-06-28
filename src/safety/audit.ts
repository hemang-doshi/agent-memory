import type { MemoryRecord } from "../domain/types.js";
import { loadProject } from "../core/context.js";
import { isAgentVisibleMemory } from "../core/memory-eligibility.js";
import { scanForSecrets, type ScanFinding } from "../core/scan-secrets.js";

export interface SafetyAuditReport {
  projectId: string;
  generatedAt: string;
  summary: {
    totalMemories: number;
    injectableMemories: number;
    excludedMemories: number;
    findings: number;
  };
  excluded: Array<{
    memoryId: string;
    status: MemoryRecord["status"];
    redactionStatus: MemoryRecord["redactionStatus"];
    safetyFlags: string[];
    reason: string;
  }>;
  findings: ScanFinding[];
}

function exclusionReason(memory: MemoryRecord): string {
  if (memory.status === "quarantined") return "quarantined";
  if (memory.status === "superseded") return "superseded";
  if (memory.status === "archived" || memory.status === "rejected") return memory.status;
  if (memory.redactionStatus !== "none") return `redaction:${memory.redactionStatus}`;
  if (memory.safetyFlags.length > 0) return `safety:${memory.safetyFlags.join(",")}`;
  if (memory.metadata.doNotInclude === true) return "metadata:doNotInclude";
  return "not injectable by policy";
}

export async function auditSafety({ cwd }: { cwd: string }): Promise<SafetyAuditReport> {
  const loaded = await loadProject(cwd);
  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const excluded = memories
      .filter((memory) => !isAgentVisibleMemory({ memory, config: loaded.context.config }))
      .map((memory) => ({
        memoryId: memory.id,
        status: memory.status,
        redactionStatus: memory.redactionStatus,
        safetyFlags: memory.safetyFlags,
        reason: exclusionReason(memory)
      }));
    const scan = await scanForSecrets({ cwd, deep: true });
    return {
      projectId: loaded.project.projectId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalMemories: memories.length,
        injectableMemories: memories.length - excluded.length,
        excludedMemories: excluded.length,
        findings: scan.findings.length
      },
      excluded,
      findings: scan.findings
    };
  } finally {
    loaded.close();
  }
}

