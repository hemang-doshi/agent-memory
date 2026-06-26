import type { BenchmarkRunReport } from "./types.js";

export function formatBenchmarkReport(report: BenchmarkRunReport): string {
  const lines = ["Benchmark results:"];

  for (const result of report.results) {
    lines.push(`- ${result.name}: ${result.passed ? "PASS" : "FAIL"}`);
    for (const check of result.checks.filter((entry) => !entry.passed)) {
      lines.push(`  - ${check.message ?? check.name}`);
    }
  }

  lines.push("", `Passed ${report.summary.passed}/${report.summary.total}.`);
  return lines.join("\n");
}
