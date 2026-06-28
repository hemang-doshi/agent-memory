import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveProjectRoot } from "../config/project-context.js";
import {
  AGENT_MEMORY_END_MARKER,
  AGENT_MEMORY_ROUTER_BLOCK,
  AGENT_MEMORY_START_MARKER
} from "../core/instructions-block.js";

export const ADAPTER_NAMES = [
  "codex",
  "claude-code",
  "cursor",
  "command-code",
  "opencode",
  "generic"
] as const;

export type AdapterName = (typeof ADAPTER_NAMES)[number];

export interface AdapterDefinition {
  id: AdapterName;
  adapter: AdapterName;
  displayName: string;
  targetPath: string;
  description: string;
}

export interface AdapterInstallInput {
  cwd: string;
  adapter: AdapterName | string;
}

export interface AdapterInstallResult {
  adapter: AdapterName;
  targetPath: string;
  absolutePath: string;
  path: string;
  routerInstalled: true;
}

export interface AdapterUninstallResult {
  adapter: AdapterName;
  targetPath: string;
  absolutePath: string;
  path: string;
  routerInstalled: false;
}

const ADAPTER_REGISTRY: Record<AdapterName, AdapterDefinition> = {
  codex: {
    id: "codex",
    adapter: "codex",
    displayName: "Codex",
    targetPath: "AGENTS.md",
    description: "OpenAI Codex project instructions."
  },
  "claude-code": {
    id: "claude-code",
    adapter: "claude-code",
    displayName: "Claude Code",
    targetPath: "CLAUDE.md",
    description: "Claude Code project instructions."
  },
  cursor: {
    id: "cursor",
    adapter: "cursor",
    displayName: "Cursor",
    targetPath: ".cursor/rules/agent-memory.mdc",
    description: "Cursor project rule for Agent Memory."
  },
  "command-code": {
    id: "command-code",
    adapter: "command-code",
    displayName: "Command Code",
    targetPath: ".commandcode/taste/agent-memory.md",
    description: "Command Code taste file for Agent Memory behavior."
  },
  opencode: {
    id: "opencode",
    adapter: "opencode",
    displayName: "OpenCode",
    targetPath: "AGENTS.md",
    description: "OpenCode project instructions."
  },
  generic: {
    id: "generic",
    adapter: "generic",
    displayName: "Generic",
    targetPath: "AGENTS.md",
    description: "Generic AGENTS.md project instructions."
  }
};

function assertAdapter(adapter: string): AdapterName {
  if (ADAPTER_NAMES.includes(adapter as AdapterName)) {
    return adapter as AdapterName;
  }

  throw new Error(
    `Unknown Agent Memory adapter: ${adapter}. Expected one of: ${ADAPTER_NAMES.join(", ")}.`
  );
}

function startMarker(adapter: AdapterName): string {
  return `<!-- agent-memory:adapter:${adapter}:start -->`;
}

function endMarker(adapter: AdapterName): string {
  return `<!-- agent-memory:adapter:${adapter}:end -->`;
}

function renderAdapterBlock(definition: AdapterDefinition): string {
  return AGENT_MEMORY_ROUTER_BLOCK.replace(AGENT_MEMORY_START_MARKER, startMarker(definition.adapter))
    .replace(AGENT_MEMORY_END_MARKER, endMarker(definition.adapter))
    .replace(
      "## Agent Memory Router\n\n",
      `## Agent Memory Router\n\nAdapter: ${definition.displayName}.\n\n`
    );
}

function upsertAdapterBlock(content: string, definition: AdapterDefinition): string {
  const start = content.indexOf(startMarker(definition.adapter));
  const end = content.indexOf(endMarker(definition.adapter));
  const block = renderAdapterBlock(definition);

  if (start !== -1 && end !== -1 && end > start) {
    const afterEnd = end + endMarker(definition.adapter).length;
    return `${content.slice(0, start)}${block}${content.slice(afterEnd)}`;
  }

  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n\n" : content.length > 0 ? "\n" : "";
  return `${content}${prefix}${block}\n`;
}

function removeAdapterBlock(content: string, adapter: AdapterName): string {
  const start = content.indexOf(startMarker(adapter));
  const end = content.indexOf(endMarker(adapter));

  if (start === -1 || end === -1 || end < start) {
    return content;
  }

  const afterEnd = end + endMarker(adapter).length;
  let next = `${content.slice(0, start)}${content.slice(afterEnd)}`.replace(/\n{3,}/g, "\n\n");

  if (start === 0) {
    next = next.replace(/^\n+/, "");
  }
  if (afterEnd === content.length) {
    next = next.replace(/\n+$/, "");
  }

  return next;
}

async function resolveAdapterTarget(cwd: string, adapter: AdapterName): Promise<{
  definition: AdapterDefinition;
  absolutePath: string;
}> {
  const { gitRoot } = await resolveProjectRoot(cwd);
  const definition = ADAPTER_REGISTRY[adapter];
  return {
    definition,
    absolutePath: join(gitRoot, definition.targetPath)
  };
}

export function listAdapters(): AdapterDefinition[] {
  return ADAPTER_NAMES.map((adapter) => ({ ...ADAPTER_REGISTRY[adapter] }));
}

export async function installAdapter(input: AdapterInstallInput): Promise<AdapterInstallResult> {
  const adapter = assertAdapter(input.adapter);
  const { definition, absolutePath } = await resolveAdapterTarget(input.cwd, adapter);
  const current = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
  const next = upsertAdapterBlock(current, definition);

  mkdirSync(dirname(absolutePath), { recursive: true });
  if (next !== current) {
    writeFileSync(absolutePath, next);
  }

  return {
    adapter,
    targetPath: definition.targetPath,
    absolutePath,
    path: absolutePath,
    routerInstalled: true
  };
}

export async function uninstallAdapter(input: AdapterInstallInput): Promise<AdapterUninstallResult> {
  const adapter = assertAdapter(input.adapter);
  const { definition, absolutePath } = await resolveAdapterTarget(input.cwd, adapter);

  if (!existsSync(absolutePath)) {
    return {
      adapter,
      targetPath: definition.targetPath,
      absolutePath,
      path: absolutePath,
      routerInstalled: false
    };
  }

  const current = readFileSync(absolutePath, "utf8");
  const next = removeAdapterBlock(current, adapter);
  if (next !== current) {
    writeFileSync(absolutePath, next);
  }

  return {
    adapter,
    targetPath: definition.targetPath,
    absolutePath,
    path: absolutePath,
    routerInstalled: false
  };
}
