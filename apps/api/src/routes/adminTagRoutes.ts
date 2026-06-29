import { CreateTagInputSchema, UpdateTagInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import {
  createTag,
  deleteTag,
  listTags,
  TagConflictError,
  TagReferencedError,
  updateTag
} from "../repositories/tagsRepository.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

export async function adminTagRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/tags", async () => ({
    tags: listTags(app.db)
  }));

  app.post("/api/admin/tags", async (request, reply) => {
    const parsed = CreateTagInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }

    try {
      const tag = createTag(app.db, parsed.data);
      reply.code(201);
      return { tag };
    } catch (error) {
      if (error instanceof TagConflictError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      if (error instanceof Error && error.message === "Invalid tag slug") {
        reply.code(400).send({ message: "Invalid tag input" });
        return;
      }
      throw error;
    }
  });

  app.put<{ Params: IdParams }>("/api/admin/tags/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpdateTagInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }

    try {
      const tag = updateTag(app.db, id, parsed.data);
      if (!tag) {
        reply.code(404).send({ message: "Tag not found" });
        return;
      }
      return { tag };
    } catch (error) {
      if (error instanceof TagConflictError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      if (error instanceof Error && error.message === "Invalid tag slug") {
        reply.code(400).send({ message: "Invalid tag input" });
        return;
      }
      throw error;
    }
  });

  app.delete<{ Params: IdParams }>("/api/admin/tags/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    try {
      if (!deleteTag(app.db, id)) {
        reply.code(404).send({ message: "Tag not found" });
        return;
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof TagReferencedError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      throw error;
    }
  });
}
