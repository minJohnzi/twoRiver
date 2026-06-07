import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { openDatabase } from "./connection.js";

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(modulePath);

export function migrate(databasePath = loadConfig().DATABASE_PATH): void {
  const schemaPath = path.join(moduleDir, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    db.exec(schema);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  migrate();
}
