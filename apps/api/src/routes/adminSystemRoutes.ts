import type { MultipartFile } from "@fastify/multipart";
import { MaintenanceActionInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { finished } from "node:stream/promises";
import type { AppConfig } from "../config.js";
import { getAdminUserById } from "../repositories/systemRepository.js";
import { createBackupArchive } from "../services/backupService.js";
import { getSystemHealth, createBackupRecord, restoreBackupArchive, runMaintenanceAction } from "../services/maintenanceService.js";
import { verifyPassword } from "../services/passwordService.js";

interface AdminSystemRouteOptions {
  config: AppConfig;
  rootApp?: FastifyInstance;
}

async function discardFile(file: MultipartFile | undefined): Promise<void> {
  if (!file) {
    return;
  }
  file.file.resume();
  await finished(file.file).catch(() => undefined);
}

export async function adminSystemRoutes(app: FastifyInstance, { config, rootApp }: AdminSystemRouteOptions) {
  const stateApp = rootApp ?? app;
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/system/health", async () => getSystemHealth(config, stateApp));

  app.get("/api/admin/system/backup", async (_request, reply) => {
    const backup = await createBackupArchive(config, stateApp.db);
    createBackupRecord(stateApp, {
      kind: "download",
      filename: backup.filename,
      status: "completed",
      sizeBytes: backup.buffer.length,
      checksumSha256: backup.checksum
    });
    reply.header("Content-Disposition", `attachment; filename="${backup.filename}"`);
    reply.type("application/gzip");
    return backup.buffer;
  });

  app.post("/api/admin/system/restore", async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    const parts = request.parts();
    let currentPassword = "";
    let archive: Buffer | undefined;
    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "currentPassword") {
        currentPassword = String(part.value ?? "");
      } else if (part.type === "file" && part.fieldname === "file") {
        if (archive) {
          await discardFile(part);
          continue;
        }
        archive = await part.toBuffer();
      } else if (part.type === "file") {
        await discardFile(part);
      }
    }

    const user = getAdminUserById(stateApp.db, request.user.id);
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      reply.code(400).send({ message: "Current password is incorrect" });
      return;
    }
    if (!archive) {
      reply.code(400).send({ message: "Missing backup archive" });
      return;
    }

    try {
      return { ok: true, ...(await restoreBackupArchive(stateApp, config, archive)) };
    } catch (error) {
      request.log.error({ error }, "Failed to restore backup");
      reply.code(400).send({ message: "Invalid backup archive" });
    }
  });

  app.post("/api/admin/system/maintenance", async (request, reply) => {
    const parsed = MaintenanceActionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid maintenance action" });
      return;
    }

    return {
      action: parsed.data.action,
      count: await runMaintenanceAction(stateApp, parsed.data.action)
    };
  });
}
