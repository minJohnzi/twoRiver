import { z } from "zod";
import { DateTimeStringSchema, LocaleSchema, SlugSchema, hasUniqueLocales } from "./common.js";

export const AboutProfileSchema = z.object({
  displayName: z.string().default(""),
  headline: z.string().default(""),
  bio: z.string().default(""),
  avatarUrl: z.string().default(""),
  githubUrl: z.string().default(""),
  email: z.string().default(""),
  socialLinks: z
    .array(z.object({ label: z.string().min(1), url: z.string().min(1) }))
    .default([]),
  updatedAt: DateTimeStringSchema.nullable().default(null)
});
export type AboutProfile = z.infer<typeof AboutProfileSchema>;

export const UpsertAboutProfileInputSchema = AboutProfileSchema.omit({ updatedAt: true });
export type UpsertAboutProfileInput = z.infer<typeof UpsertAboutProfileInputSchema>;

export const ContentStatusSchema = z.enum(["draft", "published"]);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

export const RESERVED_CONTENT_SLUGS = [
  "admin",
  "about",
  "posts",
  "pages",
  "projects",
  "categories",
  "tags"
] as const;

export const PageTranslationSchema = z.object({
  locale: LocaleSchema,
  title: z.string().trim().min(1),
  contentMarkdown: z.string().default(""),
  seoTitle: z.string().trim().nullable().default(null),
  seoDescription: z.string().trim().nullable().default(null)
});
export type PageTranslation = z.infer<typeof PageTranslationSchema>;

export const UpsertPageInputSchema = z
  .object({
    slug: SlugSchema,
    status: ContentStatusSchema,
    sortOrder: z.number().int().default(0),
    translations: z.array(PageTranslationSchema).min(1)
  })
  .refine((value) => !RESERVED_CONTENT_SLUGS.includes(value.slug as (typeof RESERVED_CONTENT_SLUGS)[number]), {
    path: ["slug"],
    message: "Slug is reserved"
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpsertPageInput = z.infer<typeof UpsertPageInputSchema>;

export const ProjectTranslationSchema = z.object({
  locale: LocaleSchema,
  name: z.string().trim().min(1),
  description: z.string().default(""),
  seoTitle: z.string().trim().nullable().default(null),
  seoDescription: z.string().trim().nullable().default(null)
});
export type ProjectTranslation = z.infer<typeof ProjectTranslationSchema>;

const OptionalHttpUrlSchema = z.union([z.literal(""), z.string().url().refine((value) => /^https?:\/\//i.test(value))]);

export const UpsertProjectInputSchema = z
  .object({
    slug: SlugSchema,
    techStack: z.array(z.string().trim().min(1)).default([]),
    coverUrl: z.string().trim().default(""),
    githubUrl: OptionalHttpUrlSchema.default(""),
    demoUrl: OptionalHttpUrlSchema.default(""),
    sortOrder: z.number().int().default(0),
    isVisible: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    translations: z.array(ProjectTranslationSchema).min(1)
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpsertProjectInput = z.infer<typeof UpsertProjectInputSchema>;

export const NavigationTranslationSchema = z.object({
  locale: LocaleSchema,
  label: z.string().trim().min(1)
});
export type NavigationTranslation = z.infer<typeof NavigationTranslationSchema>;

export const SafeNavigationUrlSchema = z.string().trim().min(1).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Navigation URL must be an internal path or an HTTP(S) URL");

export const UpsertNavigationItemInputSchema = z
  .object({
    url: SafeNavigationUrlSchema,
    sortOrder: z.number().int().default(0),
    enabled: z.boolean().default(true),
    openInNewWindow: z.boolean().default(false),
    translations: z.array(NavigationTranslationSchema).min(1)
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpsertNavigationItemInput = z.infer<typeof UpsertNavigationItemInputSchema>;

export const SiteLayoutSchema = z.enum(["list", "grid", "bento"]);
export type SiteLayout = z.infer<typeof SiteLayoutSchema>;

export const CodeThemeSchema = z.enum(["dracula", "monokai", "github-light", "one-dark"]);
export type CodeTheme = z.infer<typeof CodeThemeSchema>;

export const FontSizeSchema = z.enum(["small", "medium", "large"]);
export type FontSize = z.infer<typeof FontSizeSchema>;

export const SiteThemeSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  homeLayout: SiteLayoutSchema,
  codeTheme: CodeThemeSchema,
  fontSize: FontSizeSchema,
  allowReaderDarkMode: z.boolean()
});
export type SiteTheme = z.infer<typeof SiteThemeSchema>;

export const SiteSettingsTranslationSchema = z.object({
  locale: LocaleSchema,
  siteName: z.string().trim().min(1),
  subtitle: z.string().default(""),
  seoTitle: z.string().default(""),
  seoDescription: z.string().default(""),
  seoKeywords: z.array(z.string().trim().min(1)).default([])
});
export type SiteSettingsTranslation = z.infer<typeof SiteSettingsTranslationSchema>;

export const SiteSocialLinkSchema = z.object({
  label: z.string().trim().min(1),
  url: SafeNavigationUrlSchema,
  sortOrder: z.number().int().default(0)
});
export type SiteSocialLink = z.infer<typeof SiteSocialLinkSchema>;

export const UpsertSiteSettingsInputSchema = z
  .object({
    logoUrl: z.string().trim().default(""),
    faviconUrl: z.string().trim().default(""),
    robotsText: z.string().default("User-agent: *\nAllow: /"),
    theme: SiteThemeSchema,
    translations: z.array(SiteSettingsTranslationSchema).min(1),
    socialLinks: z.array(SiteSocialLinkSchema).default([])
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpsertSiteSettingsInput = z.infer<typeof UpsertSiteSettingsInputSchema>;
