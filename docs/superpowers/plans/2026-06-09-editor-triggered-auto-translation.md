# Editor-Triggered Auto Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated editor button that generates the opposite-language post translation draft through `ztrans` without writing to the database.

**Architecture:** The shared package defines the request and response schemas. The API exposes a CSRF-protected admin draft translation endpoint backed by a focused ztrans service. The web editor calls the endpoint, confirms overwrites client-side, fills the target language form fields, and surfaces warnings.

**Tech Stack:** TypeScript, React, Vite, Fastify, Zod, Vitest, Testing Library, ztrans.

---

## File Map

- Modify `packages/shared/src/schemas.ts`: add translation draft request/response Zod schemas and exported types.
- Modify `apps/api/package.json`: add `ztrans` as an independent dependency using `file:E:/ztrans` for local integration.
- Modify `apps/api/src/config.ts`: add `DEEPSEEK_MODEL` with default `deepseek-chat`.
- Create `apps/api/src/services/ai/defaultGlossary.ts`: central default glossary for translation.
- Create `apps/api/src/services/ai/postTranslationService.ts`: local service boundary around `ztrans.translatePostTranslation`.
- Create `apps/api/src/routes/adminTranslationRoutes.ts`: admin route for `POST /api/admin/posts/translate-draft`.
- Modify `apps/api/src/app.ts`: register the translation route.
- Create `apps/api/tests/translation.test.ts`: route tests with mocked ztrans service.
- Modify `apps/web/src/api/admin.ts`: add `translateAdminPostDraft`.
- Modify `apps/web/src/pages/AdminEditorPage.tsx`: add translate button, overwrite confirmation, loading/error/warning state, and target language fill behavior.
- Replace `apps/web/src/pages/AdminEditorPage.test.tsx`: render the real editor with mocked admin API calls and cover translation behavior.
- Modify `.env.example` and `README.md`: document `DEEPSEEK_MODEL`.

## Task 1: Shared Translation Schemas

**Files:**
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Add failing shared schema tests by extending API route tests later**

Shared has no test file today. The first red tests for these schemas are in Task 3, where the API route imports and uses them. Do not add a separate shared test package.

- [ ] **Step 2: Add translation draft schemas**

In `packages/shared/src/schemas.ts`, after `PostTranslationSchema`, add:

```ts
export const TranslationChunkSchema = z.object({
  index: z.number().int(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});
export type TranslationChunk = z.infer<typeof TranslationChunkSchema>;

export const TranslationDraftSourceSchema = PostTranslationSchema.pick({
  locale: true,
  title: true,
  summary: true,
  contentMarkdown: true,
  seoTitle: true,
  seoDescription: true
});
export type TranslationDraftSource = z.infer<typeof TranslationDraftSourceSchema>;

export const TranslationDraftInputSchema = z.object({
  source: TranslationDraftSourceSchema,
  targetLocale: LocaleSchema
});
export type TranslationDraftInput = z.infer<typeof TranslationDraftInputSchema>;

export const TranslationDraftResponseSchema = z.object({
  translation: PostTranslationSchema,
  warnings: z.array(z.string()),
  chunks: z.array(TranslationChunkSchema)
});
export type TranslationDraftResponse = z.infer<typeof TranslationDraftResponseSchema>;
```

Keep these close to `PostTranslationSchema` because they reuse its field contract.

- [ ] **Step 3: Run shared build**

Run:

```powershell
pnpm --filter @tworiver/shared build
```

Expected: build passes.

- [ ] **Step 4: Commit shared schema changes**

Run:

```powershell
git add packages/shared/src/schemas.ts
git commit -m "feat: add translation draft shared schemas"
```

## Task 2: API Translation Service and Route

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config.ts`
- Create: `apps/api/src/services/ai/defaultGlossary.ts`
- Create: `apps/api/src/services/ai/postTranslationService.ts`
- Create: `apps/api/src/routes/adminTranslationRoutes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add the local ztrans dependency**

In `apps/api/package.json`, add this dependency:

```json
"ztrans": "file:E:/ztrans"
```

Run:

```powershell
pnpm install
```

Expected: `pnpm-lock.yaml` updates and `@tworiver/api` can resolve `ztrans`.

- [ ] **Step 2: Add the DeepSeek model config**

In `apps/api/src/config.ts`, extend `ConfigSchema`:

