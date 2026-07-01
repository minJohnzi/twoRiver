import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  ArticleDocumentValidationError,
  extractArticleProse,
  validateArticleDocument
} from "@tworiver/content-engine";
import {
  ArticleContentSchema,
  ArticleLocaleParamsSchema,
  BulkPostActionInputSchema,
  ConvertArticleContentInputSchema,
  MarkdownConversionPreviewSchema,
  PostLifecycleInputSchema,
  UpsertPostInputSchema
} from "@tworiver/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import {
  bulkUpdatePosts,
  convertPostTranslationToTiptap,
  createPost,
  getAdminPostById,
  getPostTranslationState,
  InvalidPostInputError,
  listAdminPosts,
  listTrashedPosts,
  permanentlyDeletePost,
  PostBulkTargetNotFoundError,
  PostSlugConflictError,
  PostTranslationConversionError,
  PostUpdateConflictError,
  TaxonomyNotFoundError,
  restorePost,
  restorePostTranslationMarkdown,
  trashPost,
  updatePostLifecycle,
  updatePost
} from "../repositories/postsRepository.js";
import {
  ArticleContentInputError,
  previewArticleMarkdownConversion
} from "../services/articleContentService.js";
import { AiClientNotConfiguredError, AiProviderError } from "../services/ai/aiClient.js";
import { draftPostTranslation, TranslationDraftContractError } from "../services/ai/translationDraftService.js";
import { removePostImageDirectory } from "../services/uploads/uploadPaths.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

interface AdminPostRouteOptions {
  config: AppConfig;
}

const TranslateDraftSourceSchema = z
  .object({
    locale: z.enum(["zh", "en"]),
    title: z.string().default(""),
    summary: z.string().default(""),
    content: ArticleContentSchema.optional(),
    contentMarkdown: z.string().default("")
  })
  .transform((source) => {
    const content = source.content ?? { format: "markdown" as const, markdown: source.contentMarkdown };
    return {
      ...source,
      content,
      contentMarkdown: content.format === "markdown" ? content.markdown : source.contentMarkdown
    };
  });

const TranslateDraftInputSchema = z.object({
  source: TranslateDraftSourceSchema,
  targetLocale: z.enum(["zh", "en"])
});

const AdminUpsertPostInputSchema = UpsertPostInputSchema.refine((input) => input.status !== "hidden", {
  path: ["status"],
  message: "Hidden status has been replaced by archived"
});
type AdminUpsertPostInput = z.output<typeof AdminUpsertPostInputSchema>;

const AdminPostLifecycleInputSchema = PostLifecycleInputSchema.refine((input) => input.status !== "hidden", {
  path: ["status"],
  message: "Hidden status has been replaced by archived"
});

function sendPostError(error: unknown, reply: FastifyReply, log?: FastifyRequest["log"]): boolean {
  if (error instanceof ArticleContentInputError) {
    log?.warn(
      {
        contentCode: error.code,
        contentPath: error.path
      },
      "Article content validation failed"
    );
    reply.code(400).send({ message: error.publicMessage, code: error.code, path: error.path });
    return true;
  }
  if (error instanceof PostUpdateConflictError) {
    reply.code(409).send({ message: "Post was updated elsewhere" });
    return true;
  }
  if (error instanceof PostTranslationConversionError) {
    reply.code(error.statusCode).send({ message: error.message, code: error.code });
    return true;
  }
  if (error instanceof TaxonomyNotFoundError) {
    reply.code(400).send({ message: error.message });
    return true;
  }
  if (error instanceof InvalidPostInputError) {
    reply.code(400).send({ message: "Invalid post input" });
    return true;
  }
  if (error instanceof PostSlugConflictError) {
    reply.code(409).send({ message: "Post slug already exists" });
    return true;
  }

  return false;
}

function sendArticleConversionError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  postId: number,
  locale: "zh" | "en",
  startedAt: number
): boolean {
  if (error instanceof PostUpdateConflictError) {
    logArticleConversionFailure(request, postId, locale, startedAt, "stale-update");
    reply.code(409).send({ message: "Post was updated elsewhere" });
    return true;
  }
  if (error instanceof PostTranslationConversionError) {
    logArticleConversionFailure(request, postId, locale, startedAt, error.code);
    reply.code(error.statusCode).send({ message: error.message, code: error.code });
    return true;
  }
  if (error instanceof ArticleContentInputError) {
    logArticleConversionFailure(request, postId, locale, startedAt, error.code);
    reply.code(400).send({ message: error.publicMessage, code: error.code, path: error.path });
    return true;
  }
  if (isSqliteBusyError(error)) {
    logArticleConversionFailure(request, postId, locale, startedAt, "database-busy");
    reply.code(503).send({
      message: "Article format conversion is temporarily unavailable",
      code: "database-busy"
    });
    return true;
  }
  return false;
}

function isSqliteBusyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return error.code === "SQLITE_BUSY" || error.code === "SQLITE_BUSY_SNAPSHOT";
}

