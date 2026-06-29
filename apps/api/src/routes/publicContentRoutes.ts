import { LocaleSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { listPublicNavigationItems } from "../repositories/navigationRepository.js";
import { getPublicPageBySlug } from "../repositories/pagesRepository.js";
import { getPublicProjectBySlug, listPublicProjects } from "../repositories/projectsRepository.js";
import { getPublicSiteSettings, getSiteSettings } from "../repositories/siteSettingsRepository.js";

interface SlugParams {
  slug: string;
}

interface LocaleQuery {
  locale?: unknown;
}

function getRequestedLocale(query: LocaleQuery): "zh" | "en" {
  const parsed = LocaleSchema.safeParse(query.locale);
  return parsed.success ? parsed.data : "zh";
}

export async function publicContentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: LocaleQuery }>("/api/site", async (request) => {
    const locale = getRequestedLocale(request.query);
    return {
      site: getPublicSiteSettings(app.db, locale),
      navigation: listPublicNavigationItems(app.db, locale)
    };
  });

  app.get("/robots.txt", async (_request, reply) => {
    reply.type("text/plain; charset=utf-8");
    return getSiteSettings(app.db).robotsText;
  });

  app.get<{ Querystring: LocaleQuery }>("/api/projects", async (request) => ({
    projects: listPublicProjects(app.db, getRequestedLocale(request.query))
  }));

  app.get<{ Params: SlugParams; Querystring: LocaleQuery }>("/api/projects/:slug", async (request, reply) => {
    const project = getPublicProjectBySlug(app.db, request.params.slug, getRequestedLocale(request.query));
    if (!project) {
      reply.code(404).send({ message: "Project not found" });
      return;
    }

    return { project };
  });

  app.get<{ Params: SlugParams; Querystring: LocaleQuery }>("/api/pages/:slug", async (request, reply) => {
    const page = getPublicPageBySlug(app.db, request.params.slug, getRequestedLocale(request.query));
    if (!page) {
      reply.code(404).send({ message: "Page not found" });
      return;
    }

    return { page };
  });
}
