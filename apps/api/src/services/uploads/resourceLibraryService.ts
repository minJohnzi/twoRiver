import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../config.js";
import { getUploadsRoot } from "./uploadPaths.js";

export type UploadResourceKind = "post-image" | "about-image" | "asset";

export const DEFAULT_RESOURCE_FOLDER = "general";
export const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;

export interface UploadResource {
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

export interface UploadResourceFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
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

function classifyResource(relativePath: string): Pick<UploadResource, "kind" | "postUid"> {
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

async function resourceFromFilePath(uploadsRoot: string, filePath: string): Promise<UploadResource> {
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

export async function listUploadResources(config: AppConfig): Promise<UploadResource[]> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const files = await walkFiles(uploadsRoot);
  const resources = await Promise.all(files.map((filePath) => resourceFromFilePath(uploadsRoot, filePath)));

  return resources.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

export async function storeUploadResource(config: AppConfig, file: UploadResourceFile, folderInput: unknown): Promise<UploadResource> {
  const uploadsRoot = path.resolve(getUploadsRoot(config));
  const folder = validateResourceFolder(folderInput);
  const { extension } = validateResourceFile(file);
  const directory = path.join(uploadsRoot, "resources", ...folder.split("/"));
  await fs.mkdir(directory, { recursive: true });

  const filename = sanitizeOriginalFilename(file.filename, extension);
  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, file.buffer, { flag: "wx" });

  return resourceFromFilePath(uploadsRoot, filePath);
}

export async function moveUploadResource(config: AppConfig, value: string, folderInput: unknown): Promise<UploadResource> {
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

  const folder = validateResourceFolder(folderInput);
  const targetDirectory = path.join(uploadsRoot, "resources", ...folder.split("/"));
  await fs.mkdir(targetDirectory, { recursive: true });

  const originalTargetPath = path.join(targetDirectory, path.basename(sourcePath));
  const targetPath = path.resolve(originalTargetPath) === path.resolve(sourcePath)
    ? originalTargetPath
    : await getAvailableTargetPath(targetDirectory, path.basename(sourcePath));

  if (path.resolve(targetPath) !== path.resolve(sourcePath)) {
    await fs.rename(sourcePath, targetPath);
    await removeEmptyDirectories(path.dirname(sourcePath), uploadsRoot);
  }

  return resourceFromFilePath(uploadsRoot, targetPath);
}

export async function deleteUploadResource(config: AppConfig, value: string): Promise<boolean> {
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

  await fs.rm(filePath, { force: true });
  await removeEmptyDirectories(path.dirname(filePath), uploadsRoot);
  return true;
}
