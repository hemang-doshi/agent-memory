export const AGENT_MEMORY_START_MARKER = "<!-- agent-memory:start -->";
export const AGENT_MEMORY_END_MARKER = "<!-- agent-memory:end -->";

export const AGENT_MEMORY_ROUTER_BLOCK = `${AGENT_MEMORY_START_MARKER}
## Agent Memory Router

This repo uses Agent Memory as a local-first behavior layer for coding agents.

Default mode: always memory-aware, rarely noisy.

For every task:

1. Start the protocol before planning or editing:

   \`agentmem protocol start "<task>" --json\`

   Use the returned memory pack before deciding what to do. Keep the returned \`sessionId\` for all later Agent Memory commands.

2. Run preflight before risky commands:
   \`agentmem preflight --command "<command>" --session <session-id> --json\`

   Risky commands include install/build/render/migration/delete/network/destructive commands. Do not preflight harmless read-only commands unless they are risky in context.

3. Record evidence only when something meaningful happens:
   \`agentmem event record --session <session-id> --type <type> --summary "..." --json\`

   Good evidence includes test results, command results, user corrections, and reusable observations. Do not record events for trivial observations.

4. Propose memory candidates only for reusable learning:
   \`agentmem candidate propose --session <session-id> --type <type> --content "..." --evidence "..." --json\`

   Good candidates include failed approaches, successful fixes, agent mistakes, workflow rules, and command-policy candidates. Candidates are untrusted until reviewed.

5. If unsure whether something should become memory, do not interrupt constantly. Collect uncertainty and surface it in a compact manage-memory review:
   \`agentmem manage --plan\`

   Do not run manage mode on every task unless there are memory decisions to review.

6. Finish the session and check compliance before the final response:
   \`agentmem session finish --session <session-id> --summary "..." --json\`
   \`agentmem protocol check --session <session-id> --json\`

For non-trivial work, include a compact protocol compliance summary in the final response.

Safety rules:

* Do not store secrets.
* Do not propose memory for one-off task details.
* Do not record events for trivial observations.
* Do not ask the user after every possible memory.
* Do not create trusted durable memory directly unless an explicit Agent Memory command supports it.
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
