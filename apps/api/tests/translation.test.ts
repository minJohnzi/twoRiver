import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { TranslationDraftResponse } from "@tworiver/shared";
import type { AppConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";
import {
  translatePostDraft,
  TranslationProviderNotConfiguredError,
  TranslationProviderRequestError
} from "../src/services/ai/postTranslationService.js";

vi.mock("../src/services/ai/postTranslationService.js", async (importActual) => {
  const actual = await importActual<typeof import("../src/services/ai/postTranslationService.js")>();
  return {
    ...actual,
    translatePostDraft: vi.fn()
  };
});

const tempDirectories: string[] = [];
const mockedTranslatePostDraft = vi.mocked(translatePostDraft);

function makeConfig(databasePath: string): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_PATH: databasePath,
    SESSION_SECRET: "test-session-secret-at-least-32-chars",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "secret1234567",
    CORS_ALLOWED_ORIGINS: [],
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_MODEL: "deepseek-chat"
  };
}

function createDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-translation-"));
  tempDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

async function createTestApp(configOverride?: Partial<AppConfig>): Promise<FastifyInstance> {
  const databasePath = createDatabasePath();
  migrate(databasePath);
  const db = openDatabase(databasePath);
  await seedAdmin(db, "admin", "secret1234567");

  return buildApp({ config: { ...makeConfig(databasePath), ...configOverride }, db });
}

function extractCookie(setCookie: string | string[] | undefined, name: string): string {
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie ?? "")];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  const cookieHeader = cookie?.split(";")[0];
  if (!cookieHeader) {
    throw new Error(`Expected ${name} cookie to be set.`);
  }
  return cookieHeader;
}

async function loginWithCsrf(app: FastifyInstance): Promise<{ cookie: string; csrfToken: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      username: "admin",
      password: "secret1234567"
    }
  });

  expect(response.statusCode).toBe(200);
  const sessionCookie = extractCookie(response.headers["set-cookie"], "tworiver_session");
  const csrfCookie = extractCookie(response.headers["set-cookie"], "tworiver_csrf");
  return {
    cookie: `${sessionCookie}; ${csrfCookie}`,
    csrfToken: csrfCookie.slice("tworiver_csrf=".length)
  };
}

function sourceDraft(locale: "zh" | "en" = "zh") {
  return {
    locale,
    title: locale === "zh" ? "TwoRiver zh weekly" : "TwoRiver Weekly",
    summary: locale === "zh" ? "Product progress in zh locale." : "This week's product progress.",
    contentMarkdown:
      locale === "zh"
        ? "## Zh progress\n\nThe editor translation flow is ready in source locale."
        : "## Progress\n\nThe editor translation flow is ready.",
    seoTitle: locale === "zh" ? "TwoRiver zh weekly SEO" : "TwoRiver Weekly SEO",
    seoDescription: locale === "zh" ? "TwoRiver product weekly in zh locale." : "TwoRiver product weekly."
  };
}

async function translateDraft(
  app: FastifyInstance,
  payload: Record<string, unknown>
): Promise<ReturnType<FastifyInstance["inject"]> extends Promise<infer T> ? T : never> {
  const { cookie, csrfToken } = await loginWithCsrf(app);
  return app.inject({
    method: "POST",
    url: "/api/admin/posts/translate-draft",
    headers: { cookie, "x-csrf-token": csrfToken },
    payload
  });
}

beforeEach(() => {
  mockedTranslatePostDraft.mockReset();
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("admin translation routes", () => {
  test("translates a Chinese draft to English with warnings and chunks", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    const input = {
      source: sourceDraft("zh"),
      targetLocale: "en"
    };
    const translationResponse = {
      translation: {
        locale: "en",
        title: "TwoRiver Weekly",
        summary: "This week's product progress.",
        contentMarkdown: "## Progress\n\nThe editor translation flow is ready.",
        seoTitle: "TwoRiver Weekly SEO",
        seoDescription: "TwoRiver product weekly."
      },
      warnings: ["Kept product name TwoRiver untranslated."],
      chunks: [
        {
          index: 0,
          inputChars: 42,
          outputChars: 58,
          warnings: ["Chunk warning"]
        }
      ]
    } satisfies TranslationDraftResponse;
    mockedTranslatePostDraft.mockResolvedValueOnce(translationResponse);

    try {
      const response = await translateDraft(app, input);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(translationResponse);
      expect(mockedTranslatePostDraft).toHaveBeenCalledTimes(1);
      expect(mockedTranslatePostDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          NODE_ENV: "test",
          DEEPSEEK_API_KEY: "test-api-key",
          DEEPSEEK_BASE_URL: "https://api.deepseek.com",
          DEEPSEEK_MODEL: "deepseek-chat"
        }),
        input
      );
    } finally {
      await app.close();
    }
  });

  test("translates an English draft to Chinese", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    const input = {
      source: sourceDraft("en"),
      targetLocale: "zh"
    };
    const translationResponse = {
      translation: {
        locale: "zh",
        title: "TwoRiver zh weekly",
        summary: "Product progress in zh locale.",
        contentMarkdown: "## Zh progress\n\nThe editor translation flow is ready in zh locale.",
        seoTitle: "TwoRiver zh weekly SEO",
        seoDescription: "TwoRiver product weekly in zh locale."
      },
      warnings: [],
      chunks: []
    } satisfies TranslationDraftResponse;
    mockedTranslatePostDraft.mockResolvedValueOnce(translationResponse);

    try {
      const response = await translateDraft(app, input);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(translationResponse);
      expect(mockedTranslatePostDraft).toHaveBeenCalledTimes(1);
      expect(mockedTranslatePostDraft).toHaveBeenCalledWith(expect.any(Object), input);
    } finally {
      await app.close();
    }
  });

  test("rejects matching source and target locales", async () => {
    const app = await createTestApp();

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "zh"
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Source and target locales must be different" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("rejects empty source title and body", async () => {
    const app = await createTestApp();

    try {
      const response = await translateDraft(app, {
        source: {
          ...sourceDraft("zh"),
          title: "   ",
          contentMarkdown: "\n\t"
        },
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Source title or body is required" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("returns 503 when the translation provider is not configured", async () => {
    const app = await createTestApp();
    mockedTranslatePostDraft.mockRejectedValueOnce(new TranslationProviderNotConfiguredError());

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ message: "Translation provider is not configured" });
      expect(mockedTranslatePostDraft).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  test("returns 502 when the translation provider request fails", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    mockedTranslatePostDraft.mockRejectedValueOnce(new TranslationProviderRequestError(new Error("upstream failed")));

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: "Translation provider request failed" });
      expect(mockedTranslatePostDraft).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  test("rejects an extra top-level postId", async () => {
    const app = await createTestApp();

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en",
        postId: 123
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid translation input" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("rejects a nested source postId", async () => {
    const app = await createTestApp();

    try {
      const response = await translateDraft(app, {
        source: {
          ...sourceDraft("zh"),
          postId: 123
        },
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Invalid translation input" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
