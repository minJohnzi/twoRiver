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

export const PostTranslationSchema = z.object({
  locale: LocaleSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  contentMarkdown: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});
export type PostTranslation = z.infer<typeof PostTranslationSchema>;

export const PublicPostListItemSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().min(1),
  status: PostStatusSchema,
  publishedAt: DateTimeStringSchema.nullable(),
  tags: z.array(TagSchema),
  translations: z.array(PostTranslationSchema)
});
export type PublicPostListItem = z.infer<typeof PublicPostListItemSchema>;

export const PublicPostSchema = PublicPostListItemSchema.extend({
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema
});
export type PublicPost = z.infer<typeof PublicPostSchema>;

export const UpsertPostInputSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: PostStatusSchema,
  publishedAt: DateTimeStringSchema.nullable(),
  tagSlugs: z.array(z.string().min(1)).default([]),
  translations: z.array(PostTranslationSchema).min(1)
});
export type UpsertPostInput = z.infer<typeof UpsertPostInputSchema>;

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
