import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config.js";
import type { BlogDatabase } from "../../db/connection.js";
import { getAboutProfile } from "../../repositories/aboutRepository.js";
import { collectTiptapResourceReferences } from "../resourceReferenceService.js";
import { getUploadsRoot } from "./uploadPaths.js";

const PUBLIC_UPLOAD_PREFIX = "/uploads/";
const UPLOAD_URL_PATTERN = /\/uploads\/[^\s"'`)<>]+/g;
const MANAGED_RESOURCE_PREFIX = "resources/";

export interface CleanupUploadsOptions {
  dryRun?: boolean;
}

export interface CleanupUploadsResult {
  retained: string[];
  removed: string[];
}

interface PostContentRow {
  id: number;
  post_id: number;
  locale: "zh" | "en";
  content_format: "markdown" | "tiptap";
  content_markdown: string;
  content_json: string | null;
  content_schema_version: number | null;
}

interface ReferencedUploadPaths {
  paths: Set<string>;
  hasInvalidPostContentReferences: boolean;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeFileKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function publicUrlToRelativePath(url: string): string | undefined {
  let pathname = url;
  try {
    pathname = new URL(url, "http://local.invalid").pathname;
  } catch {
    pathname = url.split(/[?#]/, 1)[0] ?? url;
  }

  if (!pathname.startsWith(PUBLIC_UPLOAD_PREFIX)) {
    return undefined;
  }

  const relativeUrl = pathname.slice(PUBLIC_UPLOAD_PREFIX.length);
  if (!relativeUrl || relativeUrl.includes("\0")) {
    return undefined;
  }

  try {
    return decodeURIComponent(relativeUrl);
  } catch {
    return undefined;
  }
}

function pathToPublicUrl(uploadsRoot: string, filePath: string): string {
  const relativePath = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
  return `/uploads/${relativePath}`;
}

function isManagedResourceFile(uploadsRoot: string, filePath: string): boolean {
  const relativePath = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
  return relativePath.startsWith(MANAGED_RESOURCE_PREFIX);
}

async function walkFiles(directory: string): Promise<string[]> {
  if (!(await pathExists(directory))) {
    return [];
  }

  const files: string[] = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function removeEmptyDirectories(directory: string, stopDirectory: string): Promise<void> {
  if (!isInsideRoot(stopDirectory, directory)) {
    return;
  }

  const entries = await fs.readdir(directory);
  if (entries.length > 0) {
    return;
  }

  await fs.rmdir(directory);
  await removeEmptyDirectories(path.dirname(directory), stopDirectory);
}

function addReferencedUpload(referencedPaths: Set<string>, uploadsRoot: string, url: string): void {
  const relativePath = publicUrlToRelativePath(url);
  if (!relativePath) {
    return;
  }

  const filePath = path.resolve(uploadsRoot, relativePath);
  if (isInsideRoot(uploadsRoot, filePath)) {
    referencedPaths.add(normalizeFileKey(filePath));
  }
}

function addReferencedUploadsFromMarkdown(referencedPaths: Set<string>, uploadsRoot: string, markdown: string): void {
  for (const match of markdown.matchAll(UPLOAD_URL_PATTERN)) {
    addReferencedUpload(referencedPaths, uploadsRoot, match[0]);
  }
}

function collectReferencedUploadPaths(config: AppConfig, db: BlogDatabase): ReferencedUploadPaths {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const referencedPaths = new Set<string>();
  let hasInvalidPostContentReferences = false;
  const postRows = db
    .prepare(
      `SELECT id, post_id, locale, content_format, content_markdown, content_json, content_schema_version
       FROM post_translations`
    )
    .all() as PostContentRow[];

  for (const row of postRows) {
    if (row.content_format === "markdown") {
      addReferencedUploadsFromMarkdown(referencedPaths, uploadsRoot, row.content_markdown);
      continue;
    }

    const references = collectTiptapResourceReferences(row);
    if (references.invalid) {
      hasInvalidPostContentReferences = true;
      continue;
    }

    for (const url of references.urls) {
      addReferencedUpload(referencedPaths, uploadsRoot, url);
    }
  }

  const aboutProfile = getAboutProfile(db);
  addReferencedUpload(referencedPaths, uploadsRoot, aboutProfile.avatarUrl);

  return { paths: referencedPaths, hasInvalidPostContentReferences };
}

export async function cleanupOrphanUploads(
  config: AppConfig,
  db: BlogDatabase,
  options: CleanupUploadsOptions = {}
): Promise<CleanupUploadsResult> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const referencedUploadPaths = collectReferencedUploadPaths(config, db);
  const files = (await walkFiles(uploadsRoot)).map((filePath) => path.resolve(filePath)).sort();
  const retained: string[] = [];
  const removed: string[] = [];

  for (const filePath of files) {
    if (!isInsideRoot(uploadsRoot, filePath)) {
      continue;
    }

    const publicUrl = pathToPublicUrl(uploadsRoot, filePath);
    if (isManagedResourceFile(uploadsRoot, filePath)) {
      retained.push(publicUrl);
      continue;
    }

    if (
      referencedUploadPaths.hasInvalidPostContentReferences ||
      referencedUploadPaths.paths.has(normalizeFileKey(filePath))
    ) {
      retained.push(publicUrl);
      continue;
    }

    removed.push(publicUrl);
    if (options.dryRun !== true) {
      await fs.rm(filePath, { force: true });
      await removeEmptyDirectories(path.dirname(filePath), uploadsRoot);
    }
  }

  return { retained, removed };
}
