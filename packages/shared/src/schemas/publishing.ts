import { z } from "zod";
import { DateTimeStringSchema, LocaleSchema, PaginationSchema, SlugSchema, hasUniqueLocales } from "./common.js";

// Kept for frontend source compatibility while the admin UI migrates its
// historical hidden branches to archived. The API rejects new hidden writes.
export const PostStatusSchema = z.enum(["draft", "published", "hidden", "archived"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const TagSchema = z.object({
  id: z.number().int().positive(),
  slug: SlugSchema,
  name: z.string().min(1),
  postCount: z.number().int().nonnegative().optional()
});
export type Tag = z.infer<typeof TagSchema>;

export const CategorySchema = z.object({
  id: z.number().int().positive(),
  slug: SlugSchema,
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  postCount: z.number().int().nonnegative().optional(),
  translations: z
    .array(
      z.object({
        locale: LocaleSchema,
        description: z.string().default("")
      })
    )
    .optional()
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryTranslationInputSchema = z.object({
  locale: LocaleSchema,
  description: z.string().default("")
});

const CategoryMutationFields = {
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
  translations: z.array(CategoryTranslationInputSchema)
};

export const CreateCategoryInputSchema = z
  .object({
    slug: CategoryMutationFields.slug,
    name: CategoryMutationFields.name.optional(),
    sortOrder: CategoryMutationFields.sortOrder.default(0),
    translations: CategoryMutationFields.translations.default([])
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export const UpdateCategoryInputSchema = z
  .object({
    slug: CategoryMutationFields.slug.optional(),
    name: CategoryMutationFields.name.optional(),
    sortOrder: CategoryMutationFields.sortOrder.optional(),
    translations: CategoryMutationFields.translations.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" })
  .refine((value) => value.translations === undefined || hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInputSchema>;

export const CreateTagInputSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1).optional()
});
export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;

export const UpdateTagInputSchema = z
  .object({
    slug: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });
export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>;

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
  uid: z.string().regex(/^p_[0-9a-f-]{36}$/),
  slug: SlugSchema,
  status: PostStatusSchema,
  publishedAt: DateTimeStringSchema.nullable(),
  isPinned: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  coverUrl: z.string().optional(),
  deletedAt: DateTimeStringSchema.nullable().optional(),
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

export const PaginatedPostsResponseSchema = z.object({
  posts: z.array(PublicPostListItemSchema),
  total: z.number().int().nonnegative(),
  page: PaginationSchema.shape.page,
  limit: PaginationSchema.shape.limit
});
export type PaginatedPostsResponse = z.infer<typeof PaginatedPostsResponseSchema>;

export const UpsertPostInputSchema = z
  .object({
    slug: SlugSchema,
    status: PostStatusSchema,
    publishedAt: DateTimeStringSchema.nullable(),
    categorySlug: z.string().min(1).nullable().default(null),
    tagSlugs: z.array(z.string().min(1)).default([]),
    translations: z.array(PostTranslationSchema).min(1),
    isPinned: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    coverUrl: z.string().trim().default("")
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type ParsedUpsertPostInput = z.output<typeof UpsertPostInputSchema>;
export type UpsertPostInput = Omit<ParsedUpsertPostInput, "isPinned" | "isFeatured" | "coverUrl"> &
  Partial<Pick<ParsedUpsertPostInput, "isPinned" | "isFeatured" | "coverUrl">>;

export const PostLifecycleInputSchema = z.object({
  status: PostStatusSchema.optional(),
  isPinned: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  coverUrl: z.string().trim().optional()
});
export type PostLifecycleInput = z.infer<typeof PostLifecycleInputSchema>;

export const BulkPostActionInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
  action: z.enum(["archive", "trash", "restore"])
});
export type BulkPostActionInput = z.infer<typeof BulkPostActionInputSchema>;

export const LoginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
