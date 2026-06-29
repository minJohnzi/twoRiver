import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { openDatabase } from "../db/connection.js";
import { createBackupArchive, extractAndValidateBackup, removeExtractedBackup } from "./backupService.js";
import { deleteExpiredSessions } from "./sessionService.js";
import { getUploadsRoot } from "./uploads/uploadPaths.js";

interface CountRow {
  count: number;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createBackupRecord(
  app: FastifyInstance,
  input: { kind: "download" | "pre-restore" | "restore"; filename: string; status: "started" | "completed" | "failed"; sizeBytes?: number; checksumSha256?: string; message?: string }
): number {
  const result = app.db
    .prepare(
      `INSERT INTO backup_records (kind, filename, status, size_bytes, checksum_sha256, message, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.kind,
      input.filename,
      input.status,
      input.sizeBytes ?? 0,
      input.checksumSha256 ?? "",
      input.message ?? "",
      input.status === "completed" ? new Date().toISOString() : null
    );
  return Number(result.lastInsertRowid);
}

export async function restoreBackupArchive(app: FastifyInstance, config: AppConfig, archive: Buffer): Promise<{ preRestoreBackupId: number }> {
  const preRestore = await createBackupArchive(config, app.db);
  const preRestoreBackupId = createBackupRecord(app, {
    kind: "pre-restore",
    filename: preRestore.filename,
    status: "completed",
    sizeBytes: preRestore.buffer.length,
    checksumSha256: preRestore.checksum
  });

  const extracted = await extractAndValidateBackup(archive);
  try {
    const databasePath = path.resolve(config.DATABASE_PATH);
    const uploadsRoot = path.resolve(getUploadsRoot(config));
    app.db.close();
    await fs.copyFile(path.join(extracted.directory, extracted.manifest.databaseFile), databasePath);
    await fs.rm(uploadsRoot, { recursive: true, force: true });
    await fs.cp(path.join(extracted.directory, extracted.manifest.uploadsDirectory), uploadsRoot, { recursive: true });
    Object.defineProperty(app, "db", {
      value: openDatabase(databasePath),
      writable: true,
      configurable: true
    });
    createBackupRecord(app, {
      kind: "restore",
      filename: "uploaded-backup.tar.gz",
      status: "completed",
      sizeBytes: archive.length
    });
    return { preRestoreBackupId };
  } finally {
    await removeExtractedBackup(extracted.directory);
  }
}

export async function getSystemHealth(config: AppConfig, app: FastifyInstance) {
  const uploadsRoot = getUploadsRoot(config);
  const expired = app.db
    .prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at <= ?")
    .get(new Date().toISOString()) as CountRow;
  const backups = app.db.prepare("SELECT COUNT(*) AS count FROM backup_records").get() as CountRow;
  return {
    database: {
      ok: true,
      path: path.resolve(config.DATABASE_PATH)
    },
    uploads: {
      ok: await pathExists(uploadsRoot),
      path: uploadsRoot
    },
    backups: {
      total: backups.count
    },
    sessions: {
      expired: expired.count
    }
  };
}

export async function runMaintenanceAction(app: FastifyInstance, action: string): Promise<number> {
  if (action === "expired-sessions") {
    return deleteExpiredSessions(app.db);
  }
  if (action === "expired-analytics") {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return app.db.prepare("DELETE FROM analytics_events WHERE event_date < ?").run(cutoff).changes;
  }
  if (action === "expired-trash") {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return app.db.prepare("DELETE FROM posts WHERE deleted_at IS NOT NULL AND deleted_at <= ?").run(cutoff).changes;
  }
  return 0;
}
