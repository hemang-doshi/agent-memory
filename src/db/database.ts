import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema.js";

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "1"
  );
  return db;
}
