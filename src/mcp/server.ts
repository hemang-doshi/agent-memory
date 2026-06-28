import { getMcpManifest } from "./core.js";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export {
  MCP_RESOURCE_URIS,
  MCP_TOOL_NAMES,
  McpRequestError,
  getMcpManifest,
  handleMcpRequest
} from "./core.js";
import { handleMcpRequest } from "./core.js";
export type {
  McpManifest,
  McpRequest,
  McpResourceDefinition,
  McpScanFinding,
  McpScanResult,
  McpToolDefinition
} from "./core.js";

export async function serveMcpOnce({ cwd }: { cwd: string }): Promise<{
  manifest: Awaited<ReturnType<typeof getMcpManifest>>;
  note: string;
}> {
  return {
    manifest: await getMcpManifest({ cwd }),
    note: "Agent Memory MCP stdio transport is modeled by this manifest/request handler; no shell commands are exposed."
  };
}

export async function serveMcpStdio({ cwd }: { cwd: string }): Promise<void> {
  const rl = createInterface({ input, output });
  output.write(`${JSON.stringify(await serveMcpOnce({ cwd }))}\n`);

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const request = JSON.parse(trimmed) as { method?: unknown; params?: unknown };
      if (typeof request.method !== "string") {
        throw new Error("MCP request line requires string method.");
      }
      const result = await handleMcpRequest({
        cwd,
        method: request.method,
        params: request.params
      });
      output.write(`${JSON.stringify({ ok: true, result })}\n`);
    } catch (error) {
      output.write(`${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        code: error && typeof error === "object" && "code" in error ? String(error.code) : "error"
      })}\n`);
    }
  }
}
