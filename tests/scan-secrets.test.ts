import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";

import { createMemory } from "../src/core/create-memory.js";
import { initProject } from "../src/core/init-project.js";
import { scanForSecrets } from "../src/core/scan-secrets.js";
import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("secret scanning", () => {
  test("scan reports no findings on clean store", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-clean");
    workspaces.push(cwd);
    await initProject({ cwd });

    await createMemory({
      cwd,
      content: "Use pnpm for package operations.",
      type: "workflow_rule",
      source: "cli"
    });

    const result = await scanForSecrets({ cwd });
    expect(result.findings).toEqual([]);
    expect(result.summary).toBe("No potential secrets found.");
  });

  test("scan detects secrets in memory content via raw DB insert", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-memory");
    workspaces.push(cwd);
    await initProject({ cwd });

    // Insert a memory with a secret directly via SQL to bypass write-time checks
    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const projectId = (db.prepare("SELECT project_id FROM projects LIMIT 1").get() as { project_id: string }).project_id;
    db.prepare(
      `INSERT INTO memories (id, project_id, scope, type, content, summary, status, confidence, source, paths_json, tags_json, severity, created_at, updated_at, last_used_at, pinned, priority, use_count, last_retrieved_at, last_injected_at, expires_at, related_memory_ids_json, supersedes_memory_id, conflict_group, safety_flags_json, redaction_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mem_awstest", projectId, "project", "decision",
      "AKIA1234567890ABCDEF was used here.",
      null, "active", "high", "cli",
      "[]", "[]", "medium",
      new Date().toISOString(), new Date().toISOString(), null,
      0, 0, 0, null, null, null,
      "[]", null, null, "[]", "none", "{}"
    );
    db.close();

    const result = await scanForSecrets({ cwd });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.label === "AWS access key")).toBe(true);
  });

  test("scan detects database connection strings", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-connstr");
    workspaces.push(cwd);
    await initProject({ cwd });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const projectId = (db.prepare("SELECT project_id FROM projects LIMIT 1").get() as { project_id: string }).project_id;
    db.prepare(
      `INSERT INTO memories (id, project_id, scope, type, content, summary, status, confidence, source, paths_json, tags_json, severity, created_at, updated_at, last_used_at, pinned, priority, use_count, last_retrieved_at, last_injected_at, expires_at, related_memory_ids_json, supersedes_memory_id, conflict_group, safety_flags_json, redaction_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mem_connstr", projectId, "project", "decision",
      "Used mongodb://admin:secret123@localhost:27017/db",
      null, "active", "high", "cli",
      "[]", "[]", "medium",
      new Date().toISOString(), new Date().toISOString(), null,
      0, 0, 0, null, null, null,
      "[]", null, null, "[]", "none", "{}"
    );
    db.close();

    const result = await scanForSecrets({ cwd });
    expect(result.findings.some((finding) => finding.label.includes("connection string"))).toBe(true);
  });

  test("createMemory still rejects new secrets via expanded patterns", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-create-reject");
    workspaces.push(cwd);
    await initProject({ cwd });

    const secrets = [
      "GitHub token: ghp_123456789012345678901234567890123456",
      "AWS key AKIA1234567890ABCDEF",
      "OpenAI key sk-proj-123",
      "mongodb://admin:password123@localhost/db",
      "-----BEGIN RSA PRIVATE KEY-----",
      "xoxb-slack-token-here",
      "AIza" + "A".repeat(35),
    ];

    for (const secret of secrets) {
      await expect(
        createMemory({ cwd, content: secret, type: "decision", source: "cli" })
      ).rejects.toThrow("possible secret detected");
    }
  });

  test("scan detects secrets in memory metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-metadata");
    workspaces.push(cwd);
    await initProject({ cwd });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const projectId = (db.prepare("SELECT project_id FROM projects LIMIT 1").get() as { project_id: string }).project_id;
    db.prepare(
      `INSERT INTO memories (id, project_id, scope, type, content, summary, status, confidence, source, paths_json, tags_json, severity, created_at, updated_at, last_used_at, pinned, priority, use_count, last_retrieved_at, last_injected_at, expires_at, related_memory_ids_json, supersedes_memory_id, conflict_group, safety_flags_json, redaction_status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mem_meta", projectId, "project", "command_policy",
      "Call internal API carefully.",
      null, "active", "high", "cli",
      "[]", "[]", "medium",
      new Date().toISOString(), new Date().toISOString(), null,
      0, 0, 0, null, null, null,
      "[]", null, null, "[]", "none",
      JSON.stringify({
        commandPattern: "curl",
        matchType: "substring",
        decision: "warn",
        suggestedAction: "Use token=abc123 for auth."
      })
    );
    db.close();

    const result = await scanForSecrets({ cwd });
    expect(result.findings.some((finding) => finding.id === "mem_meta" && finding.field === "metadata")).toBe(true);
  });

  test("scan detects secrets in candidate metadata", async () => {
    const cwd = await createTempWorkspace("agentmem-scan-cand-meta");
    workspaces.push(cwd);
    await initProject({ cwd });

    const db = new DatabaseSync(`${cwd}/.agent-memory/memory.db`);
    const projectId = (db.prepare("SELECT project_id FROM projects LIMIT 1").get() as { project_id: string }).project_id;
    db.prepare(
      `INSERT INTO memory_candidates (candidate_id, project_id, session_id, type, content, scope, source, confidence, severity, evidence, evidence_event_ids_json, candidate_status, proposed_by, created_at, reviewed_at, review_reason, target_memory_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "cand_meta", projectId, null, "command_policy",
      "Be careful with deploys.", "project", "agent_reported", "medium", "medium",
      "Deploy evidence.", "[]", "proposed", "agent",
      new Date().toISOString(), null, null, null,
      JSON.stringify({
        commandPattern: "deploy",
        matchType: "substring",
        decision: "block",
        suggestedAction: "Use Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0 for auth."
      })
    );
    db.close();

    const result = await scanForSecrets({ cwd });
    expect(result.findings.some((finding) => finding.id === "cand_meta" && finding.field === "metadata")).toBe(true);
  });
});