```ts
DEEPSEEK_API_KEY: z.string().optional(),
DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat")
```

Update all test `makeConfig` helpers that construct `AppConfig` manually by adding:

```ts
DEEPSEEK_MODEL: "deepseek-chat"
```

This includes every `makeConfig` in `apps/api/tests/*.test.ts`.

- [ ] **Step 3: Create the default glossary**

Create `apps/api/src/services/ai/defaultGlossary.ts`:

```ts
import type { GlossaryTerm } from "ztrans";

export const DEFAULT_TRANSLATION_GLOSSARY: GlossaryTerm[] = [
  { source: "TwoRiver", target: "TwoRiver", note: "Project name; do not translate." },
  { source: "Fastify", target: "Fastify" },
  { source: "SQLite", target: "SQLite" },
  { source: "Markdown", target: "Markdown" },
  { source: "DeepSeek", target: "DeepSeek" },
  { source: "TypeScript", target: "TypeScript" },
  { source: "React", target: "React" },
  { source: "Vite", target: "Vite" }
];
```

- [ ] **Step 4: Create the ztrans-backed service boundary**

Create `apps/api/src/services/ai/postTranslationService.ts`:

```ts
import type { TranslationDraftInput, TranslationDraftResponse } from "@tworiver/shared";
import { translatePostTranslation } from "ztrans";
import type { AppConfig } from "../../config.js";
import { DEFAULT_TRANSLATION_GLOSSARY } from "./defaultGlossary.js";

export class TranslationProviderNotConfiguredError extends Error {
  constructor() {
    super("Translation provider is not configured");
    this.name = "TranslationProviderNotConfiguredError";
  }
}

export class TranslationProviderRequestError extends Error {
  constructor(cause: unknown) {
    super("Translation provider request failed");
    this.name = "TranslationProviderRequestError";
    this.cause = cause;
  }
}

export async function translatePostDraft(
  config: AppConfig,
  input: TranslationDraftInput
): Promise<TranslationDraftResponse> {
  if (!config.DEEPSEEK_API_KEY) {
    throw new TranslationProviderNotConfiguredError();
  }

  try {
    const result = await translatePostTranslation({
      source: input.source,
      targetLocale: input.targetLocale,
      provider: {
        apiKey: config.DEEPSEEK_API_KEY,
        baseUrl: config.DEEPSEEK_BASE_URL,
        model: config.DEEPSEEK_MODEL,
        temperature: 0.2
      },
      glossary: DEFAULT_TRANSLATION_GLOSSARY,
      validateStructure: true,
      retryOnValidationFailure: true,
      maxRetries: 1
    });

    return {
      translation: {
        locale: result.locale === "zh" ? "zh" : "en",
        title: result.title,
        summary: result.summary,
        contentMarkdown: result.contentMarkdown,
        seoTitle: result.seoTitle,
        seoDescription: result.seoDescription
      },
      warnings: result.warnings,
      chunks: result.chunks
    };
  } catch (error) {
    throw new TranslationProviderRequestError(error);
  }
}
```

- [ ] **Step 5: Create the admin translation route**

Create `apps/api/src/routes/adminTranslationRoutes.ts`:

```ts
import { TranslationDraftInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import {
  translatePostDraft,
  TranslationProviderNotConfiguredError,
  TranslationProviderRequestError
} from "../services/ai/postTranslationService.js";

interface AdminTranslationRouteOptions {
  config: AppConfig;
}

function hasSourceContent(input: { source: { title: string; contentMarkdown: string } }): boolean {
  return Boolean(input.source.title.trim() || input.source.contentMarkdown.trim());
}

export async function adminTranslationRoutes(app: FastifyInstance, options: AdminTranslationRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.post("/api/admin/posts/translate-draft", async (request, reply) => {
    const parsed = TranslationDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid translation input" });
      return;
    }

    if (parsed.data.source.locale === parsed.data.targetLocale) {
      reply.code(400).send({ message: "Source and target locales must be different" });
      return;
    }

    if (!hasSourceContent(parsed.data)) {
      reply.code(400).send({ message: "Source title or body is required" });
      return;
    }

    try {
      return await translatePostDraft(options.config, parsed.data);
    } catch (error) {
      if (error instanceof TranslationProviderNotConfiguredError) {
        reply.code(503).send({ message: "Translation provider is not configured" });
        return;
      }

      if (error instanceof TranslationProviderRequestError) {
        reply.code(502).send({ message: "Translation provider request failed" });
        return;
      }

      throw error;
    }
  });
}
```

