import type { BlogDatabase } from "../db/connection.js";

export type ResourceKind = "post-image" | "about-image" | "asset";

export interface ResourceRecord {
  id: number;
  url: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  kind: ResourceKind;
  folder: string;
  source: string;
  checksumSha256: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertResourceInput {
  url: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  kind: ResourceKind;
  folder: string;
  source: string;
  checksumSha256: string;
}

interface ResourceRow {
  id: number;
  url: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  kind: ResourceKind;
  folder: string;
  source: string;
  checksum_sha256: string;
  created_at: string;
  updated_at: string;
}

function mapResource(row: ResourceRow): ResourceRecord {
  return {
    id: row.id,
    url: row.url,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.kind,
    folder: row.folder,
    source: row.source,
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getResourceByUrl(db: BlogDatabase, url: string): ResourceRecord | undefined {
  const row = db.prepare("SELECT * FROM resources WHERE url = ?").get(url) as ResourceRow | undefined;
  return row ? mapResource(row) : undefined;
}

export function listResourceRecords(db: BlogDatabase): ResourceRecord[] {
  return (db.prepare("SELECT * FROM resources ORDER BY updated_at DESC, id DESC").all() as ResourceRow[]).map(mapResource);
}

export function upsertResource(db: BlogDatabase, input: UpsertResourceInput): ResourceRecord {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO resources (
       url, storage_path, original_filename, mime_type, size_bytes, kind, folder, source, checksum_sha256, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       storage_path = excluded.storage_path,
       original_filename = excluded.original_filename,
       mime_type = excluded.mime_type,
       size_bytes = excluded.size_bytes,
       kind = excluded.kind,
       folder = excluded.folder,
       checksum_sha256 = excluded.checksum_sha256,
       updated_at = excluded.updated_at`
  ).run(
    input.url,
    input.storagePath,
    input.originalFilename,
    input.mimeType,
    input.sizeBytes,
    input.kind,
    input.folder,
    input.source,
    input.checksumSha256,
    now,
    now
  );

  return getResourceByUrl(db, input.url) as ResourceRecord;
}

export function updateResourceLocation(
  db: BlogDatabase,
  id: number,
  input: Pick<UpsertResourceInput, "url" | "storagePath" | "folder" | "sizeBytes" | "mimeType" | "checksumSha256">
): ResourceRecord {
  db.prepare(
    `UPDATE resources
     SET url = ?, storage_path = ?, folder = ?, size_bytes = ?, mime_type = ?, checksum_sha256 = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    input.url,
    input.storagePath,
    input.folder,
    input.sizeBytes,
    input.mimeType,
    input.checksumSha256,
    new Date().toISOString(),
    id
  );

  const record = getResourceByUrl(db, input.url);
  if (!record) {
    throw new Error("Resource registry update failed");
  }
  return record;
}

export function deleteResourceRecord(db: BlogDatabase, id: number): boolean {
  return db.prepare("DELETE FROM resources WHERE id = ?").run(id).changes > 0;
}

export function deleteResourceRecordsNotIn(db: BlogDatabase, urls: string[]): void {
  const retainedUrls = new Set(urls);
  const deleteRecord = db.prepare("DELETE FROM resources WHERE id = ?");
  for (const record of listResourceRecords(db)) {
    if (!retainedUrls.has(record.url)) {
      deleteRecord.run(record.id);
    }
  }
}
