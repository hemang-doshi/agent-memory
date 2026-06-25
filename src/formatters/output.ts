import type { MemoryRecord, PreflightResult } from "../domain/types.js";

export function formatTextList(memories: MemoryRecord[]): string {
  if (memories.length === 0) {
    return "No memories found.";
  }

  return memories
    .map((memory) => `- [${memory.type}] ${memory.content} (${memory.status})`)
    .join("\n");
}

export function formatTextPreflight(result: PreflightResult): string {
  const lines = [
    `decision: ${result.decision}`,
    `reason: ${result.reason}`,
    `message: ${result.message}`
  ];

  if (result.suggestedAction) {
    lines.push(`suggested_action: ${result.suggestedAction}`);
  }

  return lines.join("\n");
}
