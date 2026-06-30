import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type BlogDatabase = Database.Database;

export function openDatabase(databasePath: string): BlogDatabase {
  const directory = path.dirname(databasePath);
  fs.mkdirSync(directory, { recursive: true });

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");

  return db;
}
