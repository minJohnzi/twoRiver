import { UpsertPostInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import {
  createPost,
  deletePost,
  getAdminPostById,
  listAdminPosts,
  updatePost
} from "../repositories/postsRepository.js";

interface IdParams {
  id: string;
}

function parseId(id: string): number | undefined {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function adminPostRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/admin/posts", async () => ({
    posts: listAdminPosts(app.db)
  }));

  app.post("/api/admin/posts", async (request, reply) => {
    const parsed = UpsertPostInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post input" });
      return;
    }

    const post = createPost(app.db, parsed.data);
    reply.code(201);
    return { post };
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
    const parsed = UpsertPostInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid post input" });
      return;
    }

    const post = updatePost(app.db, id, parsed.data);
    if (!post) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    return { post };
  });

  app.delete<{ Params: IdParams }>("/api/admin/posts/:id", async (request) => {
    const id = parseId(request.params.id);
    if (id) {
      deletePost(app.db, id);
    }

    return { ok: true };
  });
}
