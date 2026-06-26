import type { ProtocolReceiptRecord } from "../domain/types.js";

import { loadProject } from "./context.js";
import { requireSession } from "./protocol-receipts.js";

export interface SessionReceiptSummary {
  sessionId: string;
  task: string;
  status: string;
  packLoaded: boolean;
  memoriesInjected: string[];
  preflightChecks: number;
  warningsTriggered: number;
  blocksTriggered: number;
  candidatesProposed: number;
  sessionFinished: boolean;
  receipts: Array<{
    type: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function summarizeSessionReceipts({
  sessionId,
  task,
  status,
  receipts
}: {
  sessionId: string;
  task: string;
  status: string;
  receipts: ProtocolReceiptRecord[];
}): SessionReceiptSummary {
  return {
    sessionId,
    task,
    status,
    packLoaded: receipts.some((receipt) => receipt.receiptType === "pack_loaded"),
    memoriesInjected: unique(
      receipts.flatMap((receipt) =>
        receipt.receiptType === "pack_loaded" ? stringArray(receipt.payload.matchedMemoryIds) : []
      )
    ),
    preflightChecks: receipts.filter((receipt) => receipt.receiptType === "preflight_checked").length,
    warningsTriggered: receipts.filter((receipt) => receipt.receiptType === "warning_triggered").length,
    blocksTriggered: receipts.filter((receipt) => receipt.receiptType === "block_triggered").length,
    candidatesProposed: receipts.filter((receipt) => receipt.receiptType === "candidate_proposed").length,
    sessionFinished: receipts.some((receipt) => receipt.receiptType === "session_finished"),
    receipts: receipts.map((receipt) => ({
      type: receipt.receiptType,
      createdAt: receipt.createdAt,
      payload: receipt.payload
    }))
  };
}

export async function getSessionReceipt({
  cwd,
  sessionId
}: {
  cwd: string;
  sessionId: string;
}): Promise<SessionReceiptSummary> {
  const loaded = await loadProject(cwd);

  try {
    const session = requireSession(loaded, sessionId, { allowFinished: true });
    const receipts = loaded.repo.listProtocolReceipts(loaded.project.projectId, sessionId);
    return summarizeSessionReceipts({
      sessionId,
      task: session.task,
      status: session.status,
      receipts
    });
  } finally {
    loaded.close();
  }
}

export function formatSessionReceiptText(receipt: SessionReceiptSummary): string {
  if (
    !receipt.packLoaded &&
    receipt.preflightChecks === 0 &&
    receipt.candidatesProposed === 0
  ) {
    return "Memory: session started, no pack/preflight/candidates recorded.";
  }

  const memoryCount = receipt.memoriesInjected.length;
  const memoryLabel = memoryCount === 1 ? "memory" : "memories";
  const preflightLabel = receipt.preflightChecks === 1 ? "preflight" : "preflights";
  const warningLabel = receipt.warningsTriggered === 1 ? "warning" : "warnings";
  const candidateLabel = receipt.candidatesProposed === 1 ? "candidate" : "candidates";

  return `Memory: loaded ${memoryCount} ${memoryLabel}, ran ${receipt.preflightChecks} ${preflightLabel}, triggered ${receipt.warningsTriggered} ${warningLabel}, proposed ${receipt.candidatesProposed} ${candidateLabel}.`;
}
