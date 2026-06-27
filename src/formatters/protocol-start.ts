import type { ProtocolStartResult } from "../domain/types.js";

const TEXT_NEXT_STEPS = [
  "Use the memory pack before planning.",
  "Run preflight before risky commands.",
  "Record evidence when meaningful.",
  "Propose memory candidates only for reusable learning.",
  "Finish the session and run protocol check before final response."
];

export function formatProtocolStart(result: ProtocolStartResult): string {
  return [
    `Started protocol session: ${result.sessionId}`,
    `Task: ${result.task}`,
    `Matched memories: ${result.pack.matchedMemoryIds.length}`,
    "Next:",
    ...TEXT_NEXT_STEPS.map((step) => `- ${step}`),
    "Memory pack:",
    result.pack.markdown
  ].join("\n");
}
