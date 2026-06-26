import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema.js";

function ensureColumn(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  alterSql: string
): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: unknown;
  }>;
  const exists = rows.some((row) => row.name === columnName);
  if (!exists) {
    db.exec(alterSql);
  }
}

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA_SQL);
  ensureColumn(
    db,
    "memory_candidates",
    "evidence_event_ids_json",
    "ALTER TABLE memory_candidates ADD COLUMN evidence_event_ids_json TEXT NOT NULL DEFAULT '[]'"
  );
  db.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "1"
  );
  return db;
}
