import { LoginInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createSession, deleteSession } from "../services/sessionService.js";
import { verifyPassword } from "../services/passwordService.js";
import { FixedWindowRateLimiter } from "../services/rateLimiter.js";
import { getAdminUserByUsername, toPublicAdminUser } from "../repositories/systemRepository.js";

interface AuthRoutesOptions {
  config: AppConfig;
}

const loginRateLimiter = new FixedWindowRateLimiter({
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000
});

export async function authRoutes(app: FastifyInstance, { config }: AuthRoutesOptions) {
  app.addHook("onClose", async () => {
    loginRateLimiter.clear();
  });

  app.post("/api/auth/login", async (request, reply) => {
    loginRateLimiter.prune();
    const limit = loginRateLimiter.check(request.ip);
    if (!limit.allowed) {
      reply.header("Retry-After", String(limit.retryAfterSeconds));
      reply.code(429).send({ message: "Too many login attempts. Try again later." });
      return;
    }

    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid login input" });
      return;
    }

    const user = getAdminUserByUsername(app.db, parsed.data.username);

    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      reply.code(401).send({ message: "Invalid username or password" });
      return;
    }

    loginRateLimiter.reset(request.ip);
    const session = createSession(app.db, user.id);

    reply.setCookie("tworiver_session", session.id, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      expires: new Date(session.expiresAt)
    });
    reply.setCookie("tworiver_csrf", session.csrfToken, {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      expires: new Date(session.expiresAt)
    });

    return {
      user: toPublicAdminUser(user)
    };
  });

  app.post("/api/auth/logout", { preHandler: [app.requireAuth, app.requireCsrf] }, async (request, reply) => {
    const sessionId = request.cookies.tworiver_session;
    if (sessionId) {
      deleteSession(app.db, sessionId);
    }

    reply.clearCookie("tworiver_session", {
      path: "/"
    });
    reply.clearCookie("tworiver_csrf", {
      path: "/"
    });

    return {
      ok: true
    };
  });

  app.get(
    "/api/auth/me",
    {
      preHandler: app.requireAuth
    },
    async (request, reply) => {
      if (!request.user) {
        reply.code(401).send({ message: "Authentication required" });
        return;
      }

      return {
        user: {
          id: request.user.id,
          username: request.user.username,
          displayName: request.user.displayName,
          email: request.user.email,
          avatarUrl: request.user.avatarUrl
        }
      };
    }
  );
}
