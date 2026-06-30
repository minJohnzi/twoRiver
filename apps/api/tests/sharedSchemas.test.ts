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
});
