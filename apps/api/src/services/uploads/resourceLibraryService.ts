import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config.js";
import type { BlogDatabase } from "../../db/connection.js";
import {
  deleteResourceRecord,
  deleteResourceRecordsNotIn,
  getResourceByUrl,
  upsertResource,
  updateResourceLocation,
  type ResourceRecord
} from "../../repositories/resourcesRepository.js";
import { countResourceReferences } from "../resourceReferenceService.js";
import { getUploadsRoot } from "./uploadPaths.js";

export type UploadResourceKind = "post-image" | "about-image" | "asset";

export const DEFAULT_RESOURCE_FOLDER = "general";
export const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;

export interface UploadResource {
  id: number;
  kind: UploadResourceKind;
  url: string;
  relativePath: string;
  filename: string;
  directory: string;
  folder: string;
  originalFilename: string;
  sizeBytes: number;
  updatedAt: string;
  contentType: string;
  mimeType: string;
  source: string;
  checksumSha256: string;
  referenceCount: number;
  createdAt: string;
  postUid: string | null;
}

export interface UploadResourceFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

interface UploadResourceFileInfo {
  kind: UploadResourceKind;
  url: string;
  relativePath: string;
  filename: string;
  directory: string;
  folder: string;
  sizeBytes: number;
  updatedAt: string;
  contentType: string;
  postUid: string | null;
}

export class UploadResourcePathError extends Error {
  constructor(message = "Invalid upload resource path") {
    super(message);
    this.name = "UploadResourcePathError";
  }
}

export class UploadResourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadResourceValidationError";
  }
}

export class UploadResourceReferencedError extends Error {
  constructor(message = "Resource is referenced by published content") {
    super(message);
    this.name = "UploadResourceReferencedError";
  }
}

export interface RegisterStoredUploadResourceInput {
  url: string;
  originalFilename: string;
  mimeType: string;
  buffer?: Buffer;
  kind: UploadResourceKind;
  source?: string;
}

