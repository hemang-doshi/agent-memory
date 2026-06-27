import type { ProtocolComplianceReport } from "../domain/types.js";

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function formatActivity(report: ProtocolComplianceReport): string[] {
  return [
    `- memories injected: ${report.activity.memoriesInjected.length}`,
    `- preflights: ${report.activity.preflightChecks}`,
    `- warnings: ${report.activity.warningsTriggered}`,
    `- blocks: ${report.activity.blocksTriggered}`,
    `- events: ${report.activity.eventsRecorded}`,
    `- candidates proposed: ${report.activity.candidatesProposed}`,
    `- candidates reviewed: ${report.activity.candidatesReviewed}`
  ];
}

export function formatProtocolCompliance(report: ProtocolComplianceReport): string {
  const lines = [
    `Protocol check: ${report.compliant ? "PASS" : "FAIL"}`,
    `Session: ${report.sessionId}`,
    `Task: ${report.task}`
  ];

  if (report.compliant) {
    lines.push(
      "Required:",
      `- session_started: ${yesNo(report.required.sessionStarted)}`,
      `- pack_loaded: ${yesNo(report.required.packLoaded)}`,
      `- session_finished: ${yesNo(report.required.sessionFinished)}`
    );
  } else {
    lines.push("Missing:", ...report.missingCheckpoints.map((checkpoint) => `- ${checkpoint}`));
  }

  lines.push("Activity:", ...formatActivity(report));
  return lines.join("\n");
}
