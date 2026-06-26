import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const run = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const builtCliPath = resolve(repoRoot, "dist", "cli", "main.js");

describe("built CLI", () => {
  test("preserves shebang and prints help", async () => {
    await run("pnpm", ["build"], { cwd: repoRoot });

    const builtCli = readFileSync(builtCliPath, "utf8");
    expect(builtCli.split(/\r?\n/, 1)[0]).toBe("#!/usr/bin/env node");

    const result = await run("node", [builtCliPath, "help"], { cwd: repoRoot });
    expect(result.stdout).toContain("Agent Memory CLI");
  });
});
