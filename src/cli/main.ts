#!/usr/bin/env node
import process from "node:process";

import { createMemory } from "../core/create-memory.js";
import { doctor } from "../core/doctor.js";
import { explainMemory } from "../core/explain-memory.js";
import { generatePack } from "../core/generate-pack.js";
import { initProject } from "../core/init-project.js";
import { installInstructions } from "../core/install-instructions.js";
import { listCandidates } from "../core/candidate-list.js";
import { listMemories } from "../core/list-memories.js";
import { markMemoryStale } from "../core/mark-memory-stale.js";
import { preflightCommand } from "../core/preflight-command.js";
import { searchMemories } from "../core/search-memories.js";
import { finishSession } from "../core/session-finish.js";
import { formatSessionReceiptText, getSessionReceipt } from "../core/session-receipt.js";
import { startSession } from "../core/session-start.js";
import { proposeCandidate } from "../core/candidate-propose.js";
import { uninstallInstructions } from "../core/uninstall-instructions.js";
import { formatTextList, formatTextPreflight } from "../formatters/output.js";
import type { CreateMemoryInput, MemoryRecord } from "../domain/types.js";
import {
  parseCandidateStatus,
  parseCandidateType,
  parseCommandPolicyMatchType,
  parseMemorySource,
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

function render(value: unknown, asJson: boolean): void {
  const output = asJson ? JSON.stringify(value, null, 2) : String(value);
  process.stdout.write(`${output}\n`);
}

function formatCreatedMemory(memory: MemoryRecord): string {
  return `Created ${memory.id} (${memory.type}).`;
}

function helpText(): string {
  return [
    "Agent Memory CLI",
    "",
    "Usage:",
    "  agentmem init [--git-init] [--json]",
    "  agentmem install-instructions",
    "  agentmem uninstall-instructions",
    "  agentmem doctor [--json]",
    "  agentmem session start \"<task>\" [--json]",
    "  agentmem session finish --session <session-id> --summary \"...\" [--json]",
    "  agentmem session receipt --session <session-id> [--json]",
    "  agentmem remember <content> --type <type> [--source <source>] [--path <path>] [--tags a,b]",
    "  agentmem decision <content>",
    "  agentmem failed <content>",
    "  agentmem policy <content> --match <pattern> [--match-type substring|exact|regex] [--decision allow|warn|block]",
    "  agentmem pack <task> [--session <session-id>] [--json]",
    "  agentmem preflight --command <command> [--session <session-id>] [--json]",
    "  agentmem candidate propose --session <session-id> --type <type> --content \"...\" --evidence \"...\" [--json]",
    "  agentmem candidate list [--status proposed] [--json]",
    "  agentmem search <query> [--type <type>] [--json]",
    "  agentmem list [--type <type>] [--all] [--json]",
    "  agentmem stale <memory-id> --reason <reason>",
    "  agentmem explain <memory-id>",
    ""
  ].join("\n");
}

async function handleRemember(command: string, parsed: ParsedArgs, cwd: string): Promise<void> {
  const content = parsed.positionals.join(" ").trim();
  if (!content) {
    throw new Error(`${command} requires content`);
  }

  const base: CreateMemoryInput = {
    cwd,
    content,
    type: "decision",
    source: "cli"
  };

  if (command === "remember") {
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

  if (typeof parsed.options.tags === "string") {
    base.tags = parsed.options.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  const result = await createMemory(base);
  const asJson = Boolean(parsed.options.json);
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
  const asJson = Boolean(parsed.options.json);

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
    case "doctor": {
      const result = await doctor({ cwd });
      render(
        asJson
          ? result
          : [
              `initialized: ${result.initialized}`,
              `agentsMdExists: ${result.agentsMdExists}`,
              `routerInstalled: ${result.routerInstalled}`,
              `storePath: ${result.storePath}`,
              `configPath: ${result.configPath}`
            ].join("\n"),
        asJson
      );
      return;
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
    case "candidate": {
      const subcommand = parsed.positionals[0];
      if (subcommand === "propose") {
        const result = await proposeCandidate({
          cwd,
          sessionId: requireOption(parsed, "session"),
          type: parseCandidateType(requireOption(parsed, "type")),
          content: requireOption(parsed, "content"),
          evidence: requireOption(parsed, "evidence")
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

      throw new Error("Unknown candidate command. Run `agentmem help` for usage.");
    }
    case "pack": {
      const task = parsed.positionals.join(" ").trim();
      if (!task) {
        throw new Error("pack requires a task description");
      }

      const result = await generatePack({
        cwd,
        task,
        sessionId: typeof parsed.options.session === "string" ? parsed.options.session : undefined
      });
      render(asJson ? result : result.markdown, asJson);
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
      render(asJson ? result : formatTextPreflight(result), asJson);
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
    default:
      throw new Error(`Unknown command: ${command}\nRun \`agentmem help\` for usage.`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
