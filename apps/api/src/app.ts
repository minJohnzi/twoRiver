import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import type { BlogDatabase } from "./db/connection.js";

export interface BuildAppOptions {
  config: AppConfig;
  db: BlogDatabase;
}

export function buildApp({ config }: BuildAppOptions) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  app.register(cookie, {
    secret: config.SESSION_SECRET
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "tworiver-blog-api"
  }));

  return app;
}
