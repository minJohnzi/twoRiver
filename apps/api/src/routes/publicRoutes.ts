import { PaginationSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { getCategoryBySlug, listCategories } from "../repositories/categoriesRepository.js";
import { normalizeSlug } from "../services/slugService.js";
import { getTagBySlug, listTags } from "../repositories/tagsRepository.js";
import {
  getPublicPostBySlug,
  listPublicPostsPage,
  listPublicPostsByCategorySlug,
  listPublicPostsByTagSlug
} from "../repositories/postsRepository.js";

interface SlugParams {
  slug: string;
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/api/posts", async (request, reply) => {
    const parsed = PaginationSchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid pagination input" });
      return;
    }

    return listPublicPostsPage(app.db, parsed.data.page, parsed.data.limit);
  });

  app.get<{ Params: SlugParams }>("/api/posts/:slug", async (request, reply) => {
    const post = getPublicPostBySlug(app.db, normalizeSlug(request.params.slug));
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { post };
  });

  app.get("/api/tags", async () => ({
    tags: listTags(app.db)
  }));

  app.get<{ Params: SlugParams }>("/api/tags/:slug", async (request, reply) => {
    const slug = normalizeSlug(request.params.slug);
    const tag = getTagBySlug(app.db, slug);
    if (!tag) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    return {
      tag,
      posts: listPublicPostsByTagSlug(app.db, slug)
    };
  });

  app.get("/api/categories", async () => ({
    categories: listCategories(app.db)
  }));

  app.get<{ Params: SlugParams }>("/api/categories/:slug", async (request, reply) => {
    const slug = normalizeSlug(request.params.slug);
    const category = getCategoryBySlug(app.db, slug);
    if (!category) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    return {
      category,
      posts: listPublicPostsByCategorySlug(app.db, slug)
    };
  });
}
