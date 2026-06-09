import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import type { BlogDatabase } from "./db/connection.js";
import authPlugin from "./plugins/auth.js";
import { adminAboutRoutes, publicAboutRoutes } from "./routes/aboutRoutes.js";
import { adminCategoryRoutes } from "./routes/adminCategoryRoutes.js";
import { adminPostRoutes } from "./routes/adminPostRoutes.js";
import { adminTagRoutes } from "./routes/adminTagRoutes.js";
import { adminTranslationRoutes } from "./routes/adminTranslationRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { publicRoutes } from "./routes/publicRoutes.js";

declare module "fastify" {
  interface FastifyInstance {
    db: BlogDatabase;
  }
}

export interface BuildAppOptions {
  config: AppConfig;
  db: BlogDatabase;
}

export function buildApp({ config, db }: BuildAppOptions) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  app.decorate("db", db);

  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const isLocalOrigin =
      config.NODE_ENV !== "production" &&
      (origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:"));
    const isTrustedOrigin = Boolean(origin && config.CORS_ALLOWED_ORIGINS.includes(origin));

    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; img-src 'self' data: https:; style-src 'self'; connect-src 'self'"
    );
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
    if (config.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    if (origin && (isLocalOrigin || isTrustedOrigin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Unhandled API error");
    reply.code(500).send({ message: "Internal server error" });
  });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });

  app.register(authPlugin);
  app.register(authRoutes, { config });
  app.register(publicRoutes);
  app.register(publicAboutRoutes);
  app.register(adminAboutRoutes);
  app.register(adminCategoryRoutes);
  app.register(adminPostRoutes);
  app.register(adminTagRoutes);
  app.register(adminTranslationRoutes, { config });

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
