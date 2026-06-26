import { formatPackMarkdown } from "../formatters/pack-markdown.js";

import { loadProject } from "./context.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";
import { retrieveMemories } from "./retrieve-memories.js";

export async function generatePack({
  cwd,
  task,
  sessionId
}: {
  cwd: string;
  task: string;
  sessionId?: string;
}): Promise<{ markdown: string; matchedMemoryIds: string[]; sessionId?: string }> {
  const loaded = await loadProject(cwd);

  try {
    if (sessionId) {
      requireSession(loaded, sessionId);
    }

    const memories = await retrieveMemories({
      cwd,
      task,
      maxResults: loaded.context.config.retrieval.max_results
    });
    const matchedMemoryIds = memories.map((memory) => memory.id);

    const markdown = formatPackMarkdown(loaded.project.name, memories).slice(
      0,
      loaded.context.config.memory_pack_token_budget * 4
    );

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "pack_generated",
      actor: "system",
      payload: { task, matchedMemoryIds }
    });

    if (sessionId) {
      writeProtocolReceipt(loaded, {
        sessionId,
        receiptType: "pack_loaded",
        payload: {
          task,
          matchedMemoryIds,
          memoryCount: matchedMemoryIds.length
        }
      });
    }

    return {
      markdown,
      matchedMemoryIds,
      ...(sessionId ? { sessionId } : {})
    };
  } finally {
    loaded.close();
  }
}
