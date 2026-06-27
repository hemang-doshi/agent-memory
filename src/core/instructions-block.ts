export const AGENT_MEMORY_START_MARKER = "<!-- agent-memory:start -->";
export const AGENT_MEMORY_END_MARKER = "<!-- agent-memory:end -->";

export const AGENT_MEMORY_ROUTER_BLOCK = `${AGENT_MEMORY_START_MARKER}
## Agent Memory Router

This repo uses Agent Memory.

Use memory only at natural checkpoints:

1. Before planning a non-trivial change, run:
   \`agentmem session start "<task>" --json\`
   then:
   \`agentmem pack "<task>" --session <session-id> --json\`

2. Before risky commands, run:
   \`agentmem preflight --command "<command>" --session <session-id> --json\`

3. After a failed approach, successful fix, user correction, or discovered reusable repo rule, propose a memory candidate:
   \`agentmem candidate propose --session <session-id> --type <type> --content "..." --evidence "..." [--evidence-event <event-id>] --json\`

4. At the end of the task, finish the session and include a compact memory receipt:
   \`agentmem session finish --session <session-id> --summary "..." --json\`
   \`agentmem session receipt --session <session-id> --json\`

Do not store secrets, one-off task details, obvious repo facts, or low-confidence guesses as trusted memory.
${AGENT_MEMORY_END_MARKER}`;

export function hasRouterInstalled(content: string): boolean {
  return content.includes(AGENT_MEMORY_START_MARKER) && content.includes(AGENT_MEMORY_END_MARKER);
}

export function upsertRouterBlock(content: string): string {
  const start = content.indexOf(AGENT_MEMORY_START_MARKER);
  const end = content.indexOf(AGENT_MEMORY_END_MARKER);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + AGENT_MEMORY_END_MARKER.length;
    return `${content.slice(0, start)}${AGENT_MEMORY_ROUTER_BLOCK}${content.slice(afterEnd)}`;
  }

  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n\n" : content.length > 0 ? "\n" : "";
  return `${content}${prefix}${AGENT_MEMORY_ROUTER_BLOCK}\n`;
}

export function removeRouterBlock(content: string): string {
  const start = content.indexOf(AGENT_MEMORY_START_MARKER);
  const end = content.indexOf(AGENT_MEMORY_END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    return content;
  }

  const afterEnd = end + AGENT_MEMORY_END_MARKER.length;
  return `${content.slice(0, start)}${content.slice(afterEnd)}`.replace(/\n{3,}/g, "\n\n").trim();
}
