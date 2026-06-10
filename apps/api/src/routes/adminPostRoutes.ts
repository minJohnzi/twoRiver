import { UpsertPostInputSchema } from "@tworiver/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import {
  createPost,
  deletePostWithUid,
  getAdminPostById,
  InvalidPostInputError,
  listAdminPosts,
  PostSlugConflictError,
  updatePost
} from "../repositories/postsRepository.js";
import { removePostImageDirectory } from "../services/uploads/uploadPaths.js";

interface IdParams {
  id: string;
}

interface AdminPostRouteOptions {
  config: AppConfig;
}

function parseId(id: string): number | undefined {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function sendPostError(error: unknown, reply: FastifyReply): boolean {
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

export async function adminPostRoutes(app: FastifyInstance, { config }: AdminPostRouteOptions) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/posts", async () => ({
    posts: listAdminPosts(app.db)
  }));

  app.post("/api/admin/posts", async (request, reply) => {
    const parsed = UpsertPostInputSchema.safeParse(request.body);
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
    const parsed = UpsertPostInputSchema.safeParse(request.body);
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

  app.delete<{ Params: IdParams }>("/api/admin/posts/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Post not found" });
      return;
    }

    const result = deletePostWithUid(app.db, id);
    if (!result.deleted) {
      reply.code(404).send({ message: "Post not found" });
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
