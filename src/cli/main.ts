#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";

import { listAdapters, installAdapter, uninstallAdapter } from "../adapters/registry.js";
import { createMemory } from "../core/create-memory.js";
import { doctor } from "../core/doctor.js";
import { explainMemory } from "../core/explain-memory.js";
import { forgetMemory } from "../core/forget-memory.js";
import { generatePack } from "../core/generate-pack.js";
import { initProject } from "../core/init-project.js";
import { installInstructions } from "../core/install-instructions.js";
import { rebuildKeywordIndex } from "../core/keyword-index.js";
import { approveCandidate } from "../core/candidate-approve.js";
import { formatBenchmarkReport } from "../core/benchmark/format-benchmark.js";
import { runBenchmarkFixturePath, runProtocolBenchmarks } from "../core/benchmark/run-benchmarks.js";
import { listCandidates } from "../core/candidate-list.js";
import { rejectCandidate } from "../core/candidate-reject.js";
import { getDogfoodReport } from "../core/dogfood-report.js";
import { listEvidenceEvents } from "../core/list-events.js";
import { listMemories } from "../core/list-memories.js";
import { formatManagePlanText, getManagePlan } from "../core/manage-plan.js";
import { markMemoryStale } from "../core/mark-memory-stale.js";
import { preflightCommand } from "../core/preflight-command.js";
import { checkProtocolCompliance } from "../core/protocol-check.js";
import { startProtocol } from "../core/protocol-start.js";
import { recordEvidenceEvent } from "../core/record-event.js";
import { retrieveMemories } from "../core/retrieve-memories.js";
import { runV1Evals } from "../core/run-evals.js";
import { searchMemories } from "../core/search-memories.js";
import { scanForSecrets } from "../core/scan-secrets.js";
import { finishSession } from "../core/session-finish.js";
import { formatSessionReceiptText, getSessionReceipt } from "../core/session-receipt.js";
import { startSession } from "../core/session-start.js";
import { proposeCandidate } from "../core/candidate-propose.js";
import { uninstallInstructions } from "../core/uninstall-instructions.js";
import { updateMemory } from "../core/update-memory.js";
import { runLiveAgentEval } from "../evals/live/live-agent.js";
import {
  dedupeMemories,
  dedupeResolve,
  mergeMemories,
  purgeExpired,
  qualityReport,
  reviewMemories,
  supersedeMemory
} from "../lifecycle/lifecycle.js";
import {
  exportMemoryStore,
  importMemoryStore,
  ingestFileAsCandidates,
  ingestLogAsCandidates
} from "../ingestion/index.js";
import { serveMcpOnce, serveMcpStdio } from "../mcp/server.js";
import { backupStore, migrateUp, migrationStatus, repairStore, restoreStore } from "../ops/storage.js";
import { auditSafety } from "../safety/audit.js";
import { quarantineMemory, unquarantineMemory } from "../safety/quarantine.js";
import { rebuildVectorIndex } from "../vector/vector-index.js";
import { formatTextList, formatTextPreflight } from "../formatters/output.js";
import { formatDogfoodReport } from "../formatters/dogfood-report.js";
import { formatProtocolCompliance } from "../formatters/protocol-check.js";
import { formatProtocolStart } from "../formatters/protocol-start.js";
import type { CreateMemoryInput, MemoryRecord, RerankerMode, RetrievalMode } from "../domain/types.js";
import {
  parseCandidateStatus,
  parseCandidateType,
  parseCommandPolicyMatchType,
  parseEvidenceEventType,
  parseMemorySource,
  parseMemoryStatus,
  parseMemoryType,
  parsePreflightDecision,
  validateRegexPattern
} from "../domain/validators.js";

interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positionals, options };
}

function requireOption(parsed: ParsedArgs, name: string): string {
  const value = parsed.options[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required option --${name}`);
  }

  return value;
}

function optionalOption(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.options[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function wantsJson(parsed: ParsedArgs): boolean {
  return Boolean(parsed.options.json) || parsed.options.format === "json";
}

function parseStringList(parsed: ParsedArgs, name: string): string[] | undefined {
  const value = parsed.options[name];
  if (typeof value !== "string") {
    return undefined;
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBooleanFlag(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value !== "false";
}

function parseIntegerOption(parsed: ParsedArgs, name: string): number | undefined {
  const value = parsed.options[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid --${name}: expected an integer`);
  }
  return Number.parseInt(value, 10);
}

function render(value: unknown, asJson: boolean): void {
  const output = asJson ? JSON.stringify(value, null, 2) : String(value);
  process.stdout.write(`${output}\n`);
}

function formatCreatedMemory(memory: MemoryRecord): string {
  return `Created ${memory.id} (${memory.type}).`;
}

