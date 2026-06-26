import type { MemoryRecord } from "../domain/types.js";

function renderSection(title: string, memories: MemoryRecord[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines = memories.map((memory) => `- ${memory.content}`);
  return [`## ${title}`, ...lines, ""].join("\n");
}

export function formatPackMarkdown(projectName: string, memories: MemoryRecord[]): string {
  const sections = [
    {
      title: "Critical Constraints",
      memories: memories.filter((memory) => memory.type === "command_policy" || memory.type === "constraint")
    },
    { title: "Relevant Decisions", memories: memories.filter((memory) => memory.type === "decision") },
    { title: "Preferences", memories: memories.filter((memory) => memory.type === "preference") },
    { title: "Known Failed Attempts", memories: memories.filter((memory) => memory.type === "failed_attempt") },
    { title: "Known Fixes", memories: memories.filter((memory) => memory.type === "known_fix") },
    { title: "Fragile Files", memories: memories.filter((memory) => memory.type === "fragile_file") },
    { title: "Workflow Rules", memories: memories.filter((memory) => memory.type === "workflow_rule") },
    { title: "Architecture Notes", memories: memories.filter((memory) => memory.type === "architecture_note") },
    { title: "Design Rules", memories: memories.filter((memory) => memory.type === "design_rule") },
    { title: "Rejected Approaches", memories: memories.filter((memory) => memory.type === "rejected_approach") },
    { title: "Pending Tasks", memories: memories.filter((memory) => memory.type === "pending_task") },
    { title: "Tool Quirks", memories: memories.filter((memory) => memory.type === "tool_quirk") }
  ];
  const renderedIds = new Set(sections.flatMap((section) => section.memories.map((memory) => memory.id)));
  const other = memories.filter((memory) => !renderedIds.has(memory.id));
  const hasConstraints = sections[0]?.memories.length ?? 0;

  return [
    "# Project Memory Pack",
    "",
    `Project: ${projectName}`,
    "",
    ...sections.map((section) => renderSection(section.title, section.memories)),
    renderSection("Other Relevant Memories", other),
    hasConstraints ? "## Suggested Verification\n- Prefer safe local checks before risky commands.\n" : ""
  ]
    .filter(Boolean)
    .join("\n");
}
