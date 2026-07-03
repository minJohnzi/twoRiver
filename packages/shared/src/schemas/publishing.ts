import { ArticleDocumentSchema } from "@tworiver/content-engine/schema";
import { z } from "zod";
import { DateTimeStringSchema, LocaleSchema, PaginationSchema, SlugSchema, hasUniqueLocales } from "./common.js";

// Kept for frontend source compatibility while the admin UI migrates its
// historical hidden branches to archived. The API rejects new hidden writes.
export const PostStatusSchema = z.enum(["draft", "published", "hidden", "archived"]);
export type PostStatus = z.infer<typeof PostStatusSchema>;

const TaxonomyUsageFields = {
  postCount: z.number().int().nonnegative().optional(),
  activePostCount: z.number().int().nonnegative().optional(),
  trashedPostCount: z.number().int().nonnegative().optional(),
  totalPostCount: z.number().int().nonnegative().optional()
};

export const TagSchema = z.object({
  id: z.number().int().positive(),
  slug: SlugSchema,
  name: z.string().min(1),
  ...TaxonomyUsageFields,
  translations: z
    .array(
      z.object({
        locale: LocaleSchema,
        name: z.string().default("")
      })
    )
    .optional()
});
export type Tag = z.infer<typeof TagSchema>;

export const CategorySchema = z.object({
  id: z.number().int().positive(),
  slug: SlugSchema,
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  ...TaxonomyUsageFields,
  translations: z
    .array(
      z.object({
        locale: LocaleSchema,
        name: z.string().default("").optional(),
        description: z.string().default("")
      })
    )
    .optional()
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryTranslationInputSchema = z.object({
  locale: LocaleSchema,
  name: z.string().trim().default(""),
  description: z.string().default("")
});
export const TagTranslationInputSchema = z.object({
  locale: LocaleSchema,
  name: z.string().trim().default("")
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

const TagMutationFields = {
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  translations: z.array(TagTranslationInputSchema)
};

export const CreateTagInputSchema = z
  .object({
    slug: TagMutationFields.slug,
    name: TagMutationFields.name.optional(),
    translations: TagMutationFields.translations.default([])
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;

export const UpdateTagInputSchema = z
  .object({
    slug: TagMutationFields.slug.optional(),
    name: TagMutationFields.name.optional(),
    translations: TagMutationFields.translations.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" })
  .refine((value) => value.translations === undefined || hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type UpdateTagInput = z.infer<typeof UpdateTagInputSchema>;

export const TaxonomyReferenceSchema = z.object({
  id: z.number().int().positive(),
  slug: SlugSchema,
  status: PostStatusSchema,
  deletedAt: DateTimeStringSchema.nullable(),
  titles: z
    .object({
      zh: z.string().min(1).optional(),
      en: z.string().min(1).optional()
    })
    .refine((titles) => Boolean(titles.zh || titles.en), { message: "At least one title is required" })
});
export type TaxonomyReference = z.infer<typeof TaxonomyReferenceSchema>;

export const DetachTaxonomyInputSchema = z.object({
  postIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(100)
    .refine((postIds) => new Set(postIds).size === postIds.length, {
      message: "Post ids must be unique"
    })
});
export type DetachTaxonomyInput = z.infer<typeof DetachTaxonomyInputSchema>;

export const MarkdownArticleContentSchema = z.object({
  format: z.literal("markdown"),
  markdown: z.string()
});
export type MarkdownArticleContent = z.infer<typeof MarkdownArticleContentSchema>;

export const TiptapArticleContentSchema = z.object({
  format: z.literal("tiptap"),
  schemaVersion: z.number().int().positive(),
  doc: ArticleDocumentSchema
});
export type TiptapArticleContent = z.infer<typeof TiptapArticleContentSchema>;

export const ArticleContentSchema = z.discriminatedUnion("format", [
  MarkdownArticleContentSchema,
  TiptapArticleContentSchema
]);
export type ArticleContent = z.infer<typeof ArticleContentSchema>;

export const ArticleLocaleParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  locale: LocaleSchema
});
export type ArticleLocaleParams = z.infer<typeof ArticleLocaleParamsSchema>;

export const ConvertArticleContentInputSchema = z.object({
  expectedUpdatedAt: DateTimeStringSchema
});
export type ConvertArticleContentInput = z.infer<typeof ConvertArticleContentInputSchema>;

export const ConversionIssueSchema = z.object({
  code: z.string(),
  line: z.number().int().positive(),
  message: z.string()
});
export type ConversionIssue = z.infer<typeof ConversionIssueSchema>;

export const MarkdownConversionPreviewSchema = z.object({
  originalMarkdown: z.string(),
  document: ArticleDocumentSchema.nullable(),
  projectedMarkdown: z.string().nullable(),
  canConvert: z.boolean(),
  blockers: z.array(ConversionIssueSchema),
  warnings: z.array(ConversionIssueSchema)
});
export type MarkdownConversionPreview = z.infer<typeof MarkdownConversionPreviewSchema>;

const PostTranslationMetadataSchema = z.object({
  locale: LocaleSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});

export const PostTranslationSchema = PostTranslationMetadataSchema.extend({
  content: ArticleContentSchema.optional(),
  contentMarkdown: z.string().default(""),
  canRestoreMarkdown: z.boolean().default(false),
  restoreMarkdownSnapshotAt: DateTimeStringSchema.nullable().default(null)
}).transform((translation) => {
  const content = translation.content ?? {
    format: "markdown" as const,
    markdown: translation.contentMarkdown
  };
  return {
    ...translation,
    content,
    contentMarkdown: translation.contentMarkdown || (content.format === "markdown" ? content.markdown : "")
  };
});
export type ParsedPostTranslation = z.output<typeof PostTranslationSchema>;
type PostTranslationMetadata = z.output<typeof PostTranslationMetadataSchema>;
export type PostTranslation = PostTranslationMetadata & {
  contentMarkdown: string;
  content?: ArticleContent;
  canRestoreMarkdown?: boolean;
  restoreMarkdownSnapshotAt?: string | null;
};

const CanonicalPostTranslationInputSchema = PostTranslationMetadataSchema.extend({
  content: ArticleContentSchema,
  contentMarkdown: z.string().optional()
})
  .superRefine((translation, ctx) => {
    if (translation.contentMarkdown === undefined) {
      return;
    }

    const expectedContentMarkdown =
      translation.content.format === "markdown" ? translation.content.markdown : "";
    if (translation.contentMarkdown !== expectedContentMarkdown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentMarkdown"],
        message: "contentMarkdown must not conflict with canonical content"
      });
    }
  })
  .transform(({ contentMarkdown: _contentMarkdown, ...translation }) => ({
    ...translation,
    contentMarkdown: translation.content.format === "markdown" ? translation.content.markdown : ""
  }));

const LegacyPostTranslationInputSchema = PostTranslationMetadataSchema.extend({
  contentMarkdown: z.string().default(""),
  content: z.never().optional()
}).transform(({ content: _content, ...translation }) => ({
  ...translation,
  content: {
    format: "markdown" as const,
    markdown: translation.contentMarkdown
  }
}));

export const PostTranslationInputSchema = z.union([
  CanonicalPostTranslationInputSchema,
  LegacyPostTranslationInputSchema
]);
export type ParsedPostTranslationInput = z.output<typeof PostTranslationInputSchema>;
export type PostTranslationInput = PostTranslation;

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
export type ParsedPublicPostListItem = z.output<typeof PublicPostListItemSchema>;
export type PublicPostListItem = Omit<ParsedPublicPostListItem, "translations"> & {
  translations: PostTranslation[];
};

export const PublicPostSchema = PublicPostListItemSchema.extend({
  createdAt: DateTimeStringSchema,
  updatedAt: DateTimeStringSchema
});
export type ParsedPublicPost = z.output<typeof PublicPostSchema>;
export type PublicPost = Omit<ParsedPublicPost, "translations"> & {
  translations: PostTranslation[];
};

export const PaginatedPostsResponseSchema = z.object({
  posts: z.array(PublicPostListItemSchema),
  total: z.number().int().nonnegative(),
  page: PaginationSchema.shape.page,
  limit: PaginationSchema.shape.limit
});
export type ParsedPaginatedPostsResponse = z.output<typeof PaginatedPostsResponseSchema>;
export type PaginatedPostsResponse = Omit<ParsedPaginatedPostsResponse, "posts"> & {
  posts: PublicPostListItem[];
};

export const UpsertPostInputSchema = z
  .object({
    slug: SlugSchema,
    status: PostStatusSchema,
    publishedAt: DateTimeStringSchema.nullable(),
    categorySlug: z.string().min(1).nullable().default(null),
    tagSlugs: z.array(z.string().min(1)).default([]),
    translations: z.array(PostTranslationInputSchema).min(1),
    isPinned: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    coverUrl: z.string().trim().default(""),
    expectedUpdatedAt: DateTimeStringSchema.optional()
  })
  .refine((value) => hasUniqueLocales(value.translations), {
    path: ["translations"],
    message: "Translation locales must be unique"
  });
export type ParsedUpsertPostInput = z.output<typeof UpsertPostInputSchema>;
type UpsertPostInputShape = Omit<ParsedUpsertPostInput, "translations"> & {
  translations: PostTranslationInput[];
};
export type UpsertPostInput = Omit<UpsertPostInputShape, "isPinned" | "isFeatured" | "coverUrl"> &
  Partial<Pick<UpsertPostInputShape, "isPinned" | "isFeatured" | "coverUrl">>;

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

export const TranslationChunkSchema = z.object({
  index: z.number().int().nonnegative(),
  inputChars: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  warnings: z.array(z.string())
});
export type TranslationChunk = z.infer<typeof TranslationChunkSchema>;

export const TranslationDraftSourceSchema = z.object({
  locale: LocaleSchema,
  title: z.string(),
  summary: z.string().default(""),
  content: ArticleContentSchema.optional(),
  contentMarkdown: z.string().default(""),
  seoTitle: z.string().nullable().default(null),
  seoDescription: z.string().nullable().default(null)
});
export type TranslationDraftSource = z.infer<typeof TranslationDraftSourceSchema>;

export const TranslationDraftInputSchema = z.object({
  source: TranslationDraftSourceSchema,
  targetLocale: LocaleSchema
}).strict();
export type TranslationDraftInput = z.infer<typeof TranslationDraftInputSchema>;

export const TranslationDraftResponseSchema = z.object({
  translation: z.object({
    locale: LocaleSchema,
    title: z.string(),
    summary: z.string(),
    content: ArticleContentSchema.optional(),
    contentMarkdown: z.string(),
    seoTitle: z.string().nullable(),
    seoDescription: z.string().nullable()
  }),
  warnings: z.array(z.string()),
  chunks: z.array(TranslationChunkSchema)
});
export type TranslationDraftResponse = z.infer<typeof TranslationDraftResponseSchema>;
