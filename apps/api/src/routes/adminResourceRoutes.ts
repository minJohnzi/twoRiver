import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { finished } from "node:stream/promises";
import type { AppConfig } from "../config.js";
import {
  deleteUploadResource,
  listUploadResources,
  moveUploadResource,
  storeUploadResource,
  type UploadResourceFile,
  UploadResourcePathError,
  UploadResourceValidationError
} from "../services/uploads/resourceLibraryService.js";

interface AdminResourceRouteOptions {
  config: AppConfig;
}

interface DeleteResourceBody {
  url?: unknown;
}

interface MoveResourceBody {
  url?: unknown;
  folder?: unknown;
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

async function captureFile(file: MultipartFile): Promise<UploadResourceFile> {
  return {
    filename: file.filename,
    mimetype: file.mimetype,
    buffer: await file.toBuffer()
  };
}

export async function adminResourceRoutes(app: FastifyInstance, { config }: AdminResourceRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/resources", async () => {
    const resources = await listUploadResources(config);
    return { resources };
  });

  app.post("/api/admin/resources", async (request, reply) => {
    try {
      const parts = request.parts();
      let folder = "";
      let resourceFile: UploadResourceFile | undefined;

      for await (const part of parts) {
        if (part.type === "field" && part.fieldname === "folder") {
          folder = String(part.value ?? "");
        } else if (part.type === "file" && part.fieldname === "file") {
          if (resourceFile) {
            await discardFile(part);
            continue;
          }
          resourceFile = await captureFile(part);
        } else if (part.type === "file") {
          await discardFile(part);
        }
      }

      if (!resourceFile) {
        reply.code(400).send({ message: "Missing resource upload input" });
        return;
      }

      const resource = await storeUploadResource(config, resourceFile, folder);
      reply.code(201);
      return { resource };
    } catch (error) {
      if (error instanceof UploadResourceValidationError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      if (isPayloadTooLarge(error)) {
        reply.code(400).send({ message: "Resource is too large" });
        return;
      }
      throw error;
    }
  });

  app.put<{ Body: MoveResourceBody }>("/api/admin/resources", async (request, reply) => {
    if (typeof request.body?.url !== "string") {
      reply.code(400).send({ message: "Missing resource URL" });
      return;
    }

    try {
      const resource = await moveUploadResource(config, request.body.url, request.body.folder);
      return { resource };
    } catch (error) {
      if (error instanceof UploadResourcePathError) {
        reply.code(error.message === "Resource not found" ? 404 : 400).send({ message: error.message });
        return;
      }
      if (error instanceof UploadResourceValidationError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      throw error;
    }
  });

  app.delete<{ Body: DeleteResourceBody }>("/api/admin/resources", async (request, reply) => {
    if (typeof request.body?.url !== "string") {
      reply.code(400).send({ message: "Missing resource URL" });
      return;
    }

    try {
      const deleted = await deleteUploadResource(config, request.body.url);
      if (!deleted) {
        reply.code(404).send({ message: "Resource not found" });
        return;
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof UploadResourcePathError) {
        reply.code(400).send({ message: error.message });
        return;
      }
      throw error;
    }
  });
}
