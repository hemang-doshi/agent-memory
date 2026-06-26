import { randomUUID } from "node:crypto";

import type { JsonRecord, ProtocolReceiptRecord, ReceiptType, SessionRecord } from "../domain/types.js";

import type { LoadedProject } from "./context.js";

export function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export function requireSession(
  loaded: LoadedProject,
  sessionId: string,
  options: { allowFinished?: boolean } = {}
): SessionRecord {
  const session = loaded.repo.getSession(sessionId);
  if (!session || session.projectId !== loaded.project.projectId) {
    throw new Error(`Unknown session: ${sessionId}`);
  }

  if (!options.allowFinished && session.status === "finished") {
    throw new Error("Session is already finished.");
  }

  return session;
}

export function writeProtocolReceipt(
  loaded: LoadedProject,
  input: {
    sessionId?: string | null;
    receiptType: ReceiptType;
    payload?: JsonRecord;
  }
): ProtocolReceiptRecord {
  return loaded.repo.insertProtocolReceipt({
    projectId: loaded.project.projectId,
    sessionId: input.sessionId ?? null,
    receiptType: input.receiptType,
    payload: input.payload ?? {}
  });
}
