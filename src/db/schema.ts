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
  project_id TEXT,
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
  expires_at TEXT,
  related_memory_ids_json TEXT NOT NULL,
  supersedes_memory_id TEXT,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_links (
  memory_id TEXT NOT NULL,
  related_memory_id TEXT NOT NULL,
  PRIMARY KEY (memory_id, related_memory_id)
);
`;
