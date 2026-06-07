import type { FastifyInstance } from "fastify";
import { normalizeSlug } from "../services/slugService.js";
import { listTags } from "../repositories/tagsRepository.js";
import { getPublicPostBySlug, listPublicPosts } from "../repositories/postsRepository.js";

interface SlugParams {
  slug: string;
}

export async function publicRoutes(app: FastifyInstance) {
  app.get("/api/posts", async () => ({
    posts: listPublicPosts(app.db)
  }));

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
}