- [ ] **Step 6: Register the route**

In `apps/api/src/app.ts`, import the route:

```ts
import { adminTranslationRoutes } from "./routes/adminTranslationRoutes.js";
```

Register it with config near other admin routes:

```ts
app.register(adminTranslationRoutes, { config });
```

- [ ] **Step 7: Document the model env var**

In `.env.example`, add:

```text
DEEPSEEK_MODEL=deepseek-chat
```

In `README.md`, update the environment variable table so it includes:

```markdown
| `DEEPSEEK_MODEL` | DeepSeek-compatible model name for AI helper services | `deepseek-chat` |
```

- [ ] **Step 8: Run API typecheck**

Run:

```powershell
pnpm --filter @tworiver/api typecheck
```

Expected: typecheck passes. If it fails because `ztrans` types are unavailable, run `pnpm --dir E:\ztrans build`, then run the API typecheck again.

- [ ] **Step 9: Commit API route/service changes**

Run:

```powershell
git add apps/api/package.json pnpm-lock.yaml apps/api/src/config.ts apps/api/src/services/ai/defaultGlossary.ts apps/api/src/services/ai/postTranslationService.ts apps/api/src/routes/adminTranslationRoutes.ts apps/api/src/app.ts .env.example README.md apps/api/tests
git commit -m "feat: add admin translation draft API"
```

## Task 3: API Route Tests

**Files:**
- Create: `apps/api/tests/translation.test.ts`
- Modify: `apps/api/tests/about.test.ts`
- Modify: `apps/api/tests/auth.test.ts`
- Modify: `apps/api/tests/categories.test.ts`
- Modify: `apps/api/tests/integration.test.ts`
- Modify: `apps/api/tests/posts.test.ts`

- [ ] **Step 1: Write the route test with mocked service**