function optionalString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.options[name];
  return typeof value === "string" ? value : undefined;
}

function parseExitCode(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!/^-?\d+$/.test(value)) {
    throw new Error(`Invalid --exit-code: ${value}`);
  }

  return Number(value);
}

function parseRetrievalMode(value: string | boolean | undefined): RetrievalMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid retrieval mode: expected deterministic, keyword, hybrid, or vector");
  }
  if (value === "deterministic" || value === "keyword" || value === "hybrid" || value === "vector") {
    return value;
  }
  throw new Error(`Invalid retrieval mode: ${value}`);
}

function parseRerankerMode(value: string | boolean | undefined): RerankerMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Invalid reranker mode: expected none, noop, or mock");
  }
  if (value === "none" || value === "noop" || value === "mock") {
    return value;
  }
  throw new Error(`Invalid reranker mode: ${value}`);
}

function explainRetrievedMemories(memories: MemoryRecord[]): Array<{
  memoryId: string;
  score: number | null;
  reason: string | null;
  mode: string | null;
  signals: unknown;
}> {
  return memories.map((memory) => {
    const retrieval = memory.metadata.retrieval;
    if (!retrieval || typeof retrieval !== "object") {
      return {
        memoryId: memory.id,
        score: null,
        reason: null,
        mode: null,
        signals: null
      };
    }

    return {
      memoryId: memory.id,
      score: "score" in retrieval && typeof retrieval.score === "number" ? retrieval.score : null,
      reason: "reason" in retrieval && typeof retrieval.reason === "string" ? retrieval.reason : null,
      mode: "mode" in retrieval && typeof retrieval.mode === "string" ? retrieval.mode : null,
      signals: "signals" in retrieval ? retrieval.signals : null
    };
  });
}

function helpText(): string {
  return [
    "Agent Memory CLI",
    "",
    "Usage:",
    "  agentmem init [--git-init] [--json]",
    "  agentmem install-instructions",
    "  agentmem uninstall-instructions",
    "  agentmem doctor [--index|--deep] [--json]",
    "  agentmem adapters list|install|uninstall <adapter> [--json]",
    "  agentmem session start \"<task>\" [--json]",
    "  agentmem session finish --session <session-id> --summary \"...\" [--json]",
    "  agentmem session receipt --session <session-id> [--json]",
    "  agentmem add <content> --type <type> [--source <source>] [--path <path>] [--tags a,b] [--pinned] [--priority n]",
    "  agentmem remember <content> --type <type> [--source <source>] [--path <path>] [--tags a,b] [--pinned] [--priority n]",
    "  agentmem protocol start \"<task>\" [--mode deterministic|keyword|hybrid|vector] [--rerank] [--reranker none|noop|mock] [--limit n] [--json]",
    "  agentmem protocol check --session <session-id> [--json]",
    "  agentmem dogfood report --session <session-id> [--json]",
    "  agentmem event record --session <session-id> --type <type> --summary \"...\" [--command \"...\"] [--exit-code 1] [--json]",
    "  agentmem event list --session <session-id> [--json]",
    "  agentmem decision <content>",
    "  agentmem failed <content>",
    "  agentmem policy <content> --match <pattern> [--match-type substring|exact|regex] [--decision allow|warn|block] [--suggest <action>]",
    "  agentmem index [--rebuild|--vector] [--json]",
    "  agentmem retrieve <task> [--mode deterministic|keyword|hybrid|vector] [--rerank] [--reranker none|noop|mock] [--explain] [--dry-run] [--file <path>] [--command <command>] [--limit n] [--json]",
    "  agentmem explain-retrieval <task> [--mode deterministic|keyword|hybrid|vector] [--rerank] [--json]",
    "  agentmem inject <task> [--session <session-id>] [--file <path>] [--command <command>] [--json|--format markdown]",
    "  agentmem pack <task> [--session <session-id>] [--file <path>] [--command <command>] [--json]",
    "  agentmem preflight --command <command> [--session <session-id>] [--enforce] [--json]",
    "  agentmem run --session <session-id> [--allow-warn] -- <command>",
    "  agentmem eval [--json]",
    "  agentmem eval live [--write-report] [--json]",
    "  agentmem mcp serve [--json]",
    "  agentmem candidate propose --session <session-id> --type <type> --content \"...\" [--evidence \"...\"] [--evidence-event <event-id>] [--json]",
    "  agentmem candidate list [--status proposed] [--json]",
    "  agentmem candidate approve <candidate-id> --reason \"...\" [--json]",
    "  agentmem candidate reject <candidate-id> --reason \"...\" [--json]",
    "  agentmem manage --plan [--json]",
    "  agentmem benchmark run --fixture <path> [--json]",
    "  agentmem benchmark run --all [--json]",
    "  agentmem search <query> [--type <type>] [--all] [--json]",
    "  agentmem list [--type <type>] [--all] [--json]",
    "  agentmem update <memory-id> --reason <reason> [--content \"...\"] [--type <type>] [--status <status>] [--tags a,b] [--paths a,b] [--pinned true|false] [--priority n]",
    "  agentmem forget <memory-id> --reason <reason>",
    "  agentmem review [--json]",
    "  agentmem dedupe [--resolve] [--json]",
    "  agentmem merge --target <memory-id> --source <memory-id> --reason <reason> [--json]",
    "  agentmem supersede --old <memory-id> --new <memory-id> --reason <reason> [--json]",
    "  agentmem quality [--json]",
    "  agentmem purge-expired [--json]",
    "  agentmem ingest <file> --as candidates [--json]",
    "  agentmem ingest-log <file> --as candidates [--json]",
    "  agentmem export [--output <file>] [--json]",
    "  agentmem import <file> [--json]",
    "  agentmem quarantine <memory-id> --reason <reason> [--redact] [--json]",
    "  agentmem unquarantine <memory-id> --reason <reason> [--json]",
    "  agentmem audit [--json]",
    "  agentmem migrate status|up [--json]",
    "  agentmem backup [--output <dir>] [--json]",
    "  agentmem restore <backup-path> [--json]",
    "  agentmem repair [--json]",
    "  agentmem stale <memory-id> --reason <reason>",
    "  agentmem explain <memory-id>",
    "  agentmem scan [--deep] [--json]",
    ""
  ].join("\n");
}

