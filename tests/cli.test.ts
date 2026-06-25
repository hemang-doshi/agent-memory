import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { cleanupWorkspace, createTempWorkspace } from "./helpers.js";

const run = promisify(execFile);
const workspaces: string[] = [];
const tsxCli = "/Users/hemangdoshi/Developer/agent-memory/node_modules/tsx/dist/cli.mjs";

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cleanupWorkspace));
});

describe("CLI smoke tests", () => {
  test("initializes a project and emits JSON for pack and preflight", async () => {
    const cwd = await createTempWorkspace("agentmem-cli");
    workspaces.push(cwd);

    await run("node", [tsxCli, "/Users/hemangdoshi/Developer/agent-memory/src/cli/main.ts", "init"], {
      cwd
    });

    await run(
      "node",
      [
        tsxCli,
        "/Users/hemangdoshi/Developer/agent-memory/src/cli/main.ts",
        "policy",
        "Do not run npm run render unless explicitly requested.",
        "--match",
        "npm run render",
        "--decision",
        "warn",
        "--suggest",
        "Run pnpm test instead."
      ],
      {
        cwd
      }
    );

    const pack = await run(
      "node",
      [
        tsxCli,
        "/Users/hemangdoshi/Developer/agent-memory/src/cli/main.ts",
        "pack",
        "Implement the reel scene",
        "--json"
      ],
      { cwd }
    );

    const packJson = JSON.parse(pack.stdout) as { markdown: string };
    expect(packJson.markdown).toContain("# Project Memory Pack");

    const preflight = await run(
      "node",
      [
        tsxCli,
        "/Users/hemangdoshi/Developer/agent-memory/src/cli/main.ts",
        "preflight",
        "--command",
        "npm run render",
        "--json"
      ],
      { cwd }
    );

    const preflightJson = JSON.parse(preflight.stdout) as { decision: string };
    expect(preflightJson.decision).toBe("warn");
  });
});
