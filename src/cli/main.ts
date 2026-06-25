import process from "node:process";

import { createMemory } from "../core/create-memory.js";
import { explainMemory } from "../core/explain-memory.js";
import { generatePack } from "../core/generate-pack.js";
import { initProject } from "../core/init-project.js";
import { listMemories } from "../core/list-memories.js";
import { markMemoryStale } from "../core/mark-memory-stale.js";
import { preflightCommand } from "../core/preflight-command.js";
import { searchMemories } from "../core/search-memories.js";
import { formatTextList, formatTextPreflight } from "../formatters/output.js";
import type { CreateMemoryInput, MemoryType, PreflightDecision } from "../domain/types.js";

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
    base.type = requireOption(parsed, "type") as MemoryType;
    base.source = (parsed.options.source as CreateMemoryInput["source"]) ?? "cli";
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
    base.type = "command_policy";
    base.source = "user_explicit";
    base.metadata = {
      commandPattern: requireOption(parsed, "match"),
      matchType: (parsed.options["match-type"] as string | undefined) ?? "substring",
      decision: (parsed.options.decision as PreflightDecision | undefined) ?? "warn",
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
  render(result, Boolean(parsed.options.json));
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const cwd = process.cwd();

  if (!command) {
    throw new Error("No command provided");
  }

  const parsed = parseArgs(rest);
  const asJson = Boolean(parsed.options.json);

  switch (command) {
    case "init": {
      const result = await initProject({ cwd });
      render(
        asJson
          ? result
          : `Initialized Agent Memory for project:\n- name: ${result.name}\n- git_root: ${result.gitRoot}\n- project_id: ${result.projectId}\n- store: ${result.storePath}`,
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
    case "pack": {
      const task = parsed.positionals.join(" ").trim();
      if (!task) {
        throw new Error("pack requires a task description");
      }

      const result = await generatePack({ cwd, task });
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
        type: parsed.options.type as MemoryType | undefined,
        activeOnly: parsed.options.all ? false : true
      });
      render(asJson ? result : formatTextList(result), asJson);
      return;
    }
    case "preflight": {
      const commandValue = requireOption(parsed, "command");
      const result = await preflightCommand({ cwd, command: commandValue });
      render(asJson ? result : formatTextPreflight(result), asJson);
      return;
    }
    case "list": {
      const result = await listMemories({
        cwd,
        type: parsed.options.type as MemoryType | undefined,
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
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
