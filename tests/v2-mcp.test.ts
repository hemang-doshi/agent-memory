import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import type { MemoryRecord } from "../src/domain/types.js";
import {
  getMcpManifest,
  handleMcpRequest,
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  type McpScanResult
} from "../src/mcp/core.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

function insertUnsafeMemory(cwd: string, content: string): string {
  const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
  try {
    const projectId = (db.prepare("SELECT project_id FROM projects LIMIT 1").get() as {
      project_id: string;
    }).project_id;
    const memoryId = "mem_mcpunsafe";
    db.prepare(
      `INSERT INTO memories (
        id, project_id, scope, type, content, summary, status, confidence, source,
        paths_json, tags_json, severity, created_at, updated_at, last_used_at,
        pinned, priority, use_count, last_retrieved_at, last_injected_at,
        expires_at, related_memory_ids_json, supersedes_memory_id, conflict_group,
        safety_flags_json, redaction_status, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      memoryId,
      projectId,
      "project",
      "decision",
      content,
      null,
      "active",
      "high",
      "cli",
      "[]",
      "[]",
      "medium",
      new Date().toISOString(),
      new Date().toISOString(),
      null,
      0,
      0,
      0,
      null,
      null,
      null,
      "[]",
      null,
      null,
      "[]",
      "none",
      "{}"
    );
    return memoryId;
  } finally {
    db.close();
  }
}

describe("Agent Memory V2 MCP core", () => {
  test("manifest exposes read-only defaults and disabled write tools", async () => {
    const cwd = await createTempWorkspace("agentmem-mcp-manifest");
    workspaces.push(cwd);
    await initProject({ cwd });

    const manifest = await getMcpManifest({ cwd });

    expect(manifest.server).toMatchObject({
      name: "agent-memory",
      readOnlyDefault: true,
      shellCommands: false
    });
    expect(manifest.permissions).toEqual({
      writeToolsEnabled: false,
      candidateApprovalEnabled: false
    });
    expect(manifest.resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining(Object.values(MCP_RESOURCE_URIS))
    );
    expect(manifest.tools.find((tool) => tool.name === MCP_TOOL_NAMES.retrieve)).toMatchObject({
      readOnly: true,
      enabled: true
    });
    expect(manifest.tools.find((tool) => tool.name === MCP_TOOL_NAMES.createMemory)).toMatchObject({
      readOnly: false,
      enabled: false
    });
    expect(manifest.tools.find((tool) => tool.name === MCP_TOOL_NAMES.approveCandidate)).toMatchObject({
      readOnly: false,
      enabled: false
    });
  });

  test("refuses uninitialized project roots", async () => {
    const cwd = await createTempWorkspace("agentmem-mcp-uninit");
    workspaces.push(cwd);

    await expect(getMcpManifest({ cwd })).rejects.toMatchObject({
      code: "not_initialized"
    });
    await expect(handleMcpRequest({ cwd, method: "tools/list" })).rejects.toThrow(
      "Run `agentmem init` first"
    );
  });

  test("retrieves and explains memory without updating retrieval counters", async () => {
    const cwd = await createTempWorkspace("agentmem-mcp-retrieve");
    workspaces.push(cwd);
    await initProject({ cwd });
    const memory = await createMemory({
      cwd,
      content: "Use pnpm for package operations to avoid lockfile drift.",
      type: "workflow_rule",
      source: "cli",
      tags: ["package-manager"],
      paths: ["package.json"]
    });
    await createMemory({
      cwd,
      content: "Keep unrelated UI notes separate.",
      type: "design_rule",
      source: "cli"
    });

    const retrieved = (await handleMcpRequest({
      cwd,
      method: "tools/call",
      params: {
        name: MCP_TOOL_NAMES.retrieve,
        arguments: {
          task: "fix package manager lockfile drift",
          files: ["package.json"],
          maxResults: 4
        }
      }
    })) as MemoryRecord[];

    const matched = retrieved.find((item) => item.id === memory.id);
    expect(matched).toBeTruthy();
    expect(matched?.metadata.retrieval).toMatchObject({
      mode: "deterministic",
      reason: expect.stringContaining("query token")
    });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    try {
      const row = db.prepare("SELECT use_count FROM memories WHERE id = ?").get(memory.id) as {
        use_count: number;
      };
      const retrievalEvents = db
        .prepare("SELECT COUNT(*) AS count FROM events WHERE event_type = 'memory_retrieved'")
        .get() as { count: number };
      expect(row.use_count).toBe(0);
      expect(retrievalEvents.count).toBe(0);
    } finally {
      db.close();
    }

    const explained = (await handleMcpRequest({
      cwd,
      method: MCP_TOOL_NAMES.explain,
      params: { memoryId: memory.id }
    })) as { memory: MemoryRecord; relatedEvents: Array<{ eventType: string }> };

    expect(explained.memory.id).toBe(memory.id);
    expect(explained.relatedEvents.some((event) => event.eventType === "memory_created")).toBe(true);
  });

  test("scans memories through the MCP read tool", async () => {
    const cwd = await createTempWorkspace("agentmem-mcp-scan");
    workspaces.push(cwd);
    await initProject({ cwd });
    const memoryId = insertUnsafeMemory(cwd, "AKIA1234567890ABCDEF was copied into notes.");

    const scan = (await handleMcpRequest({
      cwd,
      method: MCP_TOOL_NAMES.scan,
      params: {}
    })) as McpScanResult;

    expect(scan.summary).toContain("Found");
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        source: "memory",
        id: memoryId,
        field: "content",
        label: "AWS access key"
      })
    );
  });

  test("rejects write tools unless enabled, then executes gated protocol and candidate writes", async () => {
    const cwd = await createTempWorkspace("agentmem-mcp-write-reject");
    workspaces.push(cwd);
    await initProject({ cwd });

    await expect(
      handleMcpRequest({
        cwd,
        method: "tools/call",
        params: {
          name: MCP_TOOL_NAMES.createMemory,
          arguments: {
            content: "Do not write through default MCP.",
            type: "decision",
            source: "cli"
          }
        }
      })
    ).rejects.toMatchObject({
      code: "write_disabled"
    });

    const configPath = `${cwd}/.agent-memory/config.json`;
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      mcp: { write_tools_enabled: boolean; candidate_approval_enabled: boolean };
    };
    config.mcp.write_tools_enabled = true;
    config.mcp.candidate_approval_enabled = false;
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const manifest = await getMcpManifest({ cwd });
    expect(manifest.tools.find((tool) => tool.name === MCP_TOOL_NAMES.createMemory)).toMatchObject({
      enabled: true
    });
    expect(manifest.tools.find((tool) => tool.name === MCP_TOOL_NAMES.approveCandidate)).toMatchObject({
      enabled: false
    });
    const created = await handleMcpRequest({
      cwd,
      method: "memory.create",
      params: {
        content: "MCP writes use pnpm for package operations.",
        type: "workflow_rule",
        source: "cli"
      }
    }) as MemoryRecord;
    expect(created.content).toContain("MCP writes use pnpm");

    const protocol = await handleMcpRequest({
      cwd,
      method: "protocol.start",
      params: { task: "MCP write smoke" }
    }) as { sessionId: string };
    expect(protocol.sessionId).toMatch(/^ses_/);

    await expect(handleMcpRequest({
      cwd,
      method: "preflight",
      params: { command: "pnpm test", sessionId: protocol.sessionId }
    })).resolves.toMatchObject({
      decision: expect.any(String)
    });

    const event = await handleMcpRequest({
      cwd,
      method: "event.record",
      params: {
        sessionId: protocol.sessionId,
        type: "command_result",
        summary: "MCP write smoke command passed.",
        command: "pnpm test",
        exitCode: 0
      }
    }) as { eventId: string };
    expect(event.eventId).toMatch(/^evt_/);

    const candidate = await handleMcpRequest({
      cwd,
      method: "candidate.propose",
      params: {
        sessionId: protocol.sessionId,
        type: "workflow_rule",
        content: "Use pnpm for MCP write smoke tests.",
        evidence: "MCP write smoke."
      }
    }) as { candidateId: string };
    expect(candidate.candidateId).toMatch(/^cand_/);

    await expect(handleMcpRequest({
      cwd,
      method: "protocol.check",
      params: { sessionId: protocol.sessionId }
    })).resolves.toMatchObject({
      sessionId: protocol.sessionId
    });

    await expect(
      handleMcpRequest({
        cwd,
        method: "candidate.approve",
        params: { candidateId: "cand_missing" }
      })
    ).rejects.toMatchObject({
      code: "candidate_approval_disabled"
    });
  });
});
