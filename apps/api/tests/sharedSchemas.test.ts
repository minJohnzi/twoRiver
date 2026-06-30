import * as shared from "@tworiver/shared";
import { describe, expect, test } from "vitest";
import type { ZodTypeAny } from "zod";

function schema(name: string): ZodTypeAny {
  const value = (shared as Record<string, unknown>)[name];
  expect(value, `${name} should be exported`).toBeDefined();
  return value as ZodTypeAny;
}

const translations = [
  {
    locale: "zh",
    title: "示例页面",
    contentMarkdown: "# 示例",
    seoTitle: null,
    seoDescription: null
  }
];

const legacyPostPayload = {
  slug: "legacy-post",
  status: "draft",
  publishedAt: null,
  translations: [
    {
      locale: "en",
      title: "Legacy",
      summary: "",
      contentMarkdown: "Legacy body"
    }
  ]
};

const tiptapContent = {
  format: "tiptap",
  schemaVersion: 1,
  doc: { type: "doc", content: [{ type: "paragraph" }] }
};

const canonicalTiptapPayload = {
  slug: "canonical-post",
  status: "draft",
  publishedAt: null,
  translations: [
    {
      locale: "en",
      title: "Canonical",
      summary: "",
      content: tiptapContent
    }
  ]
};

describe("admin parity shared schemas", () => {
  test("accepts archived as a post status", () => {
    expect(shared.PostStatusSchema.parse("archived")).toBe("archived");
  });

  test("exports every cross-layer input contract", () => {
    for (const name of [
      "PostLifecycleInputSchema",
      "BulkPostActionInputSchema",
      "UpsertPageInputSchema",
      "UpsertProjectInputSchema",
      "UpsertNavigationItemInputSchema",
      "UpsertSiteSettingsInputSchema",
      "PageViewInputSchema",
      "UpdateAdminProfileInputSchema",
      "ChangePasswordInputSchema",
      "MaintenanceActionInputSchema",
      "BackupManifestSchema"
    ]) {
      schema(name);
    }
  });

  test("rejects reserved custom page slugs", () => {
    const pageSchema = schema("UpsertPageInputSchema");

    expect(() =>
      pageSchema.parse({
        slug: "admin",
        status: "published",
        sortOrder: 0,
        translations
      })
    ).toThrow();
  });

  test("accepts safe navigation links and rejects script URLs", () => {
    const navigationSchema = schema("UpsertNavigationItemInputSchema");
    const base = {
      sortOrder: 0,
      enabled: true,
      openInNewWindow: false,
      translations: [{ locale: "zh", label: "关于" }]
    };

    expect(navigationSchema.parse({ ...base, url: "/about" })).toBeTruthy();
    expect(navigationSchema.parse({ ...base, url: "https://example.com" })).toBeTruthy();
    expect(() => navigationSchema.parse({ ...base, url: "javascript:alert(1)" })).toThrow();
  });

  test("validates site themes and privacy-safe page views", () => {
    const siteSchema = schema("UpsertSiteSettingsInputSchema");
    const pageViewSchema = schema("PageViewInputSchema");

    expect(
      siteSchema.parse({
        logoUrl: "",
        faviconUrl: "",
        robotsText: "User-agent: *\nAllow: /",
        theme: {
          primaryColor: "#111111",
          homeLayout: "bento",
          codeTheme: "one-dark",
          fontSize: "medium",
          allowReaderDarkMode: true
        },
        translations: [
          {
            locale: "zh",
            siteName: "TwoRiver",
            subtitle: "技术博客",
            seoTitle: "TwoRiver",
            seoDescription: "技术文章",
            seoKeywords: ["TypeScript"]
          }
        ],
        socialLinks: []
      })
    ).toBeTruthy();

    expect(
      pageViewSchema.parse({
        path: "/posts/example",
        contentType: "post",
        contentId: 1,
        locale: "zh"
      })
    ).toBeTruthy();
  });

  test("requires matching new passwords", () => {
    const passwordSchema = schema("ChangePasswordInputSchema");

    expect(() =>
      passwordSchema.parse({
        currentPassword: "current-password",
        newPassword: "a-secure-new-password",
        confirmPassword: "different-password"
      })
    ).toThrow();
  });

  test("accepts explicit active, trashed, and total taxonomy usage counts", () => {
    const category = shared.CategorySchema.parse({
      id: 1,
      slug: "engineering",
      name: "Engineering",
      postCount: 2,
      activePostCount: 2,
      trashedPostCount: 1,
      totalPostCount: 3
    });
    const tag = shared.TagSchema.parse({
      id: 2,
      slug: "typescript",
      name: "TypeScript",
      postCount: 4,
      activePostCount: 4,
      trashedPostCount: 2,
      totalPostCount: 6
    });

    expect(category.totalPostCount).toBe(3);
    expect(tag.trashedPostCount).toBe(2);
    expect(() =>
      shared.CategorySchema.parse({
        id: 1,
        slug: "engineering",
        name: "Engineering",
        activePostCount: -1
      })
    ).toThrow();
  });

  test("validates taxonomy reference summaries", () => {
    const referenceSchema = schema("TaxonomyReferenceSchema");

    expect(
      referenceSchema.parse({
        id: 7,
        slug: "recoverable-post",
        status: "draft",
        deletedAt: "2026-06-29T08:00:00.000Z",
        titles: { zh: "可恢复文章", en: "Recoverable post" }
      })
    ).toBeTruthy();
    expect(() =>
      referenceSchema.parse({
        id: 7,
        slug: "recoverable-post",
        status: "draft",
        deletedAt: null,
        titles: {}
      })
    ).toThrow();
  });

  test("validates bounded and unique taxonomy detach post ids", () => {
    const detachSchema = schema("DetachTaxonomyInputSchema");

    expect(detachSchema.parse({ postIds: [1, 2, 3] })).toEqual({ postIds: [1, 2, 3] });
    expect(() => detachSchema.parse({ postIds: [] })).toThrow();
    expect(() => detachSchema.parse({ postIds: [1, 1] })).toThrow();
    expect(() => detachSchema.parse({ postIds: Array.from({ length: 101 }, (_, index) => index + 1) })).toThrow();
  });

  test("normalizes legacy Markdown post input", () => {
    const parsed = shared.UpsertPostInputSchema.parse(legacyPostPayload);
    expect(parsed.translations[0]?.content).toEqual({
      format: "markdown",
      markdown: "Legacy body"
    });
    expect(shared.UpsertPostInputSchema.parse(parsed).translations[0]?.content).toEqual({
      format: "markdown",
      markdown: "Legacy body"
    });
  });

  test("accepts canonical TipTap input and rejects dual sources", () => {
    expect(shared.UpsertPostInputSchema.parse(canonicalTiptapPayload).translations[0]?.content).toEqual(tiptapContent);
    expect(() =>
      shared.UpsertPostInputSchema.parse({
        ...canonicalTiptapPayload,
        translations: [
          {
            ...canonicalTiptapPayload.translations[0],
            contentMarkdown: "ambiguous"
          }
        ]
      })
    ).toThrow();
  });

  test("accepts optimistic concurrency on updates", () => {
    expect(
      shared.UpsertPostInputSchema.parse({
        ...legacyPostPayload,
        expectedUpdatedAt: "2026-06-30T00:00:00.000Z"
      }).expectedUpdatedAt
    ).toBe("2026-06-30T00:00:00.000Z");
  });

  test("exports explicit article conversion contracts", () => {
    const paramsSchema = schema("ArticleLocaleParamsSchema");
    const inputSchema = schema("ConvertArticleContentInputSchema");
    const previewSchema = schema("MarkdownConversionPreviewSchema");

    expect(paramsSchema.parse({ id: "7", locale: "en" })).toEqual({ id: 7, locale: "en" });
    expect(() => paramsSchema.parse({ id: "0", locale: "en" })).toThrow();
    expect(() => paramsSchema.parse({ id: "7", locale: "fr" })).toThrow();

    expect(inputSchema.parse({ expectedUpdatedAt: "2026-06-30T00:00:00.000Z" })).toEqual({
      expectedUpdatedAt: "2026-06-30T00:00:00.000Z"
    });
    expect(() => inputSchema.parse({})).toThrow();

    expect(
      previewSchema.parse({
        originalMarkdown: "# Intro",
        document: { type: "doc", content: [{ type: "paragraph" }] },
        projectedMarkdown: "# Intro",
        canConvert: true,
        blockers: [],
        warnings: [{ code: "normalized-markdown", line: 1, message: "Formatting will be normalized." }]
      })
    ).toEqual(
      expect.objectContaining({
        originalMarkdown: "# Intro",
        canConvert: true,
        blockers: []
      })
    );
  });

  test("defaults Markdown restore metadata without accepting snapshot content", () => {
    const parsed = shared.PostTranslationSchema.parse({
      locale: "en",
      title: "Article",
      summary: "",
      contentMarkdown: "Body"
    });

    expect(parsed.canRestoreMarkdown).toBe(false);
    expect(parsed.restoreMarkdownSnapshotAt).toBeNull();
    expect(parsed).not.toHaveProperty("migrationSourceMarkdown");
    expect(parsed).not.toHaveProperty("migration_source_markdown");
  });
});
