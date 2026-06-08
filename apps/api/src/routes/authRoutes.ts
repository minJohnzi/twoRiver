import { LoginInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createSession, deleteSession } from "../services/sessionService.js";
import { verifyPassword } from "../services/passwordService.js";

interface AuthRoutesOptions {
  config: AppConfig;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

export async function authRoutes(app: FastifyInstance, { config }: AuthRoutesOptions) {
  app.post("/api/auth/login", async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid login input" });
      return;
    }

    const user = app.db
      .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
      .get(parsed.data.username) as UserRow | undefined;

    if (!user || !(await verifyPassword(user.password_hash, parsed.data.password))) {
      reply.code(401).send({ message: "Invalid username or password" });
      return;
    }

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
      user: {
        id: user.id,
        username: user.username
      }
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
          username: request.user.username
        }
      };
    }
  );
}
