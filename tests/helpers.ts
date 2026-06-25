import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempWorkspace(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `${prefix}-`));
  return realpath(path);
}

export async function cleanupWorkspace(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
