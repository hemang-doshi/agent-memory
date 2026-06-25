import type { ProjectConfig } from "./types.js";

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  project_name: "agent-memory-preflight",
  memory_pack_token_budget: 1200,
  default_scope: "project",
  preflight: {
    enabled: true,
    default_decision: "warn",
    block_requires_explicit_policy: true
  },
  retrieval: {
    include_unverified: false,
    include_stale: false,
    max_results: 8
  }
};

export const TYPE_PRIORITIES: Record<string, number> = {
  command_policy: 100,
  constraint: 90,
  decision: 80,
  failed_attempt: 70,
  known_fix: 60,
  fragile_file: 50,
  workflow_rule: 40,
  tool_quirk: 30,
  architecture_note: 20,
  design_rule: 10,
  pending_task: 5
};

export const SEVERITY_SCORES = { low: 1, medium: 2, high: 3 } as const;
export const CONFIDENCE_SCORES = { low: 1, medium: 2, high: 3 } as const;
