import type { JsonRecord, PreflightDecision, PreflightResult } from "../domain/types.js";
import type { MemoryRecord } from "../domain/types.js";
import { parseCommandPolicyMatchType, parsePreflightDecision } from "../domain/validators.js";

import { loadProject } from "./context.js";
import { selectAgentVisibleMemories } from "./memory-visibility.js";
import { requireSession, writeProtocolReceipt } from "./protocol-receipts.js";

function commandMatches(command: string, metadata: JsonRecord): boolean {
  const pattern = typeof metadata.commandPattern === "string" ? metadata.commandPattern : "";

  if (!pattern) {
    return false;
  }

  let matchType: "substring" | "exact" | "regex";
  try {
    matchType = parseCommandPolicyMatchType(metadata.matchType ?? "substring");
  } catch {
    return false;
  }

  switch (matchType) {
    case "exact":
      return command === pattern;
    case "regex":
      try {
        return new RegExp(pattern).test(command);
      } catch {
        return false;
      }
    default:
      return command.includes(pattern);
  }
}

const DECISION_RANK: Record<PreflightDecision, number> = { allow: 1, warn: 2, block: 3 };
const SEVERITY_RANK = { low: 1, medium: 2, high: 3 } as const;
const MATCH_TYPE_RANK = { substring: 1, regex: 2, exact: 3 } as const;
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 } as const;

function policyDecision(memory: MemoryRecord): PreflightDecision {
  try {
    return parsePreflightDecision(memory.metadata.decision ?? "warn");
  } catch {
    return "warn";
  }
}

function policyMatchType(memory: MemoryRecord): "substring" | "exact" | "regex" {
  try {
    return parseCommandPolicyMatchType(memory.metadata.matchType ?? "substring");
  } catch {
    return "substring";
  }
}

function comparePolicies(left: MemoryRecord, right: MemoryRecord): number {
  const decisionDelta = DECISION_RANK[policyDecision(right)] - DECISION_RANK[policyDecision(left)];
  if (decisionDelta !== 0) {
    return decisionDelta;
  }

  const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const matchTypeDelta =
    MATCH_TYPE_RANK[policyMatchType(right)] - MATCH_TYPE_RANK[policyMatchType(left)];
  if (matchTypeDelta !== 0) {
    return matchTypeDelta;
  }

  const confidenceDelta = CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence];
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return right.createdAt.localeCompare(left.createdAt);
}

export async function preflightCommand({
  cwd,
  command,
  sessionId
}: {
  cwd: string;
  command: string;
  sessionId?: string;
}): Promise<PreflightResult> {
  const loaded = await loadProject(cwd);

  try {
    if (sessionId) {
      requireSession(loaded, sessionId);
    }

    if (!loaded.context.config.preflight.enabled) {
      const result = {
        decision: "allow",
        reason: "Preflight disabled in project config.",
        message: "No command policy checks were run.",
        matchedMemoryIds: []
      } satisfies PreflightResult;

      if (sessionId) {
        writeProtocolReceipt(loaded, {
          sessionId,
          receiptType: "preflight_checked",
          payload: {
            command,
            decision: result.decision,
            matchedMemoryIds: result.matchedMemoryIds
          }
        });
      }

      return result;
    }

    const memories = loaded.repo.listMemories(loaded.project.projectId);
    const visible = selectAgentVisibleMemories({
      memories,
      config: loaded.context.config
    });
    const matched = visible.filter(
      (memory) =>
        memory.type === "command_policy" &&
        commandMatches(command, memory.metadata)
    ).sort(comparePolicies);

    const configDefault = loaded.context.config.preflight.default_decision;
    let decision: PreflightDecision = configDefault;
    let reason = `No matching project memory. Default decision: ${decision}.`;
    let message = "No relevant risk found for this command.";
    let suggestedAction: string | undefined;

    if (matched.length > 0) {
      const highest = matched[0]!;
      decision = policyDecision(highest);
      reason = "Matched active command policy.";
      message = highest.content;
      suggestedAction =
        typeof highest.metadata.suggestedAction === "string"
          ? highest.metadata.suggestedAction
          : undefined;
    }

    loaded.repo.insertEvent({
      projectId: loaded.project.projectId,
      eventType: "command_preflighted",
      actor: "system",
      payload: {
        command,
        decision,
        matchedMemoryIds: matched.map((memory) => memory.id)
      }
    });

    const result: PreflightResult = {
      decision,
      reason,
      message,
      matchedMemoryIds: matched.map((memory) => memory.id),
      suggestedAction
    };

    if (sessionId) {
      const payload = {
        command,
        decision,
        matchedMemoryIds: result.matchedMemoryIds,
        suggestedAction
      };
      writeProtocolReceipt(loaded, {
        sessionId,
        receiptType: "preflight_checked",
        payload
      });
      if (decision === "warn") {
        writeProtocolReceipt(loaded, {
          sessionId,
          receiptType: "warning_triggered",
          payload
        });
      }
      if (decision === "block") {
        writeProtocolReceipt(loaded, {
          sessionId,
          receiptType: "block_triggered",
          payload
        });
      }
    }

    return result;
  } finally {
    loaded.close();
  }
}
