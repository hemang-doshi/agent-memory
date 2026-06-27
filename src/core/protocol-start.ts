import type { ProtocolStartResult } from "../domain/types.js";

import { generatePack } from "./generate-pack.js";
import { startSession } from "./session-start.js";

export const PROTOCOL_START_NEXT_STEPS = [
  "Use this memory pack before planning.",
  "Run preflight before risky commands.",
  "Record evidence when meaningful command results, test results, user corrections, or reusable observations happen.",
  "Propose memory candidates only for reusable learning.",
  "Finish the session and run protocol check before the final response."
];

export async function startProtocol({
  cwd,
  task
}: {
  cwd: string;
  task: string;
}): Promise<ProtocolStartResult> {
  const normalizedTask = task.trim();
  if (!normalizedTask) {
    throw new Error("protocol start requires a task description");
  }

  const session = await startSession({ cwd, task: normalizedTask });
  const pack = await generatePack({
    cwd,
    task: normalizedTask,
    sessionId: session.sessionId
  });

  return {
    sessionId: session.sessionId,
    task: normalizedTask,
    pack: {
      markdown: pack.markdown,
      matchedMemoryIds: pack.matchedMemoryIds
    },
    nextSteps: PROTOCOL_START_NEXT_STEPS
  };
}