Create `apps/api/tests/translation.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";
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

vi.mock("../src/services/ai/postTranslationService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/ai/postTranslationService.js")>();
  return {
    ...actual,
    translatePostDraft: vi.fn()
  };
});

const mockedTranslatePostDraft = vi.mocked(translatePostDraft);
const tempDirectories: string[] = [];

function makeConfig(databasePath: string, apiKey = "test-key"): AppConfig {
  return {
    NODE_ENV: "test",
    PORT: 0,
    DATABASE_PATH: databasePath,
    SESSION_SECRET: "test-session-secret-at-least-32-chars",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "secret1234567",
    CORS_ALLOWED_ORIGINS: [],
    DEEPSEEK_API_KEY: apiKey,
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_MODEL: "deepseek-chat"
  };
}

function createDatabasePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tworiver-translation-"));
  tempDirectories.push(directory);
  return path.join(directory, "blog.sqlite");
}

async function createTestApp(apiKey = "test-key"): Promise<FastifyInstance> {
  const databasePath = createDatabasePath();
  migrate(databasePath);
  const db = openDatabase(databasePath);
  await seedAdmin(db, "admin", "secret1234567");

  return buildApp({ config: makeConfig(databasePath, apiKey), db });
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

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("admin translation draft route", () => {
  test("returns a Chinese to English draft translation", async () => {
    const app = await createTestApp();
    mockedTranslatePostDraft.mockResolvedValue({
      translation: {
        locale: "en",
        title: "Publishing console update",
        summary: "How the flow works",
        contentMarkdown: "## Publishing console\n\nUse `pnpm build`.",
        seoTitle: "Publishing console",
        seoDescription: null
      },
      warnings: ["Chunk 0 validation failed: heading text changed"],
      chunks: [{ index: 0, inputChars: 20, outputChars: 28, warnings: ["heading text changed"] }]
    });

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "zh",
            title: "发布控制台更新",
            summary: "流程说明",
            contentMarkdown: "## 发布控制台\n\n使用 `pnpm build`。",
            seoTitle: "发布控制台",
            seoDescription: null
          },
          targetLocale: "en"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        translation: expect.objectContaining({
          locale: "en",
          title: "Publishing console update",
          contentMarkdown: "## Publishing console\n\nUse `pnpm build`."
        }),
        warnings: ["Chunk 0 validation failed: heading text changed"],
        chunks: [{ index: 0, inputChars: 20, outputChars: 28, warnings: ["heading text changed"] }]
      });
      expect(mockedTranslatePostDraft).toHaveBeenCalledWith(
        expect.objectContaining({ DEEPSEEK_API_KEY: "test-key" }),
        expect.objectContaining({ targetLocale: "en" })
      );
    } finally {
      await app.close();
    }
  });

  test("returns an English to Chinese draft translation", async () => {
    const app = await createTestApp();
    mockedTranslatePostDraft.mockResolvedValue({
      translation: {
        locale: "zh",
        title: "发布控制台更新",
        summary: "流程说明",
        contentMarkdown: "## 发布控制台\n\n使用 `pnpm build`。",
        seoTitle: null,
        seoDescription: null
      },
      warnings: [],
      chunks: []
    });

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "Publishing console update",
            summary: "Flow notes",
            contentMarkdown: "## Publishing console\n\nUse `pnpm build`.",
            seoTitle: null,
            seoDescription: null
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().translation.locale).toBe("zh");
      expect(response.json().translation.title).toBe("发布控制台更新");
    } finally {
      await app.close();
    }
  });

  test("rejects same source and target locales", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "Title",
            summary: "",
            contentMarkdown: "",
            seoTitle: null,
            seoDescription: null
          },
          targetLocale: "en"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Source and target locales must be different" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("rejects empty source content", async () => {
    const app = await createTestApp();

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "   ",
            summary: "summary only does not trigger translation",
            contentMarkdown: "   ",
            seoTitle: null,
            seoDescription: null
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ message: "Source title or body is required" });
      expect(mockedTranslatePostDraft).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test("returns 503 when provider configuration is missing", async () => {
    const app = await createTestApp("");
    mockedTranslatePostDraft.mockRejectedValue(new TranslationProviderNotConfiguredError());

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "Title",
            summary: "",
            contentMarkdown: "",
            seoTitle: null,
            seoDescription: null
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ message: "Translation provider is not configured" });
    } finally {
      await app.close();
    }
  });

  test("returns 502 when provider request fails", async () => {
    const app = await createTestApp();
    mockedTranslatePostDraft.mockRejectedValue(new TranslationProviderRequestError(new Error("upstream")));

    try {
      const { cookie, csrfToken } = await loginWithCsrf(app);
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/posts/translate-draft",
        headers: { cookie, "x-csrf-token": csrfToken },
        payload: {
          source: {
            locale: "en",
            title: "Title",
            summary: "",
            contentMarkdown: "",
            seoTitle: null,
            seoDescription: null
          },
          targetLocale: "zh"
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ message: "Translation provider request failed" });
    } finally {
      await app.close();
    }
  });
});
```

- [ ] **Step 2: Run tests and verify initial failures**

Before implementing Task 2, this test file should fail because the route and service do not exist:

```powershell
pnpm --filter @tworiver/api test -- translation.test.ts
```

Expected before Task 2 implementation: FAIL with module/route errors. Expected after Task 2 implementation: PASS.

- [ ] **Step 3: Run API tests**

Run:

```powershell
pnpm --filter @tworiver/api test
```

Expected: all API tests pass.

- [ ] **Step 4: Commit API tests**

Run:

```powershell
git add apps/api/tests/translation.test.ts apps/api/tests
git commit -m "test: cover admin translation draft API"
```

## Task 4: Frontend API Client and Editor Interaction

**Files:**
- Modify: `apps/web/src/api/admin.ts`
- Modify: `apps/web/src/pages/AdminEditorPage.tsx`

- [ ] **Step 1: Add the admin API helper**

In `apps/web/src/api/admin.ts`, extend the type import:

```ts
import type {
  AboutProfile,
  Category,
  PublicPost,
  Tag,
  TranslationDraftInput,
  TranslationDraftResponse,
  UpsertAboutProfileInput,
  UpsertPostInput
} from "@tworiver/shared";
```

Add:

```ts
export function translateAdminPostDraft(input: TranslationDraftInput) {
  return apiRequest<TranslationDraftResponse>("/api/admin/posts/translate-draft", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
```

- [ ] **Step 2: Extend editor local translation type**

In `apps/web/src/pages/AdminEditorPage.tsx`, change:

