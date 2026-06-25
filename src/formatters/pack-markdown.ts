import type { MemoryRecord } from "../domain/types.js";

function renderSection(title: string, memories: MemoryRecord[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines = memories.map((memory) => `- ${memory.content}`);
  return [`## ${title}`, ...lines, ""].join("\n");
}

export function formatPackMarkdown(projectName: string, memories: MemoryRecord[]): string {
  const constraints = memories.filter((memory) =>
    memory.type === "command_policy" || memory.type === "constraint"
  );
  const decisions = memories.filter((memory) => memory.type === "decision");
  const failedAttempts = memories.filter((memory) => memory.type === "failed_attempt");
  const fragileFiles = memories.filter((memory) => memory.type === "fragile_file");
  const workflowRules = memories.filter((memory) => memory.type === "workflow_rule");

  return [
    "# Project Memory Pack",
    "",
    `Project: ${projectName}`,
    "",
    renderSection("Relevant Constraints", constraints),
    renderSection("Relevant Decisions", decisions),
    renderSection("Known Failed Attempts", failedAttempts),
    renderSection("Workflow Rules", workflowRules),
    renderSection("Fragile Files", fragileFiles),
    constraints.length > 0 ? "## Suggested Verification\n- Prefer safe local checks before risky commands.\n" : ""
  ]
    .filter(Boolean)
    .join("\n");
}
