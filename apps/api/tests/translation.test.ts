import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../src/config.js";
import { buildApp } from "../src/app.js";
import { openDatabase } from "../src/db/connection.js";
import { migrate } from "../src/db/migrate.js";
import { seedAdmin } from "../src/db/seedAdmin.js";
import {
  draftPostTranslation,
  TranslationDraftContractError
} from "../src/services/ai/translationDraftService.js";
import { AiClientNotConfiguredError, AiProviderError } from "../src/services/ai/aiClient.js";

vi.mock("../src/services/ai/translationDraftService.js", async (importActual) => {
  const actual = await importActual<typeof import("../src/services/ai/translationDraftService.js")>();
  return {
    ...actual,
    draftPostTranslation: vi.fn()
  };
});

const tempDirectories: string[] = [];
const mockedDraftPostTranslation = vi.mocked(draftPostTranslation);

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
    content: { format: "markdown" as const, markdown: "## Body" },
    contentMarkdown: "## Body",
    seoTitle: null as string | null,
    seoDescription: null as string | null
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

const makeTranslationResult = (overrides?: Partial<Awaited<ReturnType<typeof draftPostTranslation>>>) => ({
  translation: {
    locale: "en" as const,
    title: "TwoRiver Weekly",
    summary: "This week's product progress.",
    contentMarkdown: "## Progress\n\nThe editor translation flow is ready.",
    seoTitle: "TwoRiver Weekly SEO",
    seoDescription: "TwoRiver product weekly."
  },
  warnings: [] as string[],
  ...overrides
});

beforeEach(() => {
  mockedDraftPostTranslation.mockReset();
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("admin translation routes", () => {
  test("translates a Chinese draft to English", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    const translationResponse = makeTranslationResult();
    mockedDraftPostTranslation.mockResolvedValueOnce(translationResponse);

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(200);
      expect(mockedDraftPostTranslation).toHaveBeenCalledTimes(1);
      // Verify the translation result is returned
      expect(response.json()).toEqual(translationResponse);
    } finally {
      await app.close();
    }
  });

  test("translates an English draft to Chinese", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    const translationResponse: Awaited<ReturnType<typeof draftPostTranslation>> = {
      translation: { ...makeTranslationResult().translation, locale: "zh" },
      warnings: []
    };
    mockedDraftPostTranslation.mockResolvedValueOnce(translationResponse);

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("en"),
        targetLocale: "zh"
      });

      expect(response.statusCode).toBe(200);
      expect(mockedDraftPostTranslation).toHaveBeenCalledTimes(1);
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
      expect(response.json()).toEqual({ message: "Source and target languages must be different" });
      expect(mockedDraftPostTranslation).not.toHaveBeenCalled();
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
          title: "",
          contentMarkdown: "",
          content: { format: "markdown", markdown: "" }
        },
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Add a title or body before translating" });
      expect(mockedDraftPostTranslation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("returns 503 when the translation provider is not configured", async () => {
    const app = await createTestApp();
    mockedDraftPostTranslation.mockRejectedValueOnce(new AiClientNotConfiguredError());

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ message: "AI translation is not configured" });
      expect(mockedDraftPostTranslation).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  test("returns 502 when the translation provider request fails", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    mockedDraftPostTranslation.mockRejectedValueOnce(new AiProviderError(500, "upstream failed"));

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(502);
      expect(mockedDraftPostTranslation).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  test("returns 502 when ztrans returns a contract error", async () => {
    const app = await createTestApp({ DEEPSEEK_API_KEY: "test-api-key" });
    mockedDraftPostTranslation.mockRejectedValueOnce(new TranslationDraftContractError("Structure validation failed"));

    try {
      const response = await translateDraft(app, {
        source: sourceDraft("zh"),
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: "Structure validation failed" });
      expect(mockedDraftPostTranslation).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  test("returns 400 for invalid translation input schema", async () => {
    const app = await createTestApp();

    try {
      const response = await translateDraft(app, {
        source: { locale: "zh" },
        targetLocale: "en"
      });

      expect(response.statusCode).toBe(400);
      expect(mockedDraftPostTranslation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