```ts
type TranslationDraft = Record<Locale, Pick<PostTranslation, "title" | "summary" | "contentMarkdown">>;
```

to:

```ts
type TranslationDraft = Record<
  Locale,
  Pick<PostTranslation, "title" | "summary" | "contentMarkdown" | "seoTitle" | "seoDescription">
>;
```

Update `EMPTY_TRANSLATIONS`:

```ts
const EMPTY_TRANSLATIONS: TranslationDraft = {
  zh: { title: "", summary: "", contentMarkdown: "", seoTitle: null, seoDescription: null },
  en: { title: "", summary: "", contentMarkdown: "", seoTitle: null, seoDescription: null }
};
```

When loading a post, include SEO fields:

```ts
nextTranslations[translation.locale] = {
  title: translation.title,
  summary: translation.summary,
  contentMarkdown: translation.contentMarkdown,
  seoTitle: translation.seoTitle,
  seoDescription: translation.seoDescription
};
```

In `buildInput`, replace `seoTitle: null` and `seoDescription: null` with:

```ts
seoTitle: translations[translationLocale].seoTitle,
seoDescription: translations[translationLocale].seoDescription
```

For the fallback zh translation, use:

```ts
{ ...translations.zh, locale: "zh" as const }
```

- [ ] **Step 3: Import the translation API helper**

Update the admin API import:

```ts
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost
} from "../api/admin";
```

- [ ] **Step 4: Add editor translation state and helpers**

Inside `AdminEditorPage`, add state:

```ts
const [isTranslating, setIsTranslating] = useState(false);
const [translationWarnings, setTranslationWarnings] = useState<string[]>([]);
```

Add helpers before `savePost`:

```ts
function getTargetLocale(sourceLocale: Locale): Locale {
  return sourceLocale === "zh" ? "en" : "zh";
}

function hasTranslationContent(translation: TranslationDraft[Locale]): boolean {
  return Boolean(
    translation.title.trim() ||
      translation.summary.trim() ||
      translation.contentMarkdown.trim() ||
      translation.seoTitle?.trim() ||
      translation.seoDescription?.trim()
  );
}

async function handleTranslateDraft() {
  const sourceLocale = activeLocale;
  const targetLocale = getTargetLocale(sourceLocale);
  const source = translations[sourceLocale];
  const target = translations[targetLocale];

  if (!source.title.trim() && !source.contentMarkdown.trim()) {
    setError(locale === "zh" ? "请先填写源语言标题或正文。" : "Add a source title or body before translating.");
    return;
  }

  if (hasTranslationContent(target)) {
    const confirmed = window.confirm(
      locale === "zh"
        ? "目标语言已有内容。确认覆盖标题、摘要、正文和 SEO 字段吗？"
        : "The target language already has content. Replace its title, summary, body, and SEO fields?"
    );
    if (!confirmed) {
      return;
    }
  }

  setIsTranslating(true);
  setError(null);
  setTranslationWarnings([]);

  try {
    const result = await translateAdminPostDraft({
      source: {
        locale: sourceLocale,
        title: source.title,
        summary: source.summary,
        contentMarkdown: source.contentMarkdown,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription
      },
      targetLocale
    });

    setTranslations((current) => ({
      ...current,
      [targetLocale]: {
        title: result.translation.title,
        summary: result.translation.summary,
        contentMarkdown: result.translation.contentMarkdown,
        seoTitle: result.translation.seoTitle,
        seoDescription: result.translation.seoDescription
      }
    }));
    setActiveLocale(targetLocale);
    setTranslationWarnings(result.warnings);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "Failed to translate draft");
  } finally {
    setIsTranslating(false);
  }
}
```

- [ ] **Step 5: Add the translate button**

Near the `language-tabs` div in the writing card heading, add a sibling button inside the heading:

```tsx
<button className="secondary-button" type="button" onClick={() => void handleTranslateDraft()} disabled={isTranslating}>
  {isTranslating
    ? locale === "zh"
      ? "翻译中..."
      : "Translating..."
    : activeLocale === "zh"
      ? "Translate to EN"
      : "Translate to Chinese"}
</button>
```

If the heading layout becomes crowded, wrap the tabs and button in:

```tsx
<div className="editor-card__actions">
  ...
</div>
```

and add minimal CSS only if needed to keep items aligned.

