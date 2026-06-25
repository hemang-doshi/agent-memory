import { DatabaseSync } from "node:sqlite";

import { SCHEMA_SQL } from "./schema.js";

export function openDatabase(filename: string): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec(SCHEMA_SQL);
  return db;
}
