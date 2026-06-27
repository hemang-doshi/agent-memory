import type { DogfoodReport } from "../domain/types.js";

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

export function formatDogfoodReport(report: DogfoodReport): string {
  return [
    `Dogfood report: ${report.protocol.compliant ? "PASS" : "INCOMPLETE"}`,
    `Session: ${report.sessionId}`,
    `Task: ${report.task}`,
    `Status: ${report.status}`,
    "",
    "Protocol:",
    `- compliant: ${yesNo(report.protocol.compliant)}`,
    `- missing checkpoints: ${
      report.protocol.missingCheckpoints.length > 0
        ? report.protocol.missingCheckpoints.join(", ")
        : "none"
    }`,
    "",
    "Activity:",
    `- memories injected: ${report.activity.memoriesInjected.length}`,
    `- preflights: ${report.activity.preflightChecks}`,
    `- warnings: ${report.activity.warningsTriggered}`,
    `- blocks: ${report.activity.blocksTriggered}`,
    `- events: ${report.activity.eventsRecorded}`,
    `- candidates proposed: ${report.activity.candidatesProposed}`,
    `- candidates reviewed: ${report.activity.candidatesReviewed}`,
    "",
    "Dogfood signals:",
    `- memory used: ${yesNo(report.signals.memoryUsed)}`,
    `- preflight used: ${yesNo(report.signals.preflightUsed)}`,
    `- evidence captured: ${yesNo(report.signals.evidenceCaptured)}`,
    `- learning captured: ${yesNo(report.signals.learningCaptured)}`,
    `- review happened: ${yesNo(report.signals.reviewHappened)}`,
    "",
    "Notes:",
    ...report.notes.map((note) => `- ${note}`)
  ].join("\n");
}
