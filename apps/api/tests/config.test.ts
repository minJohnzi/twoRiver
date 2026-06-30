import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-config-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  test("loads DeepSeek settings from a .env file found above the API working directory", () => {
    const rootDirectory = makeTempDirectory();
    const apiDirectory = path.join(rootDirectory, "apps", "api");
    fs.mkdirSync(apiDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(rootDirectory, ".env"),
      [
        "NODE_ENV=development",
        "PORT=4000",
        "DATABASE_PATH=./apps/api/data/blog.sqlite",
        "SESSION_SECRET=replace-with-at-least-32-random-characters",
        "ADMIN_USERNAME=admin",
        "ADMIN_PASSWORD=change-me-before-deploy",
        "DEEPSEEK_API_KEY=sk-from-env-file",
        "DEEPSEEK_BASE_URL=https://api.deepseek.com"
      ].join("\n")
    );

    const config = loadConfig({}, { cwd: apiDirectory });

    expect(config.DEEPSEEK_API_KEY).toBe("sk-from-env-file");
  });

  test("keeps process environment values above .env file values", () => {
    const directory = makeTempDirectory();
    fs.writeFileSync(path.join(directory, ".env"), "DEEPSEEK_API_KEY=sk-from-env-file\n");

    const config = loadConfig(
      {
        DEEPSEEK_API_KEY: "sk-from-process",
        SESSION_SECRET: "replace-with-at-least-32-random-characters",
        ADMIN_PASSWORD: "change-me-before-deploy"
      },
      { cwd: directory }
    );

    expect(config.DEEPSEEK_API_KEY).toBe("sk-from-process");
  });

  test("parses the TipTap publish gate only for the literal true value", () => {
    expect(loadConfig({ TIPTAP_PUBLISH_ENABLED: "true" }).TIPTAP_PUBLISH_ENABLED).toBe(true);
    expect(loadConfig({ TIPTAP_PUBLISH_ENABLED: "false" }).TIPTAP_PUBLISH_ENABLED).toBe(false);
    expect(loadConfig({ TIPTAP_PUBLISH_ENABLED: "1" }).TIPTAP_PUBLISH_ENABLED).toBe(false);
  });

  test("requires a dedicated analytics hash secret in production", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        SESSION_SECRET: "replace-with-at-least-32-random-characters",
        ADMIN_PASSWORD: "replace-with-at-least-12",
        CORS_ALLOWED_ORIGINS: "https://example.com"
      })
    ).toThrow("ANALYTICS_HASH_SECRET must be set in production.");

    const config = loadConfig({
      NODE_ENV: "production",
      SESSION_SECRET: "replace-with-at-least-32-random-characters",
      ADMIN_PASSWORD: "replace-with-at-least-12",
      CORS_ALLOWED_ORIGINS: "https://example.com",
      ANALYTICS_HASH_SECRET: "analytics-secret-at-least-32-characters"
    });
    expect(config.ANALYTICS_HASH_SECRET).toBe("analytics-secret-at-least-32-characters");
  });
});
