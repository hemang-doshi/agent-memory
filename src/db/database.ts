import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema.js";

export const SCHEMA_VERSION = "4";

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string): string | null {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return `Added ${table}.${column}`;
  }
  return null;
}

export interface MigrationStep {
  step: string;
  appliedNow: boolean;
  alreadyApplied: boolean;
  description: string;
}

export function runColumnMigrations(db: DatabaseSync): MigrationStep[] {
  const steps: MigrationStep[] = [];

  const migrations: Array<[string, string, string, string]> = [
    ["memories", "pinned", "INTEGER NOT NULL DEFAULT 0", "v2: pinned flag"],
    ["memories", "priority", "INTEGER NOT NULL DEFAULT 0", "v2: priority score"],
    ["memories", "use_count", "INTEGER NOT NULL DEFAULT 0", "v2: use count tracking"],
    ["memories", "last_retrieved_at", "TEXT", "v2: retrieval timestamp"],
    ["memories", "last_injected_at", "TEXT", "v2: injection timestamp"],
    ["memories", "conflict_group", "TEXT", "v2: conflict group"],
    ["memories", "safety_flags_json", "TEXT NOT NULL DEFAULT '[]'", "v2: safety flags"],
    ["memories", "redaction_status", "TEXT NOT NULL DEFAULT 'none'", "v2: redaction status"],
    ["memories", "trust_level", "TEXT NOT NULL DEFAULT 'reviewed'", "v3: trust level"],
    ["memory_candidates", "evidence_event_ids_json", "TEXT NOT NULL DEFAULT '[]'", "v2: candidate evidence ids"],
    ["memory_candidates", "metadata_json", "TEXT NOT NULL DEFAULT '{}'", "v2: candidate metadata"]
  ];

  for (const [table, column, definition, description] of migrations) {
    const already = hasColumn(db, table, column);
    if (!already) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    steps.push({
      step: `ALTER TABLE ${table} ADD COLUMN ${column}`,
      appliedNow: !already,
      alreadyApplied: already,
      description
    });
  }

  return steps;
}

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  runColumnMigrations(db);
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    SCHEMA_VERSION
  );
  return db;
}
