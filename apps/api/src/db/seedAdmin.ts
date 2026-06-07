import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlogDatabase } from "./connection.js";
import { openDatabase } from "./connection.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../services/passwordService.js";

const modulePath = fileURLToPath(import.meta.url);

interface UserRow {
  id: number;
}

export async function seedAdmin(db: BlogDatabase, username: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as UserRow | undefined;

  if (existingUser) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      passwordHash,
      new Date().toISOString(),
      existingUser.id
    );
    return;
  }

  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
}

async function runCli(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.DATABASE_PATH);

  try {
    await seedAdmin(db, config.ADMIN_USERNAME, config.ADMIN_PASSWORD);
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  await runCli();
}
