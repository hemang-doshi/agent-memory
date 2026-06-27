import type { ProtocolComplianceReport } from "../domain/types.js";

import { getSessionReceipt } from "./session-receipt.js";

export async function checkProtocolCompliance({
  cwd,
  sessionId
}: {
  cwd: string;
  sessionId: string;
}): Promise<ProtocolComplianceReport> {
  const receipt = await getSessionReceipt({ cwd, sessionId });
  const receiptTypes = receipt.receipts.map((entry) => entry.type);
  const required = {
    sessionStarted: receiptTypes.includes("session_started"),
    packLoaded: receiptTypes.includes("pack_loaded"),
    sessionFinished: receiptTypes.includes("session_finished")
  };
  const missingCheckpoints = [
    required.sessionStarted ? null : "session_started",
    required.packLoaded ? null : "pack_loaded",
    required.sessionFinished ? null : "session_finished"
  ].filter((checkpoint): checkpoint is string => checkpoint !== null);

  return {
    sessionId: receipt.sessionId,
    task: receipt.task,
    status: receipt.status === "finished" ? "finished" : "active",
    compliant: missingCheckpoints.length === 0,
    required,
    activity: {
      memoriesInjected: receipt.memoriesInjected,
      preflightChecks: receipt.preflightChecks,
      warningsTriggered: receipt.warningsTriggered,
      blocksTriggered: receipt.blocksTriggered,
      eventsRecorded: receipt.eventsRecorded,
      candidatesProposed: receipt.candidatesProposed,
      candidatesReviewed: receipt.candidatesReviewed
    },
    receiptTypes,
    missingCheckpoints,
    notes: []
  };
}