- [ ] **Step 6: Show translation warnings**

Below `{error ? <p className="error-text">{error}</p> : null}`, add:

```tsx
{translationWarnings.length > 0 ? (
  <div className="warning-box" role="status">
    <strong>
      {locale === "zh"
        ? `翻译完成，但有 ${translationWarnings.length} 条结构提示。`
        : `Translation completed with ${translationWarnings.length} structure warning${translationWarnings.length === 1 ? "" : "s"}.`}
    </strong>
    <ul>
      {translationWarnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  </div>
) : null}
```

Add CSS in `apps/web/src/styles/global.css` if no warning style exists:

```css
.warning-box {
  border: 1px solid rgba(180, 120, 0, 0.35);
  background: rgba(255, 247, 214, 0.8);
  color: #5f4300;
  padding: 0.75rem;
  border-radius: 6px;
}

.warning-box ul {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}
```

- [ ] **Step 7: Run web typecheck**

Run:

```powershell
pnpm --filter @tworiver/web typecheck
```

Expected: typecheck passes.

- [ ] **Step 8: Commit frontend implementation**

Run:

```powershell
git add apps/web/src/api/admin.ts apps/web/src/pages/AdminEditorPage.tsx apps/web/src/styles/global.css
git commit -m "feat: add editor translation draft action"
```

## Task 5: Frontend Tests and Final Verification

**Files:**
- Replace: `apps/web/src/pages/AdminEditorPage.test.tsx`

- [ ] **Step 1: Replace editor tests with real interaction coverage**

Replace `apps/web/src/pages/AdminEditorPage.test.tsx` with:

```tsx
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEditorPage } from "./AdminEditorPage";
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost
} from "../api/admin";

vi.mock("../api/admin", () => ({
  createAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminPost: vi.fn(),
  translateAdminPostDraft: vi.fn(),
  updateAdminPost: vi.fn()
}));

const mockedFetchAdminCategories = vi.mocked(fetchAdminCategories);
const mockedFetchAdminPost = vi.mocked(fetchAdminPost);
const mockedTranslateAdminPostDraft = vi.mocked(translateAdminPostDraft);

function renderEditor(route = "/admin/posts/new") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/admin/posts/:id" element={<AdminEditorPage locale="en" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchAdminCategories.mockResolvedValue({ categories: [] });
  mockedFetchAdminPost.mockResolvedValue({
    post: {
      id: 1,
      slug: "existing-post",
      status: "draft",
      publishedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      category: null,
      tags: [],
      translations: [
        {
          locale: "zh",
          title: "中文标题",
          summary: "中文摘要",
          contentMarkdown: "## 中文正文",
          seoTitle: null,
          seoDescription: null
        },
        {
          locale: "en",
          title: "",
          summary: "",
          contentMarkdown: "",
          seoTitle: null,
          seoDescription: null
        }
      ]
    }
  });
  mockedTranslateAdminPostDraft.mockResolvedValue({
    translation: {
      locale: "en",
      title: "English title",
      summary: "English summary",
      contentMarkdown: "## English body",
      seoTitle: null,
      seoDescription: null
    },
    warnings: [],
    chunks: []
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminEditorPage translation", () => {
  it("translates the active Chinese draft into English and fills the target fields", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "中文标题" } });
    fireEvent.change(screen.getByLabelText("Markdown body"), { target: { value: "## 中文正文" } });
    fireEvent.click(screen.getByRole("button", { name: "Translate to EN" }));

    await waitFor(() =>
      expect(mockedTranslateAdminPostDraft).toHaveBeenCalledWith({
        source: {
          locale: "zh",
          title: "中文标题",
          summary: "",
          contentMarkdown: "## 中文正文",
          seoTitle: null,
          seoDescription: null
        },
        targetLocale: "en"
      })
    );

    expect(await screen.findByDisplayValue("English title")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown body")).toHaveValue("## English body");
  });

  it("asks for confirmation before replacing existing target content", async () => {
    mockedFetchAdminPost.mockResolvedValueOnce({
      post: {
        id: 1,
        slug: "existing-post",
        status: "draft",
        publishedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        category: null,
        tags: [],
        translations: [
          {
            locale: "zh",
            title: "中文标题",
            summary: "",
            contentMarkdown: "## 中文正文",
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "en",
            title: "Existing English",
            summary: "",
            contentMarkdown: "",
            seoTitle: null,
            seoDescription: null
          }
        ]
      }
    });

    renderEditor("/admin/posts/1");

    await screen.findByDisplayValue("Existing English");
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.click(screen.getByRole("button", { name: "Translate to EN" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "The target language already has content. Replace its title, summary, body, and SEO fields?"
    );
    await waitFor(() => expect(mockedTranslateAdminPostDraft).toHaveBeenCalledTimes(1));
  });

  it("does not call the API when overwrite confirmation is canceled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    mockedFetchAdminPost.mockResolvedValueOnce({
      post: {
        id: 1,
        slug: "existing-post",
        status: "draft",
        publishedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        category: null,
        tags: [],
        translations: [
          {
            locale: "zh",
            title: "中文标题",
            summary: "",
            contentMarkdown: "## 中文正文",
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "en",
            title: "Existing English",
            summary: "",
            contentMarkdown: "",
            seoTitle: null,
            seoDescription: null
          }
        ]
      }
    });

    renderEditor("/admin/posts/1");

    await screen.findByDisplayValue("Existing English");
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.click(screen.getByRole("button", { name: "Translate to EN" }));

    expect(mockedTranslateAdminPostDraft).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Existing English")).toBeInTheDocument();
  });

  it("leaves fields unchanged when translation fails", async () => {
    mockedTranslateAdminPostDraft.mockRejectedValueOnce(new Error("Translation provider request failed"));
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "中文标题" } });
    fireEvent.change(screen.getByLabelText("Markdown body"), { target: { value: "## 中文正文" } });
    fireEvent.click(screen.getByRole("button", { name: "Translate to EN" }));

    expect(await screen.findByText("Translation provider request failed")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("English title")).not.toBeInTheDocument();
  });

  it("displays warnings after a successful translation", async () => {
    mockedTranslateAdminPostDraft.mockResolvedValueOnce({
      translation: {
        locale: "en",
        title: "English title",
        summary: "",
        contentMarkdown: "## English body",
        seoTitle: null,
        seoDescription: null
      },
      warnings: ["Chunk 0 validation failed: heading text changed"],
      chunks: []
    });
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "中文标题" } });
    fireEvent.click(screen.getByRole("button", { name: "Translate to EN" }));

    expect(await screen.findByText("Translation completed with 1 structure warning.")).toBeInTheDocument();
    expect(screen.getByText("Chunk 0 validation failed: heading text changed")).toBeInTheDocument();
  });
});
```

