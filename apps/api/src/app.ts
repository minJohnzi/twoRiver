import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import fs from "node:fs";
import type { AppConfig } from "./config.js";
import type { BlogDatabase } from "./db/connection.js";
import authPlugin from "./plugins/auth.js";
import { adminAboutRoutes, publicAboutRoutes } from "./routes/aboutRoutes.js";
import { adminAccountRoutes } from "./routes/adminAccountRoutes.js";
import { adminCategoryRoutes } from "./routes/adminCategoryRoutes.js";
import { adminNavigationRoutes } from "./routes/adminNavigationRoutes.js";
import { adminPageRoutes } from "./routes/adminPageRoutes.js";
import { adminPostRoutes } from "./routes/adminPostRoutes.js";
import { adminProjectRoutes } from "./routes/adminProjectRoutes.js";
import { adminResourceRoutes } from "./routes/adminResourceRoutes.js";
import { adminSiteSettingsRoutes } from "./routes/adminSiteSettingsRoutes.js";
import { adminSystemRoutes } from "./routes/adminSystemRoutes.js";
import { adminTagRoutes } from "./routes/adminTagRoutes.js";
import { adminUploadRoutes } from "./routes/adminUploadRoutes.js";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { publicContentRoutes } from "./routes/publicContentRoutes.js";
import { publicRoutes } from "./routes/publicRoutes.js";
import { deleteExpiredSessions } from "./services/sessionService.js";
import { MAX_IMAGE_BYTES } from "./services/uploads/imageUploadService.js";
import { getUploadsRoot } from "./services/uploads/uploadPaths.js";

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
  let sessionCleanupTimer: NodeJS.Timeout | undefined;
  app.decorate("db", db);
  fs.mkdirSync(getUploadsRoot(config), { recursive: true });

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
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }

    if (request.method === "OPTIONS") {
      reply.code(204).send();
    }
  });

  app.addHook("onReady", async () => {
    deleteExpiredSessions(app.db);
    sessionCleanupTimer = setInterval(
      () => {
        try {
          deleteExpiredSessions(app.db);
        } catch (error) {
          app.log.error({ error }, "Failed to clean expired sessions");
        }
      },
      6 * 60 * 60 * 1000
    );
    sessionCleanupTimer.unref();
  });

  app.addHook("onClose", async () => {
    if (sessionCleanupTimer) {
      clearInterval(sessionCleanupTimer);
    }
    app.db.close();
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Unhandled API error");
    reply.code(500).send({ message: "Internal server error" });
  });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });
  app.register(multipart, {
    limits: {
      fileSize: MAX_IMAGE_BYTES,
      files: 1
    }
  });
  app.register(fastifyStatic, {
    root: getUploadsRoot(config),
    prefix: "/uploads/",
    decorateReply: false
  });

  app.register(authPlugin);
  app.register(authRoutes, { config });
  app.register(analyticsRoutes, { config });
  app.register(publicRoutes);
  app.register(publicContentRoutes);
  app.register(publicAboutRoutes);
  app.register(adminAccountRoutes);
  app.register(adminAboutRoutes);
  app.register(adminCategoryRoutes);
  app.register(adminNavigationRoutes);
  app.register(adminPageRoutes);
  app.register(adminPostRoutes, { config });
  app.register(adminProjectRoutes);
  app.register(adminResourceRoutes, { config });
  app.register(adminSiteSettingsRoutes);
  app.register(adminSystemRoutes, { config, rootApp: app });
  app.register(adminUploadRoutes, { config });
  app.register(adminTagRoutes);

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
