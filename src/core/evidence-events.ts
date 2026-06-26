import { EVIDENCE_EVENT_TYPES, type EventRecord, type EvidenceEventType } from "../domain/types.js";

export function isEvidenceEventType(value: string): value is EvidenceEventType {
  return EVIDENCE_EVENT_TYPES.includes(value as EvidenceEventType);
}

export function eventSummary(event: EventRecord): string {
  return typeof event.payload.summary === "string" ? event.payload.summary : "";
}
