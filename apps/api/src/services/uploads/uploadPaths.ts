import path from "node:path";
import fs from "node:fs/promises";
import type { AppConfig } from "../../config.js";

const PUBLIC_UPLOAD_PREFIX = "/uploads";

export function getUploadsRoot(config: AppConfig): string {
  return path.resolve(path.dirname(config.DATABASE_PATH), "uploads");
}

export function getPostImageDirectory(config: AppConfig, postUid: string): string {
  return path.join(getUploadsRoot(config), "images", "posts", postUid);
}

export function getPostImagePublicUrl(postUid: string, filename: string): string {
  return `${PUBLIC_UPLOAD_PREFIX}/images/posts/${postUid}/${filename}`;
}

export function isValidPostUid(value: string): boolean {
  return /^p_[0-9a-f-]{36}$/.test(value);
}

export async function removePostImageDirectory(config: AppConfig, postUid: string): Promise<void> {
  await fs.rm(getPostImageDirectory(config, postUid), { recursive: true, force: true });
}
