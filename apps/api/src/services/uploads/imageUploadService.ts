import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { AppConfig } from "../../config.js";
import { getPostImageDirectory, getPostImagePublicUrl, isValidPostUid } from "./uploadPaths.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"]
]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87A_SIGNATURE = Buffer.from("GIF87a");
const GIF89A_SIGNATURE = Buffer.from("GIF89a");
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");

export class ImageUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadValidationError";
  }
}

export interface StoredImage {
  url: string;
  markdown: string;
}

export type PostImageUploadFile = Pick<MultipartFile, "filename" | "mimetype" | "toBuffer">;

function startsWithSignature(buffer: Buffer, signature: Buffer): boolean {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function hasValidImageSignature(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === "image/jpeg") {
    return startsWithSignature(buffer, JPEG_SIGNATURE);
  }
  if (mimetype === "image/png") {
    return startsWithSignature(buffer, PNG_SIGNATURE);
  }
  if (mimetype === "image/gif") {
    return startsWithSignature(buffer, GIF87A_SIGNATURE) || startsWithSignature(buffer, GIF89A_SIGNATURE);
  }
  if (mimetype === "image/webp") {
    return startsWithSignature(buffer, RIFF_SIGNATURE) && buffer.subarray(8, 12).equals(WEBP_SIGNATURE);
  }

  return false;
}

export async function storePostImage(config: AppConfig, postUid: string, file: PostImageUploadFile): Promise<StoredImage> {
  if (!isValidPostUid(postUid)) {
    throw new ImageUploadValidationError("Invalid post UID");
  }

  const extension = ALLOWED_TYPES.get(file.mimetype);
  if (!extension) {
    throw new ImageUploadValidationError("Unsupported image type");
  }

  const originalExtension = path.extname(file.filename).slice(1).toLowerCase();
  const normalizedOriginalExtension = originalExtension === "jpeg" ? "jpg" : originalExtension;
  if (normalizedOriginalExtension !== extension) {
    throw new ImageUploadValidationError("Image extension does not match MIME type");
  }

  const buffer = await file.toBuffer();
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ImageUploadValidationError("Image is too large");
  }
  if (!hasValidImageSignature(buffer, file.mimetype)) {
    throw new ImageUploadValidationError("Image bytes do not match MIME type");
  }

  const directory = getPostImageDirectory(config, postUid);
  await fs.mkdir(directory, { recursive: true });

  const filename = `${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(directory, filename), buffer, { flag: "wx" });

  const url = getPostImagePublicUrl(postUid, filename);
  return {
    url,
    markdown: `![图片](${url})`
  };
}
