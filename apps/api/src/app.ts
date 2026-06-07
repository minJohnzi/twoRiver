import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import type { BlogDatabase } from "./db/connection.js";
import authPlugin from "./plugins/auth.js";
import { adminPostRoutes } from "./routes/adminPostRoutes.js";
import { adminTagRoutes } from "./routes/adminTagRoutes.js";
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

  app.addHook("onClose", async () => {
    db.close();
  });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });

  app.register(authPlugin);
  app.register(authRoutes, { config });
  app.register(publicRoutes);
  app.register(adminPostRoutes);
  app.register(adminTagRoutes);

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
