import type { UpdateAdminProfileInput } from "@tworiver/shared";
import type { BlogDatabase } from "../db/connection.js";

export interface AdminUserRecord {
  id: number;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
}

export interface AdminUserWithPassword extends AdminUserRecord {
  passwordHash: string;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  email: string;
  avatar_url: string;
}

export class UsernameConflictError extends Error {
  constructor() {
    super("Username already exists");
    this.name = "UsernameConflictError";
  }
}

function mapUser(row: UserRow): AdminUserWithPassword {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url
  };
}

export function toPublicAdminUser(user: AdminUserWithPassword | AdminUserRecord): AdminUserRecord {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    avatarUrl: user.avatarUrl
  };
}

export function getAdminUserById(db: BlogDatabase, id: number): AdminUserWithPassword | undefined {
  const row = db
    .prepare("SELECT id, username, password_hash, display_name, email, avatar_url FROM users WHERE id = ?")
    .get(id) as UserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function getAdminUserByUsername(db: BlogDatabase, username: string): AdminUserWithPassword | undefined {
  const row = db
    .prepare("SELECT id, username, password_hash, display_name, email, avatar_url FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  return row ? mapUser(row) : undefined;
}

export function updateAdminProfile(
  db: BlogDatabase,
  userId: number,
  input: UpdateAdminProfileInput
): AdminUserRecord | undefined {
  return db.transaction(() => {
    const existing = getAdminUserById(db, userId);
    if (!existing) {
      return undefined;
    }

    const conflict = getAdminUserByUsername(db, input.username);
    if (conflict && conflict.id !== userId) {
      throw new UsernameConflictError();
    }

    db.prepare(
      `UPDATE users
       SET username = ?, display_name = ?, email = ?, avatar_url = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.username, input.displayName, input.email, input.avatarUrl, new Date().toISOString(), userId);
    const updated = getAdminUserById(db, userId);
    return updated ? toPublicAdminUser(updated) : undefined;
  })();
}

export function updateAdminPasswordHash(db: BlogDatabase, userId: number, passwordHash: string): boolean {
  return (
    db
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, new Date().toISOString(), userId).changes > 0
  );
}
