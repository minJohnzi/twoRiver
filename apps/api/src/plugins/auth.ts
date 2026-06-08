import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { getSessionUser, type SessionUser } from "../services/sessionService.js";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireCsrf(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }

  interface FastifyRequest {
    user: SessionUser | null;
  }
}

async function authPlugin(app: import("fastify").FastifyInstance) {
  app.decorateRequest("user", null);

  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = request.cookies.tworiver_session;

    if (!sessionId) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    const user = getSessionUser(app.db, sessionId);
    if (!user) {
      reply.code(401).send({ message: "Authentication required" });
      return;
    }

    request.user = user;
  });

  app.decorate("requireCsrf", async (request: FastifyRequest, reply: FastifyReply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return;
    }

    const headerToken = request.headers["x-csrf-token"];
    const csrfToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    if (!request.user?.csrfToken || csrfToken !== request.user.csrfToken) {
      reply.code(403).send({ message: "Invalid CSRF token" });
      return;
    }
  });
}

export default fp(authPlugin, {
  name: "auth"
});