function logArticleConversionFailure(
  request: FastifyRequest,
  postId: number | null,
  locale: "zh" | "en" | null,
  startedAt: number,
  failureCode: string
): void {
  request.log.warn(
    {
      postId,
      locale,
      durationMs: Date.now() - startedAt,
      failureCode
    },
    "Article format conversion failed"
  );
}

function containsTiptapContent(input: AdminUpsertPostInput): boolean {
  return input.translations.some((translation) => translation.content.format === "tiptap");
}

function rejectDisabledTiptapPublish(
  input: AdminUpsertPostInput,
  config: AppConfig,
  reply: FastifyReply
): boolean {
  if (input.status === "published" && containsTiptapContent(input) && config.TIPTAP_PUBLISH_ENABLED !== true) {
    reply.code(409).send({ message: "TipTap publishing is not enabled" });
    return true;
  }
  return false;
}

function logPostSave(
  request: FastifyRequest,
  input: AdminUpsertPostInput,
  postId: number,
  result: "created" | "updated",
  startedAt: number
): void {
  request.log.info(
    {
      postId,
      locales: input.translations.map((translation) => translation.locale),
      contentFormats: input.translations.map((translation) => translation.content.format),
      schemaVersions: input.translations.map((translation) =>
        translation.content.format === "tiptap" ? translation.content.schemaVersion : null
      ),
      result,
      durationMs: Date.now() - startedAt
    },
    "Post article content saved"
  );
}

function isQuotaOrRateLimitError(error: AiProviderError): boolean {
  return (
    [402, 429].includes(error.status) ||
    /quota|rate limit|too many requests|insufficient balance|billing|credit/i.test(error.providerMessage)
  );
}

