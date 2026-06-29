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
});
