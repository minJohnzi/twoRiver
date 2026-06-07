import { z } from "zod";

const DEFAULT_DATABASE_PATH = "./data/blog.sqlite";
const DEFAULT_SESSION_SECRET = "development-session-secret-change-me";
const DEFAULT_ADMIN_PASSWORD = "change-me-before-deploy";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default(DEFAULT_DATABASE_PATH),
  SESSION_SECRET: z.string().min(32).default(DEFAULT_SESSION_SECRET),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default(DEFAULT_ADMIN_PASSWORD),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com")
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = ConfigSchema.parse(env);

  if (config.NODE_ENV === "production") {
    if (!env.SESSION_SECRET || config.SESSION_SECRET === DEFAULT_SESSION_SECRET) {
      throw new Error("SESSION_SECRET must be set to a non-default value in production.");
    }

    if (!env.ADMIN_PASSWORD || config.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD must be set to a non-default value in production.");
    }
  }

  return config;
}
