import crypto from "node:crypto";
import type { BlogDatabase } from "../db/connection.js";

export interface SessionUser {
  id: number;
  username: string;
  csrfToken: string;
}

export interface CreatedSession {
  id: string;
  csrfToken: string;
  expiresAt: string;
}

interface SessionUserRow {
  id: number;
  username: string;
  csrf_token: string | null;
  expires_at: string;
}

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export function createSession(db: BlogDatabase, userId: number): CreatedSession {
  const id = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare("INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    csrfToken,
    expiresAt
  );

  return { id, csrfToken, expiresAt };
}

export function getSessionUser(db: BlogDatabase, sessionId: string): SessionUser | null {
  const row = db
    .prepare(
      `
        SELECT users.id, users.username, sessions.csrf_token, sessions.expires_at
        FROM sessions
        INNER JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ?
      `
    )
    .get(sessionId) as SessionUserRow | undefined;

  if (!row) {
    return null;
  }

  if (!row.csrf_token) {
    deleteSession(db, sessionId);
    return null;
  }

  if (row.expires_at <= new Date().toISOString()) {
    deleteSession(db, sessionId);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    csrfToken: row.csrf_token
  };
}

export function deleteSession(db: BlogDatabase, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
