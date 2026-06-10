import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const DEFAULT_DATABASE_PATH = "./data/blog.sqlite";
const DEFAULT_SESSION_SECRET = "development-session-secret-change-me";
const DEFAULT_ADMIN_PASSWORD = "change-me-before-deploy";

function parseOriginList(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_PATH: z.string().default(DEFAULT_DATABASE_PATH),
  SESSION_SECRET: z.string().min(32).default(DEFAULT_SESSION_SECRET),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().min(12).default(DEFAULT_ADMIN_PASSWORD),
  CORS_ALLOWED_ORIGINS: z.preprocess(parseOriginList, z.array(z.string().url()).default([])),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com")
});

export type AppConfig = z.infer<typeof ConfigSchema>;

interface LoadConfigOptions {
  cwd?: string;
}

function findEnvFile(startDirectory: string): string | undefined {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const envPath = path.join(currentDirectory, ".env");
    if (fs.existsSync(envPath)) {
      return envPath;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return undefined;
    }
    currentDirectory = parentDirectory;
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadEnvFile(cwd: string): Record<string, string> {
  const envPath = findEnvFile(cwd);
  if (!envPath) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envPath, "utf8"));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, options: LoadConfigOptions = {}): AppConfig {
  const fileEnv = loadEnvFile(options.cwd ?? process.cwd());
  const config = ConfigSchema.parse({ ...fileEnv, ...env });

  if (config.NODE_ENV === "production") {
    if (!env.SESSION_SECRET || config.SESSION_SECRET === DEFAULT_SESSION_SECRET) {
      throw new Error("SESSION_SECRET must be set to a non-default value in production.");
    }

    if (!env.ADMIN_PASSWORD || config.ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD must be set to a non-default value in production.");
    }

    if (config.CORS_ALLOWED_ORIGINS.length === 0) {
      throw new Error("CORS_ALLOWED_ORIGINS must list trusted origins in production.");
    }
  }

  return config;
}