interface AllowedResourceType {
  contentType: string;
  mimetypes: string[];
  signature?: (buffer: Buffer) => boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87A_SIGNATURE = Buffer.from("GIF87a");
const GIF89A_SIGNATURE = Buffer.from("GIF89a");
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");
const PDF_SIGNATURE = Buffer.from("%PDF-");

const ALLOWED_RESOURCE_TYPES_BY_EXTENSION = new Map<string, AllowedResourceType>([
  [".gif", { contentType: "image/gif", mimetypes: ["image/gif"], signature: hasGifSignature }],
  [".jpeg", { contentType: "image/jpeg", mimetypes: ["image/jpeg"], signature: hasJpegSignature }],
  [".jpg", { contentType: "image/jpeg", mimetypes: ["image/jpeg"], signature: hasJpegSignature }],
  [".json", { contentType: "application/json", mimetypes: ["application/json", "text/plain"] }],
  [".md", { contentType: "text/markdown", mimetypes: ["text/markdown", "text/plain"] }],
  [".pdf", { contentType: "application/pdf", mimetypes: ["application/pdf"], signature: hasPdfSignature }],
  [".png", { contentType: "image/png", mimetypes: ["image/png"], signature: hasPngSignature }],
  [".txt", { contentType: "text/plain", mimetypes: ["text/plain"] }],
  [".webp", { contentType: "image/webp", mimetypes: ["image/webp"], signature: hasWebpSignature }],
  [".woff", { contentType: "font/woff", mimetypes: ["font/woff", "application/font-woff", "application/octet-stream"] }],
  [".woff2", { contentType: "font/woff2", mimetypes: ["font/woff2", "application/font-woff2", "application/octet-stream"] }]
]);

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function startsWithSignature(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function hasGifSignature(buffer: Buffer): boolean {
  return startsWithSignature(buffer, GIF87A_SIGNATURE) || startsWithSignature(buffer, GIF89A_SIGNATURE);
}

function hasJpegSignature(buffer: Buffer): boolean {
  return startsWithSignature(buffer, JPEG_SIGNATURE);
}

function hasPdfSignature(buffer: Buffer): boolean {
  return startsWithSignature(buffer, PDF_SIGNATURE);
}

function hasPngSignature(buffer: Buffer): boolean {
  return startsWithSignature(buffer, PNG_SIGNATURE);
}

function hasWebpSignature(buffer: Buffer): boolean {
  return startsWithSignature(buffer, RIFF_SIGNATURE) && buffer.length >= 12 && buffer.subarray(8, 12).equals(WEBP_SIGNATURE);
}

function getContentType(filename: string): string {
  return CONTENT_TYPES_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function toPublicUrl(relativePath: string): string {
  const encodedPath = relativePath
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/uploads/${encodedPath}`;
}

function normalizePublicDirectory(relativePath: string): string {
  const directory = path.dirname(relativePath);
  return directory === "." ? "" : directory.split(path.sep).join("/");
}

function getFolderFromDirectory(directory: string): string {
  if (directory.startsWith("resources/")) {
    return directory.slice("resources/".length) || DEFAULT_RESOURCE_FOLDER;
  }
  return directory;
}

function validateResourceFolder(value: unknown): string {
  const rawValue = typeof value === "string" ? value : "";
  const normalizedValue = rawValue.normalize("NFKC").replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
  if (!normalizedValue) {
    return DEFAULT_RESOURCE_FOLDER;
  }

  const segments = normalizedValue.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return DEFAULT_RESOURCE_FOLDER;
  }
  if (segments.length > 5) {
    throw new UploadResourceValidationError("Resource folder is too deep");
  }

  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      /[\u0000-\u001f<>:"|?*]/u.test(segment) ||
      segment.length > 80
    ) {
      throw new UploadResourceValidationError("Invalid resource folder");
    }
  }

  return segments.join("/");
}

function sanitizeOriginalFilename(filename: string, extension: string): string {
  const baseFilename = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const parsed = path.parse(baseFilename.normalize("NFKC"));
  const baseName = parsed.name
    .replace(/[\u0000-\u001f<>:"/\\|?*]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\.+$/u, "");
  const safeBaseName = (baseName || "resource").slice(0, 80);
  return `${crypto.randomUUID()}-${safeBaseName}${extension}`;
}

function validateResourceFile(file: UploadResourceFile): { extension: string } {
  const extension = path.extname(file.filename).toLowerCase();
  const allowedType = ALLOWED_RESOURCE_TYPES_BY_EXTENSION.get(extension);
  if (!allowedType) {
    throw new UploadResourceValidationError("Unsupported resource type");
  }
  if (file.buffer.length > MAX_RESOURCE_BYTES) {
    throw new UploadResourceValidationError("Resource is too large");
  }
  if (file.mimetype !== "application/octet-stream" && !allowedType.mimetypes.includes(file.mimetype)) {
    throw new UploadResourceValidationError("Resource extension does not match MIME type");
  }
  if (allowedType.signature && !allowedType.signature(file.buffer)) {
    throw new UploadResourceValidationError("Resource bytes do not match MIME type");
  }

  return { extension };
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function publicUrlToRelativePath(value: string): string | undefined {
  let pathname = value;
  try {
    pathname = new URL(value, "http://local.invalid").pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0] ?? value;
  }

  if (pathname.startsWith("/uploads/")) {
    pathname = pathname.slice("/uploads/".length);
  }

  if (!pathname || pathname.includes("\0")) {
    return undefined;
  }

  try {
    return decodeURIComponent(pathname).replace(/\\/g, "/");
  } catch {
    return undefined;
  }
}

function classifyResource(relativePath: string): Pick<UploadResourceFileInfo, "kind" | "postUid"> {
  const parts = relativePath.split(path.sep);
  if (parts[0] === "images" && parts[1] === "posts" && parts[2]) {
    return { kind: "post-image", postUid: parts[2] };
  }

  if (parts[0] === "images" && parts[1] === "about") {
    return { kind: "about-image", postUid: null };
  }

  return { kind: "asset", postUid: null };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getAvailableTargetPath(directory: string, filename: string): Promise<string> {
  const parsed = path.parse(filename);
  let candidate = path.join(directory, filename);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(directory, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }

  return candidate;
}

function resolveUploadResourceFilePath(config: AppConfig, value: string): string {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const relativePath = publicUrlToRelativePath(value);
  if (!relativePath) {
    throw new UploadResourcePathError();
  }

  const filePath = path.resolve(uploadsRoot, relativePath);
  if (!isInsideRoot(uploadsRoot, filePath)) {
    throw new UploadResourcePathError();
  }

  return filePath;
}

async function resourceFromFilePath(uploadsRoot: string, filePath: string): Promise<UploadResourceFileInfo> {
  const stat = await fs.stat(filePath);
  const relativePath = path.relative(uploadsRoot, filePath);
  const filename = path.basename(filePath);
  const classified = classifyResource(relativePath);
  const directory = normalizePublicDirectory(relativePath);

  return {
    ...classified,
    url: toPublicUrl(relativePath),
    relativePath: relativePath.split(path.sep).join("/"),
    filename,
    directory,
    folder: getFolderFromDirectory(directory),
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    contentType: getContentType(filename)
  };
}

async function walkFiles(current: string): Promise<string[]> {
  async function readEntries() {
    return fs.readdir(current, { encoding: "utf8", withFileTypes: true });
  }

  let entries: Awaited<ReturnType<typeof readEntries>>;
  try {
    entries = await readEntries();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
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

function checksumBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function checksumFile(filePath: string): Promise<string> {
  return checksumBuffer(await fs.readFile(filePath));
}

function getOriginalFilename(record: ResourceRecord | undefined, fileInfo: UploadResourceFileInfo, fallback?: string): string {
  return record?.originalFilename ?? fallback ?? fileInfo.filename;
}

function toRegisteredResource(
  db: BlogDatabase,
  fileInfo: UploadResourceFileInfo,
  record: ResourceRecord
): UploadResource {
  return {
    ...fileInfo,
    id: record.id,
    originalFilename: record.originalFilename,
    sizeBytes: record.sizeBytes,
    contentType: record.mimeType,
    mimeType: record.mimeType,
    source: record.source,
    checksumSha256: record.checksumSha256,
    referenceCount: countResourceReferences(db, record.url),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function registerFilesystemResource(
  db: BlogDatabase,
  uploadsRoot: string,
  filePath: string,
  input: Partial<Pick<RegisterStoredUploadResourceInput, "originalFilename" | "mimeType" | "kind" | "source" | "buffer">> = {}
): Promise<{ fileInfo: UploadResourceFileInfo; record: ResourceRecord }> {
  const fileInfo = await resourceFromFilePath(uploadsRoot, filePath);
  const existing = getResourceByUrl(db, fileInfo.url);
  const checksumSha256 = input.buffer ? checksumBuffer(input.buffer) : await checksumFile(filePath);
  const record = upsertResource(db, {
    url: fileInfo.url,
    storagePath: fileInfo.relativePath,
    originalFilename: getOriginalFilename(existing, fileInfo, input.originalFilename),
    mimeType: input.mimeType ?? existing?.mimeType ?? fileInfo.contentType,
    sizeBytes: fileInfo.sizeBytes,
    kind: input.kind ?? existing?.kind ?? fileInfo.kind,
    folder: fileInfo.folder,
    source: input.source ?? existing?.source ?? "legacy",
    checksumSha256
  });

  return { fileInfo, record };
}

async function reconcileUploadResources(config: AppConfig, db: BlogDatabase): Promise<UploadResource[]> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const files = await walkFiles(uploadsRoot);
  const resources = await Promise.all(
    files.map(async (filePath) => {
      const { fileInfo, record } = await registerFilesystemResource(db, uploadsRoot, filePath);
      return toRegisteredResource(db, fileInfo, record);
    })
  );

  deleteResourceRecordsNotIn(db, resources.map((resource) => resource.url));

  return resources.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || second.id - first.id);
}

export async function listUploadResources(config: AppConfig, db: BlogDatabase): Promise<UploadResource[]> {
  return reconcileUploadResources(config, db);
}

export async function registerStoredUploadResource(
  config: AppConfig,
  db: BlogDatabase,
  input: RegisterStoredUploadResourceInput
): Promise<UploadResource> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const filePath = resolveUploadResourceFilePath(config, input.url);

  try {
    const registerInput: Partial<
      Pick<RegisterStoredUploadResourceInput, "originalFilename" | "mimeType" | "kind" | "source" | "buffer">
    > = {
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      kind: input.kind,
      source: input.source ?? "upload"
    };
    if (input.buffer) {
      registerInput.buffer = input.buffer;
    }

    const { fileInfo, record } = await registerFilesystemResource(db, uploadsRoot, filePath, {
      ...registerInput
    });
    return toRegisteredResource(db, fileInfo, record);
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    await removeEmptyDirectories(path.dirname(filePath), uploadsRoot).catch(() => undefined);
    throw error;
  }
}

export async function storeUploadResource(
  config: AppConfig,
  db: BlogDatabase,
  file: UploadResourceFile,
  folderInput: unknown
): Promise<UploadResource> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const folder = validateResourceFolder(folderInput);
  const { extension } = validateResourceFile(file);
  const directory = path.join(uploadsRoot, "resources", ...folder.split("/"));
  await fs.mkdir(directory, { recursive: true });

  const filename = sanitizeOriginalFilename(file.filename, extension);
  const filePath = path.join(directory, filename);
  const tempPath = path.join(directory, `.${filename}.${crypto.randomUUID()}.tmp`);

  try {
    await fs.writeFile(tempPath, file.buffer, { flag: "wx" });
    await fs.rename(tempPath, filePath);
    const { fileInfo, record } = await registerFilesystemResource(db, uploadsRoot, filePath, {
      originalFilename: file.filename,
      mimeType: getContentType(filename),
      kind: "asset",
      source: "upload",
      buffer: file.buffer
    });
    return toRegisteredResource(db, fileInfo, record);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    await removeEmptyDirectories(directory, uploadsRoot).catch(() => undefined);
    throw error;
  }
}

export async function moveUploadResource(
  config: AppConfig,
  db: BlogDatabase,
  value: string,
  folderInput: unknown
): Promise<UploadResource> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const sourcePath = resolveUploadResourceFilePath(config, value);
  const stat = await fs.stat(sourcePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!stat) {
    throw new UploadResourcePathError("Resource not found");
  }
  if (!stat.isFile()) {
    throw new UploadResourcePathError("Upload resource path is not a file");
  }

  const sourceRegistration = await registerFilesystemResource(db, uploadsRoot, sourcePath);
  const folder = validateResourceFolder(folderInput);
  const targetDirectory = path.join(uploadsRoot, "resources", ...folder.split("/"));
  await fs.mkdir(targetDirectory, { recursive: true });

  const originalTargetPath = path.join(targetDirectory, path.basename(sourcePath));
  const targetPath = path.resolve(originalTargetPath) === path.resolve(sourcePath)
    ? originalTargetPath
    : await getAvailableTargetPath(targetDirectory, path.basename(sourcePath));

  if (path.resolve(targetPath) !== path.resolve(sourcePath)) {
    await fs.rename(sourcePath, targetPath);
    try {
      const fileInfo = await resourceFromFilePath(uploadsRoot, targetPath);
      const record = updateResourceLocation(db, sourceRegistration.record.id, {
        url: fileInfo.url,
        storagePath: fileInfo.relativePath,
        folder: fileInfo.folder,
        sizeBytes: fileInfo.sizeBytes,
        mimeType: sourceRegistration.record.mimeType,
        checksumSha256: sourceRegistration.record.checksumSha256
      });
      await removeEmptyDirectories(path.dirname(sourcePath), uploadsRoot);
      return toRegisteredResource(db, fileInfo, record);
    } catch (error) {
      await fs.rename(targetPath, sourcePath).catch(() => undefined);
      await removeEmptyDirectories(targetDirectory, uploadsRoot).catch(() => undefined);
      throw error;
    }
  }

  return toRegisteredResource(db, sourceRegistration.fileInfo, sourceRegistration.record);
}

export async function deleteUploadResource(config: AppConfig, db: BlogDatabase, value: string): Promise<boolean> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const filePath = resolveUploadResourceFilePath(config, value);

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }

  if (!stat.isFile()) {
    throw new UploadResourcePathError("Upload resource path is not a file");
  }

  const { record } = await registerFilesystemResource(db, uploadsRoot, filePath);
  if (countResourceReferences(db, record.url) > 0) {
    throw new UploadResourceReferencedError();
  }

  const trashPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${crypto.randomUUID()}.delete`);
  await fs.rename(filePath, trashPath);
  try {
    deleteResourceRecord(db, record.id);
    await fs.rm(trashPath, { force: true });
  } catch (error) {
    await fs.rename(trashPath, filePath).catch(() => undefined);
    throw error;
  }
  await removeEmptyDirectories(path.dirname(filePath), uploadsRoot);
  return true;
}
