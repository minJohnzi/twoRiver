import { z } from "zod";

export const DateTimeStringSchema = z.string().datetime();

export const LocaleSchema = z.enum(["zh", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const PostStatusSchema = z.enum(["draft", "published"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const TagSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1)
});
export type Tag = z.infer<typeof TagSchema>;

export const CategorySchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  name: z.string().min(1)
});
export type Category = z.infer<typeof CategorySchema>;

export const PostTranslationSchema = z.object({
  locale: LocaleSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  contentMarkdown: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});
export type PostTranslation = z.infer<typeof PostTranslationSchema>;

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

export const PublicPostListItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  status: PostStatusSchema,
  publishedAt: DateTimeStringSchema.nullable(),
  category: CategorySchema.nullable(),
  tags: z.array(TagSchema),
  translations: z.array(PostTranslationSchema)
});
export type PublicPostListItem = z.infer<typeof PublicPostListItemSchema>;

export const PublicPostSchema = PublicPostListItemSchema.extend({
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema
});
export type PublicPost = z.infer<typeof PublicPostSchema>;

export const AboutProfileSchema = z.object({
  displayName: z.string().default(""),
  headline: z.string().default(""),
  bio: z.string().default(""),
  avatarUrl: z.string().default(""),
  githubUrl: z.string().default(""),
  email: z.string().default(""),
  socialLinks: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().min(1)
      })
    )
    .default([]),
  updatedAt: DateTimeStringSchema.nullable().default(null)
});
export type AboutProfile = z.infer<typeof AboutProfileSchema>;

export const UpsertAboutProfileInputSchema = AboutProfileSchema.omit({ updatedAt: true }).extend({
  socialLinks: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().min(1)
      })
    )
    .default([])
});
export type UpsertAboutProfileInput = z.infer<typeof UpsertAboutProfileInputSchema>;

export const UpsertPostInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: PostStatusSchema,
  publishedAt: DateTimeStringSchema.nullable(),
  categorySlug: z.string().min(1).nullable().default(null),
  tagSlugs: z.array(z.string().min(1)).default([]),
  translations: z.array(PostTranslationSchema).min(1)
});
export type UpsertPostInput = z.infer<typeof UpsertPostInputSchema>;

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
