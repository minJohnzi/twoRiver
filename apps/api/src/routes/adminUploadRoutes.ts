import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { finished } from "node:stream/promises";
import type { AppConfig } from "../config.js";
import { getPostIdByUid } from "../repositories/postsRepository.js";
import {
  ImageUploadValidationError,
  type PostImageUploadFile,
  storeAboutAvatar,
  storePostImage
} from "../services/uploads/imageUploadService.js";
import { registerStoredUploadResource } from "../services/uploads/resourceLibraryService.js";

interface AdminUploadRouteOptions {
  config: AppConfig;
}

function isPayloadTooLarge(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "statusCode" in error) &&
    ((error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE" ||
      (error as { statusCode?: unknown }).statusCode === 413)
  );
}

async function discardFile(file: MultipartFile | undefined): Promise<void> {
  if (!file) {
    return;
  }

  file.file.resume();
  await finished(file.file).catch(() => undefined);
}

async function captureFile(file: MultipartFile): Promise<PostImageUploadFile> {
  const buffer = await file.toBuffer();
  return {
    filename: file.filename,
    mimetype: file.mimetype,
    toBuffer: async () => buffer
  };
}

export async function adminUploadRoutes(app: FastifyInstance, { config }: AdminUploadRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.post("/api/admin/uploads/about-avatar", async (request, reply) => {
    try {
      const parts = request.parts();
      let imageFile: PostImageUploadFile | undefined;

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          if (imageFile) {
            await discardFile(part);
            continue;
          }
          imageFile = await captureFile(part);
        } else if (part.type === "file") {
          await discardFile(part);
        }
      }

      if (!imageFile) {
        reply.code(400).send({ message: "Missing avatar upload input" });
        return;
      }

      const image = await storeAboutAvatar(config, imageFile);
      await registerStoredUploadResource(config, app.db, {
        url: image.url,
        originalFilename: imageFile.filename,
        mimeType: imageFile.mimetype,
        buffer: await imageFile.toBuffer(),
        kind: "about-image"
      });
      reply.code(201);
      return image;
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      if (isPayloadTooLarge(error)) {
        reply.code(400).send({ message: "Image is too large" });
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/uploads/images", async (request, reply) => {
    try {
      const parts = request.parts();
      let postUid = "";
      let imageFile: PostImageUploadFile | undefined;

      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "postUid") {
          postUid = String(part.value ?? "");
        }
        if (part.type === "file" && part.fieldname === "file") {
          if (imageFile) {
            await discardFile(part);
            continue;
          }
          imageFile = await captureFile(part);
        } else if (part.type === "file") {
          await discardFile(part);
        }
      }

      if (!postUid || !imageFile) {
        reply.code(400).send({ message: "Missing image upload input" });
        return;
      }

      if (!getPostIdByUid(app.db, postUid)) {
        reply.code(404).send({ message: "Post not found" });
        return;
      }

      const image = await storePostImage(config, postUid, imageFile);
      await registerStoredUploadResource(config, app.db, {
        url: image.url,
        originalFilename: imageFile.filename,
        mimeType: imageFile.mimetype,
        buffer: await imageFile.toBuffer(),
        kind: "post-image"
      });
      reply.code(201);
      return image;
    } catch (error) {
      if (error instanceof ImageUploadValidationError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      if (isPayloadTooLarge(error)) {
        reply.code(400).send({ message: "Image is too large" });
        return;
      }
      throw error;
    }
  });
}
