export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  git_root TEXT NOT NULL,
  git_remote_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  config_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL,
  confidence TEXT NOT NULL,
  source TEXT NOT NULL,
  paths_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  last_retrieved_at TEXT,
  last_injected_at TEXT,
  expires_at TEXT,
  related_memory_ids_json TEXT NOT NULL,
  supersedes_memory_id TEXT,
  conflict_group TEXT,
  safety_flags_json TEXT NOT NULL DEFAULT '[]',
  redaction_status TEXT NOT NULL DEFAULT 'none',
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_links (
  memory_id TEXT NOT NULL REFERENCES memories(id),
  related_memory_id TEXT NOT NULL REFERENCES memories(id),
  PRIMARY KEY (memory_id, related_memory_id)
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS protocol_receipts (
  receipt_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_id TEXT REFERENCES sessions(session_id),
  receipt_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  candidate_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  session_id TEXT REFERENCES sessions(session_id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,
  severity TEXT NOT NULL,
  evidence TEXT NOT NULL,
  evidence_event_ids_json TEXT NOT NULL DEFAULT '[]',
  candidate_status TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_reason TEXT,
  target_memory_id TEXT REFERENCES memories(id),
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_memories_project_created
ON memories(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_project_timestamp
ON events(project_id, timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_git_root
ON projects(git_root);

CREATE INDEX IF NOT EXISTS idx_sessions_project_started
ON sessions(project_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_protocol_receipts_session_created
ON protocol_receipts(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_protocol_receipts_project_created
ON protocol_receipts(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_project_created
ON memory_candidates(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_candidates_status
ON memory_candidates(candidate_status);
`;
