import { TranslationDraftInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import {
  translatePostDraft,
  TranslationProviderNotConfiguredError,
  TranslationProviderRequestError
} from "../services/ai/postTranslationService.js";

interface AdminTranslationRoutesOptions {
  config: AppConfig;
}

export async function adminTranslationRoutes(app: FastifyInstance, { config }: AdminTranslationRoutesOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.post("/api/admin/posts/translate-draft", async (request, reply) => {
    const parsed = TranslationDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid translation input" });
      return;
    }

    const { source, targetLocale } = parsed.data;
    if (source.locale === targetLocale) {
      reply.code(400).send({ message: "Source and target locales must be different" });
      return;
    }

    if (!source.title.trim() && !source.contentMarkdown.trim()) {
      reply.code(400).send({ message: "Source title or body is required" });
      return;
    }

    try {
      return await translatePostDraft(config, parsed.data);
    } catch (error) {
      if (error instanceof TranslationProviderNotConfiguredError) {
        reply.code(503).send({ message: "Translation provider is not configured" });
        return;
      }

      if (error instanceof TranslationProviderRequestError) {
        request.log.error({ error }, "Translation provider request failed");
        reply.code(502).send({ message: "Translation provider request failed" });
        return;
      }

      throw error;
    }
  });
}