async function handleRemember(command: string, parsed: ParsedArgs, cwd: string): Promise<void> {
  const positionals = command === "policy" && parsed.positionals[0] === "add"
    ? parsed.positionals.slice(1)
    : parsed.positionals;
  const content = positionals.join(" ").trim();
  if (!content) {
    throw new Error(`${command} requires content`);
  }

  const base: CreateMemoryInput = {
    cwd,
    content,
    type: "decision",
    source: "cli"
  };

  if (command === "remember" || command === "add") {
    base.type = parseMemoryType(requireOption(parsed, "type"));
    base.source =
      parsed.options.source === undefined
        ? "cli"
        : parseMemorySource(parsed.options.source);
  }

  if (command === "decision") {
    base.type = "decision";
    base.source = "user_explicit";
  }

  if (command === "failed") {
    base.type = "failed_attempt";
    base.source = "cli";
  }

  if (command === "policy") {
    const commandPattern = requireOption(parsed, "match");
    const matchType = parseCommandPolicyMatchType(parsed.options["match-type"] ?? "substring");
    const decision = parsePreflightDecision(parsed.options.decision ?? "warn");
    if (matchType === "regex") {
      validateRegexPattern(commandPattern);
    }

    base.type = "command_policy";
    base.source = "user_explicit";
    base.metadata = {
      commandPattern,
      matchType,
      decision,
      suggestedAction:
        typeof parsed.options.suggest === "string" ? parsed.options.suggest : undefined
    };
    base.severity = "high";
  }

  if (typeof parsed.options.path === "string") {
    base.paths = [parsed.options.path];
  }

  const tags = parseStringList(parsed, "tags") ?? parseStringList(parsed, "tag");
  if (tags) {
    base.tags = tags;
  }

  const pinned = parseBooleanFlag(parsed.options.pinned);
  if (pinned !== undefined) {
    base.pinned = pinned;
  }

  const priority = parseIntegerOption(parsed, "priority");
  if (priority !== undefined) {
    base.priority = priority;
  }

  const result = await createMemory(base);
  const asJson = wantsJson(parsed);
  render(asJson ? result : formatCreatedMemory(result), asJson);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();

  if (!command || command === "help" || command === "--help") {
    render(helpText(), false);
    return;
  }

  const parsed = parseArgs(rest);
  const asJson = wantsJson(parsed);

  if (parsed.options.help) {
    render(helpText(), false);
    return;
  }

  switch (command) {
    case "init": {
      const result = await initProject({ cwd, gitInit: Boolean(parsed.options["git-init"]) });
      render(
        asJson
          ? result
          : [
              `Initialized Agent Memory for project:`,
              `- name: ${result.name}`,
              `- git_root: ${result.gitRoot}`,
              `- project_id: ${result.projectId}`,
              `- store: ${result.storePath}`,
              result.warning ?? ""
            ]
              .filter(Boolean)
              .join("\n"),
        asJson
      );
      return;
    }
    case "add":
    case "remember":
    case "decision":
    case "failed":
    case "policy":
      await handleRemember(command, parsed, cwd);
      return;
    case "install-instructions": {
      const result = await installInstructions({ cwd });
      render(asJson ? result : `Installed Agent Memory router in ${result.agentsPath}.`, asJson);
      return;
    }
    case "uninstall-instructions": {
      const result = await uninstallInstructions({ cwd });
      render(asJson ? result : `Removed Agent Memory router from ${result.agentsPath}.`, asJson);
      return;
    }
    case "adapters": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "list") {
        const result = listAdapters();
        render(asJson ? result : result.map((adapter) => `${adapter.id}: ${adapter.targetPath}`).join("\n"), asJson);
        return;
      }

      if (subcommand === "install") {
        const adapter = parsed.positionals[1];
        if (!adapter) {
          throw new Error("adapters install requires an adapter id");
        }
        const result = await installAdapter({ cwd, adapter });
        render(asJson ? result : `Installed ${result.adapter} adapter at ${result.path}.`, asJson);
        return;
      }

      if (subcommand === "uninstall") {
        const adapter = parsed.positionals[1];
        if (!adapter) {
          throw new Error("adapters uninstall requires an adapter id");
        }
        const result = await uninstallAdapter({ cwd, adapter });
        render(asJson ? result : `Uninstalled ${result.adapter} adapter from ${result.path}.`, asJson);
        return;
      }

      throw new Error("Unknown adapters command. Run `agentmem help` for usage.");
    }
    case "doctor": {
      const result = await doctor({
        cwd,
        includeIndex: Boolean(parsed.options.index) || Boolean(parsed.options.deep)
      });
      render(
        asJson
          ? result
          : [
              `initialized: ${result.initialized}`,
              `agentsMdExists: ${result.agentsMdExists}`,
              `routerInstalled: ${result.routerInstalled}`,
              `storePath: ${result.storePath}`,
              `configPath: ${result.configPath}`,
              result.index
                ? [
                    `keywordIndex: ${result.index.keyword ? JSON.stringify(result.index.keyword) : "unavailable"}`,
                    `vectorIndex: ${result.index.vector ? JSON.stringify(result.index.vector) : "unavailable"}`
                  ].join("\n")
                : ""
            ].filter(Boolean).join("\n"),
        asJson
      );
      return;
    }
    case "index": {
      const result = parsed.options.vector
        ? await rebuildVectorIndex({ cwd })
        : await rebuildKeywordIndex({ cwd });
      render(
        asJson
          ? result
          : [
              `indexedMemories: ${result.indexedMemories}`,
              `eligibleMemories: ${result.eligibleMemories}`,
              `stale: ${result.stale}`
            ].join("\n"),
        asJson
      );
      return;
    }
    case "mcp": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "serve") {
        if (asJson) {
          const result = await serveMcpOnce({ cwd });
          render(result, true);
          return;
        }
        await serveMcpStdio({ cwd });
        return;
      }

      throw new Error("Unknown mcp command. Run `agentmem help` for usage.");
    }
    case "session": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "start") {
        const task = parsed.positionals.slice(1).join(" ").trim();
        const result = await startSession({ cwd, task });
        render(asJson ? result : `Started ${result.sessionId}.`, asJson);
        return;
      }

      if (subcommand === "finish") {
        const result = await finishSession({
          cwd,
          sessionId: requireOption(parsed, "session"),
          summary: requireOption(parsed, "summary")
        });
        render(asJson ? result : `Finished ${result.sessionId}.`, asJson);
        return;
      }

      if (subcommand === "receipt") {
        const result = await getSessionReceipt({
          cwd,
          sessionId: requireOption(parsed, "session")
        });
        render(asJson ? result : formatSessionReceiptText(result), asJson);
        return;
      }

      throw new Error("Unknown session command. Run `agentmem help` for usage.");
    }
    case "protocol": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "start") {
        const task = parsed.positionals.slice(1).join(" ").trim();
        if (!task) {
          throw new Error("protocol start requires a task description");
        }

        const result = await startProtocol({ cwd, task });
        render(asJson ? result : formatProtocolStart(result), asJson);
        return;
      }

      if (subcommand === "check") {
        const result = await checkProtocolCompliance({
          cwd,
          sessionId: requireOption(parsed, "session")
        });
        render(asJson ? result : formatProtocolCompliance(result), asJson);
        return;
      }

      throw new Error("Unknown protocol command. Run `agentmem help` for usage.");
    }
    case "dogfood": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "report") {
        const result = await getDogfoodReport({
          cwd,
          sessionId: requireOption(parsed, "session")
        });
        render(asJson ? result : formatDogfoodReport(result), asJson);
        return;
      }

      throw new Error("Unknown dogfood command. Run `agentmem help` for usage.");
    }
    case "event": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "record") {
        const result = await recordEvidenceEvent({
          cwd,
          sessionId: requireOption(parsed, "session"),
          type: parseEvidenceEventType(requireOption(parsed, "type")),
          summary: requireOption(parsed, "summary"),
          command: optionalString(parsed, "command"),
          exitCode: parseExitCode(optionalString(parsed, "exit-code"))
        });
        render(asJson ? result : `Recorded ${result.eventId}.`, asJson);
        return;
      }

      if (subcommand === "list") {
        const result = await listEvidenceEvents({
          cwd,
          sessionId: requireOption(parsed, "session")
        });
        render(
          asJson
            ? result
            : result
                .map((event) => `${event.eventId} ${event.eventType} ${String(event.payload.summary ?? "")}`)
                .join("\n"),
          asJson
        );
        return;
      }

      throw new Error("Unknown event command. Run `agentmem help` for usage.");
    }
    case "candidate": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "propose") {
        const candidateType = parseCandidateType(requireOption(parsed, "type"));
        const metadata: Record<string, unknown> = {};
        if (candidateType === "command_policy") {
          const match = optionalString(parsed, "match");
          if (match) {
            metadata.commandPattern = match;
            metadata.matchType = optionalString(parsed, "match-type") ?? "substring";
            metadata.decision = optionalString(parsed, "decision") ?? "warn";
            const suggest = optionalString(parsed, "suggest");
            if (suggest) {
              metadata.suggestedAction = suggest;
            }
          }
        }
        const result = await proposeCandidate({
          cwd,
          sessionId: requireOption(parsed, "session"),
          type: candidateType,
          content: requireOption(parsed, "content"),
          evidence: optionalString(parsed, "evidence"),
          evidenceEventId: optionalString(parsed, "evidence-event"),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        });
        render(asJson ? result : `Proposed ${result.candidateId}.`, asJson);
        return;
      }

      if (subcommand === "list") {
        const result = await listCandidates({
          cwd,
          status:
            parsed.options.status === undefined
              ? undefined
              : parseCandidateStatus(parsed.options.status)
        });
        render(
          asJson
            ? result
            : result
                .map((candidate) => `${candidate.candidateId} ${candidate.type} ${candidate.candidateStatus}`)
                .join("\n"),
          asJson
        );
        return;
      }

      if (subcommand === "approve") {
        const candidateId = parsed.positionals[1];
        if (!candidateId) {
          throw new Error("candidate approve requires a candidate id");
        }

        const result = await approveCandidate({
        cwd,
        candidateId,
        reason: requireOption(parsed, "reason")
      });
        render(
          asJson
            ? {
                candidate: {
                  candidateId: result.candidate.candidateId,
                  candidateStatus: result.candidate.candidateStatus,
                  targetMemoryId: result.candidate.targetMemoryId
                },
                memory: {
                  id: result.memory.id,
                  type: result.memory.type,
                  status: result.memory.status,
                  content: result.memory.content
                }
              }
            : `Approved ${result.candidate.candidateId} as ${result.memory.id}.`,
          asJson
        );
        return;
      }

      if (subcommand === "reject") {
        const candidateId = parsed.positionals[1];
        if (!candidateId) {
          throw new Error("candidate reject requires a candidate id");
        }

        const result = await rejectCandidate({
          cwd,
          candidateId,
          reason: requireOption(parsed, "reason")
        });
        render(
          asJson
            ? {
                candidateId: result.candidateId,
                candidateStatus: result.candidateStatus,
                reviewReason: result.reviewReason
              }
            : `Rejected ${result.candidateId}.`,
          asJson
        );
        return;
      }

      throw new Error("Unknown candidate command. Run `agentmem help` for usage.");
    }
    case "manage": {
      if (parsed.positionals.length > 0) {
        throw new Error("Unknown manage command. Run `agentmem help` for usage.");
      }

      if (!parsed.options.plan) {
        throw new Error("manage currently supports only --plan");
      }

      const result = await getManagePlan({ cwd });
      render(asJson ? result : formatManagePlanText(result), asJson);
      return;
    }
    case "benchmark": {
      const subcommand = parsed.positionals[0];
      if (subcommand !== "run") {
        throw new Error("Unknown benchmark command. Run `agentmem help` for usage.");
      }

      const fixture = parsed.options.fixture;
      const all = Boolean(parsed.options.all);
      if ((typeof fixture !== "string" || fixture.trim().length === 0) && !all) {
        throw new Error("benchmark run requires --fixture or --all");
      }
      if (typeof fixture === "string" && all) {
        throw new Error("benchmark run accepts only one of --fixture or --all");
      }

      const result =
        typeof fixture === "string"
          ? await runBenchmarkFixturePath(fixture)
          : await runProtocolBenchmarks({ cwd });
      render(asJson ? result : formatBenchmarkReport(result), asJson);
      return;
    }
    case "pack":
    case "inject": {
      const task = parsed.positionals.join(" ").trim();
      if (!task) {
        throw new Error(`${command} requires a task description`);
      }

      const result = await generatePack({
        cwd,
        task,
        files: parseStringList(parsed, "files") ?? parseStringList(parsed, "file"),
        command: typeof parsed.options.command === "string" ? parsed.options.command : undefined,
        sessionId: typeof parsed.options.session === "string" ? parsed.options.session : undefined
      });
      render(asJson ? result : result.markdown, asJson);
      return;
    }
    case "retrieve": {
      const task = parsed.positionals.join(" ").trim();
      if (!task) {
        throw new Error("retrieve requires a task description");
      }

      const memories = await retrieveMemories({
        cwd,
        task,
        files: parseStringList(parsed, "files") ?? parseStringList(parsed, "file"),
        command: typeof parsed.options.command === "string" ? parsed.options.command : undefined,
        maxResults: parseIntegerOption(parsed, "limit"),
        mode: parseRetrievalMode(parsed.options.mode),
        explain: Boolean(parsed.options.explain),
        rerank: Boolean(parsed.options.rerank),
        reranker: parseRerankerMode(parsed.options.reranker),
        dryRun: Boolean(parsed.options["dry-run"])
      });
      const jsonResult = {
        memories,
        matchedMemoryIds: memories.map((memory) => memory.id),
        ...(parsed.options.explain ? { explanations: explainRetrievedMemories(memories) } : {})
      };
      render(
        asJson ? jsonResult : formatTextList(memories),
        asJson
      );
      return;
    }
    case "explain-retrieval": {
      const task = parsed.positionals.join(" ").trim();
      if (!task) {
        throw new Error("explain-retrieval requires a task description");
      }

      const memories = await retrieveMemories({
        cwd,
        task,
        files: parseStringList(parsed, "files") ?? parseStringList(parsed, "file"),
        command: typeof parsed.options.command === "string" ? parsed.options.command : undefined,
        maxResults: parseIntegerOption(parsed, "limit"),
        mode: parseRetrievalMode(parsed.options.mode),
        explain: true,
        rerank: Boolean(parsed.options.rerank),
        reranker: parseRerankerMode(parsed.options.reranker),
        dryRun: true
      });
      const explanations = explainRetrievedMemories(memories);
      render(
        asJson
          ? { memories, matchedMemoryIds: memories.map((memory) => memory.id), explanations }
          : explanations
              .map((item) => `${item.memoryId}: ${item.reason ?? "matched task context"}`)
              .join("\n"),
        asJson
      );
      return;
    }
    case "search": {
      const query = parsed.positionals.join(" ").trim();
      if (!query) {
        throw new Error("search requires a query");
      }

      const result = await searchMemories({
        cwd,
        query,
        type: parsed.options.type === undefined ? undefined : parseMemoryType(parsed.options.type),
        activeOnly: parsed.options.all ? false : true
      });
      render(asJson ? result : formatTextList(result), asJson);
      return;
    }
    case "preflight": {
      const commandValue = requireOption(parsed, "command");
      const result = await preflightCommand({
        cwd,
        command: commandValue,
        sessionId: typeof parsed.options.session === "string" ? parsed.options.session : undefined
      });
      const enforce = Boolean(parsed.options.enforce);

      render(asJson ? result : formatTextPreflight(result), asJson);

      if (enforce) {
        if (result.decision === "block") {
          process.exitCode = 2;
        } else if (result.decision === "warn") {
          process.exitCode = 1;
        }
      }

      return;
    }
    case "run": {
      const doubleDashIndex = process.argv.indexOf("--");
      if (doubleDashIndex === -1) {
        throw new Error("agentmem run requires -- <command>. Example: agentmem run -- pnpm test");
      }

      const runArgs = process.argv.slice(doubleDashIndex + 1);
      if (runArgs.length === 0) {
        throw new Error("agentmem run requires a command after --.");
      }

      const [runCommand, ...runCommandArgs] = runArgs;
      if (!runCommand) {
        throw new Error("agentmem run requires a command after --.");
      }

      const preflight = await preflightCommand({
        cwd,
        command: runArgs.join(" "),
        sessionId: typeof parsed.options.session === "string" ? parsed.options.session : undefined
      });

      if (preflight.decision === "block") {
        process.stderr.write(`BLOCKED: ${preflight.message}\n`);
        process.exitCode = 2;
        return;
      }

      if (preflight.decision === "warn" && !parsed.options["allow-warn"]) {
        process.stderr.write(`WARNING: ${preflight.message}\n`);
        process.stderr.write("Use --allow-warn to proceed anyway.\n");
        process.exitCode = 1;
        return;
      }

      const result = spawnSync(runCommand, runCommandArgs, {
        cwd,
        stdio: "inherit"
      });

      if (result.error) {
        throw new Error(`Failed to execute ${runCommand}: ${result.error.message}`);
      }

      if (parsed.options.session) {
        try {
          await recordEvidenceEvent({
            cwd,
            sessionId: String(parsed.options.session),
            type: "command_result",
            summary: `${runCommand} ${runCommandArgs.join(" ")} (exit ${result.status})`,
            command: runArgs.join(" "),
            exitCode: result.status ?? 0
          });
        } catch {
        }
      }

      process.exitCode = result.status ?? 0;
      return;
    }
    case "list": {
      const result = await listMemories({
        cwd,
        type: parsed.options.type === undefined ? undefined : parseMemoryType(parsed.options.type),
        activeOnly: parsed.options.all ? false : true
      });
      render(asJson ? result : formatTextList(result), asJson);
      return;
    }
    case "stale": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("stale requires a memory id");
      }

      await markMemoryStale({
        cwd,
        memoryId,
        reason: requireOption(parsed, "reason")
      });
      render(asJson ? { updated: true, memoryId, status: "stale" } : `Marked ${memoryId} stale.`, asJson);
      return;
    }
    case "update": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("update requires a memory id");
      }

      const result = await updateMemory({
        cwd,
        memoryId,
        reason: requireOption(parsed, "reason"),
        content: typeof parsed.options.content === "string" ? parsed.options.content : undefined,
        type: parsed.options.type === undefined ? undefined : parseMemoryType(parsed.options.type),
        status: parsed.options.status === undefined ? undefined : parseMemoryStatus(parsed.options.status),
        tags: parseStringList(parsed, "tags") ?? parseStringList(parsed, "tag"),
        paths: parseStringList(parsed, "paths") ?? parseStringList(parsed, "path"),
        pinned: parseBooleanFlag(parsed.options.pinned),
        priority: parseIntegerOption(parsed, "priority")
      });
      render(asJson ? result : `Updated ${result.id}.`, asJson);
      return;
    }
    case "forget": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("forget requires a memory id");
      }

      const result = await forgetMemory({
        cwd,
        memoryId,
        reason: requireOption(parsed, "reason")
      });
      render(asJson ? result : `Archived ${result.id}.`, asJson);
      return;
    }
    case "review": {
      const result = await reviewMemories({ cwd });
      render(asJson ? result : result.needsReview.map((item) => `${item.memoryId}: ${item.reasons.join(", ")}`).join("\n"), asJson);
      return;
    }
    case "dedupe": {
      if (parsed.options.resolve) {
        const result = await dedupeResolve({ cwd });
        render(
          asJson ? result : `Resolved ${result.resolved} duplicate group(s).\n${
            result.groups.map((g) => `  ${g.target}: merged ${g.mergedSources.join(", ")}`).join("\n")
          }`,
          asJson
        );
        return;
      }
      const result = await dedupeMemories({ cwd });
      render(asJson ? result : result.duplicateGroups.map((group) => `${group.memoryIds.join(", ")}: ${group.content}`).join("\n"), asJson);
      return;
    }
    case "merge": {
      const result = await mergeMemories({
        cwd,
        targetMemoryId: requireOption(parsed, "target"),
        sourceMemoryId: requireOption(parsed, "source"),
        reason: requireOption(parsed, "reason")
      });
      render(asJson ? result : `Merged ${result.source.id} into ${result.target.id}.`, asJson);
      return;
    }
    case "supersede": {
      const result = await supersedeMemory({
        cwd,
        oldMemoryId: requireOption(parsed, "old"),
        newMemoryId: requireOption(parsed, "new"),
        reason: requireOption(parsed, "reason")
      });
      render(asJson ? result : `Superseded ${result.oldMemory.id} with ${result.newMemory.id}.`, asJson);
      return;
    }
    case "quality": {
      const result = await qualityReport({ cwd });
      render(asJson ? result : JSON.stringify(result.summary, null, 2), asJson);
      return;
    }
    case "purge-expired": {
      const result = await purgeExpired({ cwd });
      render(
        asJson ? result : `Purged ${result.purged} expired memories.${result.expiredIds.length > 0 ? `\n${result.expiredIds.join("\n")}` : ""}`,
        asJson
      );
      return;
    }
    case "ingest": {
      const file = parsed.positionals[0];
      if (!file) {
        throw new Error("ingest requires a file path");
      }
      const as = optionalString(parsed, "as") ?? "candidates";
      if (as !== "candidates") {
        throw new Error("ingest currently supports only --as candidates");
      }
      const result = await ingestFileAsCandidates({ cwd, file, as });
      render(asJson ? result : `Ingested ${result.chunks} chunk(s) from ${result.sourcePath}.`, asJson);
      return;
    }
    case "ingest-log": {
      const file = parsed.positionals[0];
      if (!file) {
        throw new Error("ingest-log requires a file path");
      }
      const as = optionalString(parsed, "as") ?? "candidates";
      if (as !== "candidates") {
        throw new Error("ingest-log currently supports only --as candidates");
      }
      const result = await ingestLogAsCandidates({ cwd, file, as });
      render(asJson ? result : `Ingested ${result.chunks} log chunk(s) from ${result.sourcePath}.`, asJson);
      return;
    }
    case "export": {
      const result = await exportMemoryStore({
        cwd,
        output: optionalString(parsed, "output")
      });
      render(asJson ? result : `Exported ${result.memories.length} memories and ${result.candidates.length} candidates.`, asJson);
      return;
    }
    case "import": {
      const file = parsed.positionals[0];
      if (!file) {
        throw new Error("import requires a file path");
      }
      const result = await importMemoryStore({ cwd, file });
      render(asJson ? result : `Imported ${result.importedMemories} memories and ${result.importedCandidates} candidates.`, asJson);
      return;
    }
    case "quarantine": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("quarantine requires a memory id");
      }
      const result = await quarantineMemory({
        cwd,
        memoryId,
        reason: requireOption(parsed, "reason"),
        redact: Boolean(parsed.options.redact)
      });
      render(asJson ? result : `Quarantined ${result.id}.`, asJson);
      return;
    }
    case "unquarantine": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("unquarantine requires a memory id");
      }
      const result = await unquarantineMemory({
        cwd,
        memoryId,
        reason: requireOption(parsed, "reason")
      });
      render(asJson ? result : `Unquarantined ${result.id}.`, asJson);
      return;
    }
    case "audit": {
      const result = await auditSafety({ cwd });
      render(asJson ? result : JSON.stringify(result.summary, null, 2), asJson);
      return;
    }
    case "migrate": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "status") {
        const result = await migrationStatus({ cwd });
        render(asJson ? result : `schema ${result.currentVersion}/${result.latestVersion}`, asJson);
        return;
      }
      if (subcommand === "up") {
        const result = await migrateUp({ cwd });
        render(asJson ? result : `schema ${result.currentVersion}/${result.latestVersion}`, asJson);
        return;
      }
      throw new Error("Unknown migrate command. Run `agentmem help` for usage.");
    }
    case "backup": {
      const result = await backupStore({
        cwd,
        outputDir: optionalString(parsed, "output")
      });
      render(asJson ? result : `Backup written to ${result.backupPath}.`, asJson);
      return;
    }
    case "restore": {
      const backupPath = parsed.positionals[0];
      if (!backupPath) {
        throw new Error("restore requires a backup path");
      }
      const result = await restoreStore({ cwd, backupPath });
      render(asJson ? result : `Restored backup. Safety backup written to ${result.backupPath}.`, asJson);
      return;
    }
    case "repair": {
      const result = await repairStore({ cwd });
      render(asJson ? result : JSON.stringify({ repaired: result.repaired, issues: result.issues }, null, 2), asJson);
      return;
    }
    case "eval": {
      if (parsed.positionals[0] === "live") {
        const result = await runLiveAgentEval({
          cwd,
          writeReport: Boolean(parsed.options["write-report"])
        });
        render(
          asJson
            ? result
            : [
                `${result.name}: ${result.passed ? "pass" : "fail"}`,
                ...result.scenarios.map((item) => `- ${item.passed ? "pass" : "fail"}: ${item.name}`)
              ].join("\n"),
          asJson
        );
        if (!result.passed) {
          process.exitCode = 1;
        }
        return;
      }
      const result = await runV1Evals();
      render(
        asJson
          ? result
          : [
              `${result.name}: ${result.passed ? "pass" : "fail"}`,
              ...result.checks.map((item) => `- ${item.status}: ${item.name} - ${item.details}`)
            ].join("\n"),
        asJson
      );
      if (!result.passed) {
        process.exitCode = 1;
      }
      return;
    }
    case "explain": {
      const memoryId = parsed.positionals[0];
      if (!memoryId) {
        throw new Error("explain requires a memory id");
      }

      const result = await explainMemory({ cwd, memoryId });
      render(
        asJson
          ? result
          : `${result.memory.content}\nstatus: ${result.memory.status}\nrelated_events: ${result.relatedEvents.length}`,
        asJson
      );
      return;
    }
    case "scan": {
      const result = await scanForSecrets({ cwd, deep: Boolean(parsed.options.deep) });
      if (asJson) {
        render(result, true);
      } else {
        if (result.findings.length === 0) {
          render(result.summary, false);
        } else {
          const lines = result.findings.map(
            (finding) => `[${finding.source}] ${finding.id} ${finding.field}: ${finding.label}`
          );
          render([...lines, "", result.summary].join("\n"), false);
        }
      }
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\nRun \`agentmem help\` for usage.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
