import { formatPackMarkdown } from "../formatters/pack-markdown.js";

import { loadProject } from "./context.js";
import { retrieveMemories } from "./retrieve-memories.js";

export async function generatePack({
  cwd,
  task
}: {
  cwd: string;
  task: string;
}): Promise<{ markdown: string; matchedMemoryIds: string[] }> {
  const loaded = await loadProject(cwd, false);

  try {
    const memories = await retrieveMemories({
      cwd,
      task,
      maxResults: loaded.context.config.retrieval.max_results
    });

    const markdown = formatPackMarkdown(loaded.project.name, memories).slice(
      0,
      loaded.context.config.memory_pack_token_budget * 4
    );

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "pack_generated",
      actor: "system",
      payload: { task, matchedMemoryIds: memories.map((memory) => memory.id) }
    });

    return {
      markdown,
      matchedMemoryIds: memories.map((memory) => memory.id)
    };
  } finally {
    loaded.close();
  }
}
