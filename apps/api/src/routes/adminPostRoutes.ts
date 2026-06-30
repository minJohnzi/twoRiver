import { BulkPostActionInputSchema, PostLifecycleInputSchema, UpsertPostInputSchema } from "@tworiver/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import {
  bulkUpdatePosts,
  createPost,
  getAdminPostById,
  InvalidPostInputError,
  listAdminPosts,
  listTrashedPosts,
  permanentlyDeletePost,
  PostBulkTargetNotFoundError,
  PostSlugConflictError,
  TaxonomyNotFoundError,
  restorePost,
  trashPost,
  updatePostLifecycle,
  updatePost
} from "../repositories/postsRepository.js";
import { AiClientNotConfiguredError, AiProviderError } from "../services/ai/aiClient.js";
import { draftPostTranslation } from "../services/ai/translationDraftService.js";
import { removePostImageDirectory } from "../services/uploads/uploadPaths.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

interface AdminPostRouteOptions {
  config: AppConfig;
}

const TranslateDraftInputSchema = z.object({
  source: z.object({
    locale: z.enum(["zh", "en"]),
    title: z.string().default(""),
    summary: z.string().default(""),
    contentMarkdown: z.string().default("")
  }),
  targetLocale: z.enum(["zh", "en"])
});

const AdminUpsertPostInputSchema = UpsertPostInputSchema.refine((input) => input.status !== "hidden", {
  path: ["status"],
  message: "Hidden status has been replaced by archived"
});

const AdminPostLifecycleInputSchema = PostLifecycleInputSchema.refine((input) => input.status !== "hidden", {
  path: ["status"],
  message: "Hidden status has been replaced by archived"
});

function sendPostError(error: unknown, reply: FastifyReply): boolean {
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

    if (!source.title.trim() && !source.contentMarkdown.trim()) {
      reply.code(400).send({ message: "Add a title or body before translating" });
      return;
    }

    try {
      const aiConfig = {
        ...(config.DEEPSEEK_API_KEY ? { apiKey: config.DEEPSEEK_API_KEY } : {}),
        baseUrl: config.DEEPSEEK_BASE_URL
      };
      return await draftPostTranslation(aiConfig, source, targetLocale);
    } catch (error) {
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

      request.log.error({ error }, "Failed to draft post translation");
      reply.code(502).send({ message: "AI translation failed" });
    }
  });

  app.post("/api/admin/posts", async (request, reply) => {
    const parsed = AdminUpsertPostInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post input" });
      return;
    }

    try {
      const post = createPost(app.db, parsed.data);
      reply.code(201);
      return { post };
    } catch (error) {
      if (sendPostError(error, reply)) {
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

    try {
      const post = updatePost(app.db, id, parsed.data);
      if (!post) {
        reply.code(404).send({ message: "Post not found" });
        return;
      }

      return { post };
    } catch (error) {
      if (sendPostError(error, reply)) {
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