If Testing Library cannot locate the title input by label because the current label text differs in the rendered locale, query it with:

```ts
const titleInput = screen.getAllByRole("textbox")[0];
```

and keep the assertion focused on the resulting field values.

- [ ] **Step 2: Run the web tests and verify initial failures**

Before Task 4 implementation, run:

```powershell
pnpm --filter @tworiver/web test -- AdminEditorPage.test.tsx
```

Expected before Task 4 implementation: FAIL because `translateAdminPostDraft` and the translate button do not exist. Expected after Task 4 implementation: PASS.

- [ ] **Step 3: Run full verification**

Run:

```powershell
pnpm --filter @tworiver/api test
pnpm --filter @tworiver/web test
pnpm --filter @tworiver/api typecheck
pnpm --filter @tworiver/web typecheck
```

Expected: all commands pass.

- [ ] **Step 4: Commit frontend tests and any test-driven fixes**

Run:

```powershell
git add apps/web/src/pages/AdminEditorPage.test.tsx apps/web/src/pages/AdminEditorPage.tsx apps/web/src/api/admin.ts apps/web/src/styles/global.css
git commit -m "test: cover editor translation workflow"
```

## Self-Review Notes

- Spec coverage: route contract, no database writes, ztrans dependency, default glossary, overwrite confirmation, warnings, provider errors, and tests are each mapped to tasks.
- Scope check: no background queue, batch translation, public endpoint, save-time translation, or glossary management UI is included.
- Type consistency: shared `TranslationDraftInput` and `TranslationDraftResponse` are used by both API and web. API route delegates to `translatePostDraft`; web API helper is named `translateAdminPostDraft`.
- Implementation risk: the current editor stores SEO fields in shared types but does not render SEO inputs. The plan preserves existing loaded SEO data and includes it in translation state so target overwrites remain complete per spec.
