import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema.js";

const SCHEMA_VERSION = "2";

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runMigrations(db: DatabaseSync): void {
  addColumnIfMissing(db, "memories", "pinned", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "memories", "priority", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "memories", "use_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "memories", "last_retrieved_at", "TEXT");
  addColumnIfMissing(db, "memories", "last_injected_at", "TEXT");
  addColumnIfMissing(db, "memories", "conflict_group", "TEXT");
  addColumnIfMissing(db, "memories", "safety_flags_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "memories", "redaction_status", "TEXT NOT NULL DEFAULT 'none'");
}

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA_SQL);
  runMigrations(db);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    SCHEMA_VERSION
  );
  return db;
}
