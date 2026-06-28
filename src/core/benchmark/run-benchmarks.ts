import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadBenchmarkFixture } from "./load-fixture.js";
import { runBenchmarkFixture } from "./run-fixture.js";
import type { BenchmarkRunReport } from "./types.js";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");

function report(results: BenchmarkRunReport["results"]): BenchmarkRunReport {
  const passed = results.filter((result) => result.passed).length;
  return {
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed
    },
    results
  };
}

export async function runBenchmarkFixturePath(path: string): Promise<BenchmarkRunReport> {
  const fixture = await loadBenchmarkFixture(resolve(path));
  return report([await runBenchmarkFixture(fixture)]);
}

export async function runProtocolBenchmarks({ cwd }: { cwd: string }): Promise<BenchmarkRunReport> {
  let fixturesDir = join(cwd, "benchmarks", "fixtures", "protocol");
  try {
    await readdir(fixturesDir);
  } catch {
    fixturesDir = join(PROJECT_ROOT, "benchmarks", "fixtures", "protocol");
  }
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const fixturePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(fixturesDir, entry.name))
    .sort();

  const results: BenchmarkRunReport["results"] = [];
  for (const fixturePath of fixturePaths) {
    try {
      const fixture = await loadBenchmarkFixture(fixturePath);
      results.push(await runBenchmarkFixture(fixture));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: fixturePath,
        passed: false,
        checks: [{ name: "fixture execution", passed: false, message }],
        sessionId: "",
        matchedMemoryIds: [],
        preflightResults: [],
        candidateIds: [],
        candidateEvidenceEventIds: [],
        receiptTypes: [],
        notes: []
      });
    }
  }

  return report(results);
}
