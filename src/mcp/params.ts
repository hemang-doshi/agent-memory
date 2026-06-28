import type { CandidateStatus, JsonRecord, RetrievalMode } from "../domain/types.js";

import { McpRequestError, type RetrievalInput } from "./types.js";

export function asObject(value: unknown, label = "params"): JsonRecord {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new McpRequestError("invalid_request", `${label} must be an object.`);
  }
  return value as JsonRecord;
}

export function requireString(params: JsonRecord, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new McpRequestError("invalid_request", `Missing required MCP parameter: ${key}.`);
  }
  return value;
}

export function optionalString(params: JsonRecord, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new McpRequestError("invalid_request", `MCP parameter must be a string: ${key}.`);
  }
  return value;
}

export function optionalBoolean(params: JsonRecord, key: string, fallback = false): boolean {
  const value = params[key];
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new McpRequestError("invalid_request", `MCP parameter must be a boolean: ${key}.`);
  }
  return value;
}

export function optionalNumber(params: JsonRecord, key: string): number | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new McpRequestError("invalid_request", `MCP parameter must be a finite number: ${key}.`);
  }
  return value;
}

export function optionalStringArray(params: JsonRecord, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new McpRequestError("invalid_request", `MCP parameter must be a string array: ${key}.`);
  }
  return value;
}

export function optionalRetrievalMode(params: JsonRecord): RetrievalMode | undefined {
  const value = params.mode;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    value === "deterministic" ||
    value === "keyword" ||
    value === "hybrid" ||
    value === "vector"
  ) {
    return value;
  }
  throw new McpRequestError("invalid_request", "MCP parameter mode must be a supported retrieval mode.");
}

export function optionalCandidateStatus(params: JsonRecord): CandidateStatus | undefined {
  const value = params.status;
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    value === "proposed" ||
    value === "approved" ||
    value === "rejected" ||
    value === "merged" ||
    value === "superseded" ||
    value === "expired"
  ) {
    return value;
  }
  throw new McpRequestError("invalid_request", "MCP parameter status must be a candidate status.");
}

export function retrievalInputFromParams(params: JsonRecord): RetrievalInput {
  return {
    task: requireString(params, "task"),
    files: optionalStringArray(params, "files"),
    command: optionalString(params, "command"),
    maxResults: optionalNumber(params, "maxResults"),
    mode: optionalRetrievalMode(params)
  };
}
