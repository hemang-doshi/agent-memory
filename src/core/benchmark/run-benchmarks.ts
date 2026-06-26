import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { loadBenchmarkFixture } from "./load-fixture.js";
import { runBenchmarkFixture } from "./run-fixture.js";
import type { BenchmarkRunReport } from "./types.js";

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
  const fixturesDir = join(cwd, "benchmarks", "fixtures", "protocol");
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const fixturePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(fixturesDir, entry.name))
    .sort();

  const results = [];
  for (const fixturePath of fixturePaths) {
    const fixture = await loadBenchmarkFixture(fixturePath);
    results.push(await runBenchmarkFixture(fixture));
  }

  return report(results);
}