export async function adminPostRoutes(app: FastifyInstance, { config }: AdminPostRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/posts", async () => ({
    posts: listAdminPosts(app.db)
  }));

  app.get("/api/admin/posts/trash", async () => ({
    posts: listTrashedPosts(app.db)
  }));

  app.post("/api/admin/posts/bulk", async (request, reply) => {
    const parsed = BulkPostActionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid bulk post action" });
      return;
    }

    try {
      return { updated: bulkUpdatePosts(app.db, parsed.data) };
    } catch (error) {
      if (error instanceof PostBulkTargetNotFoundError) {
        reply.code(404).send({ message: "One or more posts were not found" });
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/posts/translate-draft", async (request, reply) => {
    const parsed = TranslateDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid translation input" });
      return;
    }

    const { source, targetLocale } = parsed.data;
    if (source.locale === targetLocale) {
      reply.code(400).send({ message: "Source and target languages must be different" });
      return;
    }

    try {
      const sourceBody =
        source.content.format === "markdown"
          ? source.content.markdown
          : extractArticleProse(validateArticleDocument(source.content.doc));
      if (!source.title.trim() && !sourceBody.trim()) {
        reply.code(400).send({ message: "Add a title or body before translating" });
        return;
      }

      const aiConfig = {
        ...(config.DEEPSEEK_API_KEY ? { apiKey: config.DEEPSEEK_API_KEY } : {}),
        baseUrl: config.DEEPSEEK_BASE_URL
      };
      return await draftPostTranslation(aiConfig, source, targetLocale);
    } catch (error) {
      if (error instanceof ArticleDocumentValidationError) {
        reply.code(400).send({ message: "TipTap draft content is invalid" });
        return;
      }
      if (error instanceof AiClientNotConfiguredError) {
        reply.code(503).send({ message: "AI translation is not configured" });
        return;
      }
      if (error instanceof AiProviderError) {
        if (isQuotaOrRateLimitError(error)) {
          reply.code(429).send({ message: "AI quota or rate limit reached. Check the API key balance or try again later." });
          return;
        }

        if ([401, 403].includes(error.status)) {
          reply.code(503).send({ message: "AI provider rejected the API key. Check DEEPSEEK_API_KEY." });
          return;
        }

        request.log.error({ error, status: error.status }, "Failed to draft post translation");
        reply.code(502).send({ message: "AI translation provider failed. Try again later." });
        return;
      }
      if (error instanceof TranslationDraftContractError) {
        reply.code(502).send({ message: error.message });
        return;
      }

      request.log.error({ error }, "Failed to draft post translation");
      reply.code(502).send({ message: "AI translation failed" });
    }
  });

  app.post("/api/admin/posts/:id/translations/:locale/tiptap-preview", async (request, reply) => {
    const startedAt = Date.now();
    const params = ArticleLocaleParamsSchema.safeParse(request.params);
    if (!params.success) {
      logArticleConversionFailure(request, null, null, startedAt, "invalid-params");
      reply.code(404).send({ message: "Post translation not found" });
      return;
    }

    const { id: postId, locale } = params.data;
    try {
      const translation = getPostTranslationState(app.db, postId, locale);
      if (!translation) {
        throw new PostTranslationConversionError(
          "translation-not-found",
          "Post translation not found",
          404
        );
      }
      if (translation.content_format === "tiptap") {
        throw new PostTranslationConversionError("already-tiptap", "Translation is already TipTap");
      }

      const preview = MarkdownConversionPreviewSchema.parse(
        previewArticleMarkdownConversion(translation.content_markdown)
      );
      request.log.info(
        {
          postId,
          locale,
          blockerCount: preview.blockers.length,
          warningCount: preview.warnings.length,
          durationMs: Date.now() - startedAt
        },
        "Article format conversion previewed"
      );
      return preview;
    } catch (error) {
      if (sendArticleConversionError(error, request, reply, postId, locale, startedAt)) {
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/posts/:id/translations/:locale/convert-to-tiptap", async (request, reply) => {
    const startedAt = Date.now();
    const params = ArticleLocaleParamsSchema.safeParse(request.params);
    if (!params.success) {
      logArticleConversionFailure(request, null, null, startedAt, "invalid-params");
      reply.code(404).send({ message: "Post translation not found" });
      return;
    }
    const { id: postId, locale } = params.data;
    const input = ConvertArticleContentInputSchema.safeParse(request.body);
    if (!input.success) {
      logArticleConversionFailure(request, postId, locale, startedAt, "invalid-input");
      reply.code(400).send({ message: "Invalid conversion input" });
      return;
    }

    try {
      const post = convertPostTranslationToTiptap(
        app.db,
        postId,
        locale,
        input.data.expectedUpdatedAt
      );
      request.log.info(
        {
          postId,
          locale,
          schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
          durationMs: Date.now() - startedAt
        },
        "Article converted to TipTap"
      );
      return { post };
    } catch (error) {
      if (sendArticleConversionError(error, request, reply, postId, locale, startedAt)) {
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/posts/:id/translations/:locale/restore-markdown", async (request, reply) => {
    const startedAt = Date.now();
    const params = ArticleLocaleParamsSchema.safeParse(request.params);
    if (!params.success) {
      logArticleConversionFailure(request, null, null, startedAt, "invalid-params");
      reply.code(404).send({ message: "Post translation not found" });
      return;
    }
    const { id: postId, locale } = params.data;
    const input = ConvertArticleContentInputSchema.safeParse(request.body);
    if (!input.success) {
      logArticleConversionFailure(request, postId, locale, startedAt, "invalid-input");
      reply.code(400).send({ message: "Invalid conversion input" });
      return;
    }

    try {
      const post = restorePostTranslationMarkdown(
        app.db,
        postId,
        locale,
        input.data.expectedUpdatedAt
      );
      request.log.info(
        {
          postId,
          locale,
          restoreTimestamp: post.updatedAt,
          durationMs: Date.now() - startedAt
        },
        "Article restored to Markdown"
      );
      return { post };
    } catch (error) {
      if (sendArticleConversionError(error, request, reply, postId, locale, startedAt)) {
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/posts", async (request, reply) => {
    const parsed = AdminUpsertPostInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post input" });
      return;
    }
    if (rejectDisabledTiptapPublish(parsed.data, config, reply)) {
      return;
    }

    try {
      const startedAt = Date.now();
      const post = createPost(app.db, parsed.data);
      logPostSave(request, parsed.data, post.id, "created", startedAt);
      reply.code(201);
      return { post };
    } catch (error) {
      if (sendPostError(error, reply, request.log)) {
        return;
      }
      throw error;
    }
  });

  app.get<{ Params: IdParams }>("/api/admin/posts/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    const post = getAdminPostById(app.db, id);
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { post };
  });

  app.put<{ Params: IdParams }>("/api/admin/posts/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = AdminUpsertPostInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post input" });
      return;
    }
    if (rejectDisabledTiptapPublish(parsed.data, config, reply)) {
      return;
    }

    try {
      const startedAt = Date.now();
      const post = updatePost(app.db, id, parsed.data);
      if (!post) {
        reply.code(404).send({ message: "Post not found" });
        return;
      }

      logPostSave(request, parsed.data, post.id, "updated", startedAt);
      return { post };
    } catch (error) {
      if (sendPostError(error, reply, request.log)) {
        return;
      }
      throw error;
    }
  });

  app.patch<{ Params: IdParams }>("/api/admin/posts/:id/lifecycle", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = AdminPostLifecycleInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post lifecycle input" });
      return;
    }

    const post = updatePostLifecycle(app.db, id, parsed.data);
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { post };
  });

  app.delete<{ Params: IdParams }>("/api/admin/posts/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    if (!trashPost(app.db, id)) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { ok: true };
  });

  app.post<{ Params: IdParams }>("/api/admin/posts/:id/restore", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id || !restorePost(app.db, id)) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { post: getAdminPostById(app.db, id) };
  });

  app.delete<{ Params: IdParams }>("/api/admin/posts/:id/permanent", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    const result = permanentlyDeletePost(app.db, id);
    if (!result.deleted && !result.uid) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    if (!result.deleted) {
      reply.code(409).send({ message: "Post must remain in trash for 30 days before permanent deletion" });
      return;
    }

    if (result.uid) {
      try {
        await removePostImageDirectory(config, result.uid);
      } catch (error) {
        request.log.error({ error, postUid: result.uid }, "Failed to clean post image uploads");
      }
    }

    return { ok: true };
  });
}
