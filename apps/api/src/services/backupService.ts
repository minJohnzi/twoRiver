import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import type { AppConfig } from "../config.js";
import type { BlogDatabase } from "../db/connection.js";
import { BackupManifestSchema, type BackupManifest } from "@tworiver/shared";
import { getUploadsRoot } from "./uploads/uploadPaths.js";

const DATABASE_FILE = "database.sqlite";
const UPLOADS_DIRECTORY = "uploads";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(directory: string, prefix = ""): Promise<Array<{ path: string; key: string }>> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const files: Array<{ path: string; key: string }> = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath, key)));
    } else if (entry.isFile()) {
      files.push({ path: entryPath, key });
    }
  }
  return files;
}

async function checksumFile(filePath: string): Promise<string> {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function checksumsFor(root: string): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};
  for (const file of await walkFiles(root)) {
    if (file.key === "manifest.json") {
      continue;
    }
    checksums[file.key.split(path.sep).join("/")] = await checksumFile(file.path);
  }
  return checksums;
}

export async function createBackupArchive(config: AppConfig, db: BlogDatabase): Promise<{ buffer: Buffer; filename: string; checksum: string }> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tworiver-backup-create-"));
  try {
    await db.backup(path.join(workspace, DATABASE_FILE));
    const uploadsRoot = getUploadsRoot(config);
    if (await pathExists(uploadsRoot)) {
      await fs.cp(uploadsRoot, path.join(workspace, UPLOADS_DIRECTORY), { recursive: true });
    } else {
      await fs.mkdir(path.join(workspace, UPLOADS_DIRECTORY), { recursive: true });
    }

    const manifest: BackupManifest = {
      format: "tworiver-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      databaseFile: DATABASE_FILE,
      uploadsDirectory: UPLOADS_DIRECTORY,
      checksums: await checksumsFor(workspace)
    };
    await fs.writeFile(path.join(workspace, "manifest.json"), JSON.stringify(manifest, null, 2));

    const archivePath = path.join(workspace, "backup.tar.gz");
    await tar.c({ gzip: true, cwd: workspace, file: archivePath }, ["manifest.json", DATABASE_FILE, UPLOADS_DIRECTORY]);
    const buffer = await fs.readFile(archivePath);
    return {
      buffer,
      filename: `tworiver-backup-${manifest.createdAt.replace(/[:.]/g, "-")}.tar.gz`,
      checksum: crypto.createHash("sha256").update(buffer).digest("hex")
    };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

export async function extractAndValidateBackup(buffer: Buffer): Promise<{ directory: string; manifest: BackupManifest }> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tworiver-backup-restore-"));
  try {
    const archivePath = path.join(workspace, "restore.tar.gz");
    const extractDirectory = path.join(workspace, "extract");
    await fs.mkdir(extractDirectory);
    await fs.writeFile(archivePath, buffer);
    await tar.x({ file: archivePath, cwd: extractDirectory });

    const manifest = BackupManifestSchema.parse(
      JSON.parse(await fs.readFile(path.join(extractDirectory, "manifest.json"), "utf8"))
    );
    for (const [key, expected] of Object.entries(manifest.checksums)) {
      const actual = await checksumFile(path.join(extractDirectory, ...key.split("/")));
      if (actual !== expected) {
        throw new Error("Backup checksum mismatch");
      }
    }
    return { directory: extractDirectory, manifest };
  } catch (error) {
    await fs.rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

export async function removeExtractedBackup(directory: string): Promise<void> {
  await fs.rm(path.dirname(directory), { recursive: true, force: true });
}
