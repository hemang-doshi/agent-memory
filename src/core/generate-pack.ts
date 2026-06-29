import { buildPackSections, formatPackMarkdown, type PackSection } from "../formatters/pack-markdown.js";

import { loadProject } from "./context.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";
import { retrieveMemories } from "./retrieve-memories.js";

export async function generatePack({
  cwd,
  task,
  sessionId,
  files,
  command,
  maxResults,
  mode,
  rerank,
  reranker
}: {
  cwd: string;
  task: string;
  sessionId?: string;
  files?: string[];
  command?: string;
  maxResults?: number;
  mode?: import("../domain/types.js").RetrievalMode;
  rerank?: boolean;
  reranker?: import("../domain/types.js").RerankerMode;
}): Promise<{
  schemaVersion: "agent-memory.packet.v1";
  project: string;
  task: string;
  generatedAt: string;
  scope: string;
  safety: string;
  sections: PackSection[];
  markdown: string;
  matchedMemoryIds: string[];
  sessionId?: string;
}> {
  const loaded = await loadProject(cwd);

  try {
    if (sessionId) {
      requireSession(loaded, sessionId);
    }

    const memories = await retrieveMemories({
      cwd,
      task,
      files,
      command,
      maxResults: maxResults ?? loaded.context.config.retrieval.max_results,
      mode: mode ?? loaded.context.config.retrieval.default_mode,
      rerank,
      reranker
    });
    const matchedMemoryIds = memories.map((memory) => memory.id);
    loaded.repo.markMemoriesInjected(matchedMemoryIds);

    const generatedAt = new Date().toISOString();
    const budgetCharacters = loaded.context.config.memory_pack_token_budget * 4;
    const sections = buildPackSections(memories);
    const markdown = formatPackMarkdown(loaded.project.name, memories, {
      generatedAt,
      budgetCharacters
    });

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "pack_generated",
      actor: "system",
      payload: { task, files: files ?? [], command: command ?? null, matchedMemoryIds }
    });

    if (sessionId) {
      writeProtocolReceipt(loaded, {
        sessionId,
        receiptType: "pack_loaded",
        payload: {
          task,
          files: files ?? [],
          command: command ?? null,
          matchedMemoryIds,
          memoryCount: matchedMemoryIds.length
        }
      });
    }

    return {
      schemaVersion: "agent-memory.packet.v1",
      project: loaded.project.name,
      task,
      generatedAt,
      scope: loaded.context.config.default_scope,
      safety: "Secrets are blocked from trusted writes and blocked/redacted memories are not injected.",
      sections,
      markdown,
      matchedMemoryIds,
      ...(sessionId ? { sessionId } : {})
    };
  } finally {
    loaded.close();
  }
}
