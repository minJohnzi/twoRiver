import { ChangePasswordInputSchema, UpdateAdminProfileInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { createAuditEvent } from "../repositories/auditRepository.js";
import {
  getAdminUserById,
  toPublicAdminUser,
  updateAdminPasswordHash,
  updateAdminProfile,
  UsernameConflictError
} from "../repositories/systemRepository.js";
import { hashPassword, verifyPassword } from "../services/passwordService.js";
import { deleteOtherSessions } from "../services/sessionService.js";

export async function adminAccountRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.put("/api/admin/account/profile", async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    const parsed = UpdateAdminProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid profile input" });
      return;
    }

    try {
      const user = updateAdminProfile(app.db, request.user.id, parsed.data);
      if (!user) {
        reply.code(404).send({ message: "User not found" });
        return;
      }

      createAuditEvent(app.db, {
        userId: request.user.id,
        action: "admin.profile.update",
        targetType: "user",
        targetId: String(request.user.id),
        outcome: "success"
      });
      return { user };
    } catch (error) {
      if (error instanceof UsernameConflictError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/account/password", async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    const parsed = ChangePasswordInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid password input" });
      return;
    }

    const user = getAdminUserById(app.db, request.user.id);
    if (!user) {
      reply.code(404).send({ message: "User not found" });
      return;
    }

    if (!(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
      createAuditEvent(app.db, {
        userId: request.user.id,
        action: "admin.password.change",
        targetType: "user",
        targetId: String(request.user.id),
        outcome: "failure",
        metadata: { reason: "mismatch" }
      });
      reply.code(400).send({ message: "Current password is incorrect" });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    updateAdminPasswordHash(app.db, request.user.id, passwordHash);
    const currentSessionId = request.cookies.tworiver_session ?? "";
    const revokedSessions = currentSessionId ? deleteOtherSessions(app.db, request.user.id, currentSessionId) : 0;
    createAuditEvent(app.db, {
      userId: request.user.id,
      action: "admin.password.change",
      targetType: "user",
      targetId: String(request.user.id),
      outcome: "success",
      metadata: { revoked: revokedSessions }
    });

    return { ok: true, revokedSessions };
  });

  app.get("/api/admin/account/profile", async (request, reply) => {
    if (!request.user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }
    const user = getAdminUserById(app.db, request.user.id);
    if (!user) {
      reply.code(404).send({ message: "User not found" });
      return;
    }
    return { user: toPublicAdminUser(user) };
  });
}
