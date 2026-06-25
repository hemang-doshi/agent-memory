import type { JsonRecord, PreflightDecision, PreflightResult } from "../domain/types.js";

import { loadProject } from "./context.js";

function commandMatches(command: string, metadata: JsonRecord): boolean {
  const pattern = typeof metadata.commandPattern === "string" ? metadata.commandPattern : "";
  const matchType = typeof metadata.matchType === "string" ? metadata.matchType : "substring";

  if (!pattern) {
    return false;
  }

  switch (matchType) {
    case "exact":
      return command === pattern;
    case "regex":
      return new RegExp(pattern).test(command);
    default:
      return command.includes(pattern);
  }
}

export async function preflightCommand({
  cwd,
  command
}: {
  cwd: string;
  command: string;
}): Promise<PreflightResult> {
  const loaded = await loadProject(cwd, false);

  try {
    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const matched = memories.filter(
      (memory) =>
        memory.status === "active" &&
        memory.type === "command_policy" &&
        commandMatches(command, memory.metadata)
    );

    let decision: PreflightDecision = "allow";
    let reason = "No matching project memory.";
    let message = "No relevant risk found for this command.";
    let suggestedAction: string | undefined;

    if (matched.length > 0) {
      const highest = matched[0]!;
      decision = (highest.metadata.decision as PreflightDecision | undefined) ?? "warn";
      reason = "Matched active command policy.";
      message = highest.content;
      suggestedAction =
        typeof highest.metadata.suggestedAction === "string"
          ? highest.metadata.suggestedAction
          : undefined;
    }

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "command_preflighted",
      actor: "system",
      payload: {
        command,
        decision,
        matchedMemoryIds: matched.map((memory) => memory.id)
      }
    });

    return {
      decision,
      reason,
      message,
      matchedMemoryIds: matched.map((memory) => memory.id),
      suggestedAction
    };
  } finally {
    loaded.close();
  }
}
