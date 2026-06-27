import type { DogfoodReport } from "../domain/types.js";

import { checkProtocolCompliance } from "./protocol-check.js";

export async function getDogfoodReport({
  cwd,
  sessionId
}: {
  cwd: string;
  sessionId: string;
}): Promise<DogfoodReport> {
  const compliance = await checkProtocolCompliance({ cwd, sessionId });
  const signals = {
    memoryUsed: compliance.activity.memoriesInjected.length > 0,
    preflightUsed: compliance.activity.preflightChecks > 0,
    evidenceCaptured: compliance.activity.eventsRecorded > 0,
    learningCaptured: compliance.activity.candidatesProposed > 0,
    reviewHappened: compliance.activity.candidatesReviewed > 0
  };
  const notes: string[] = [];

  if (compliance.compliant) {
    notes.push("Protocol completed successfully.");
  } else {
    notes.push(
      `Protocol is missing required checkpoints: ${compliance.missingCheckpoints.join(", ")}.`
    );
  }

  if (signals.memoryUsed) {
    notes.push("Memory was injected into the session.");
  } else {
    notes.push("No memories were injected into the session.");
  }

  if (signals.learningCaptured) {
    notes.push("Reusable learning was proposed as a candidate.");
  }

  if (signals.evidenceCaptured) {
    notes.push("Evidence was recorded during the session.");
  }

  return {
    sessionId: compliance.sessionId,
    task: compliance.task,
    status: compliance.status,
    protocol: {
      compliant: compliance.compliant,
      missingCheckpoints: compliance.missingCheckpoints,
      required: compliance.required
    },
    activity: compliance.activity,
    signals,
    notes
  };
}
