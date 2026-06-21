import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getTagById, getTagBySlug, listTags } from "../repositories/tagsRepository.js";
import { normalizeSlug } from "../services/slugService.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

const CreateTagInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).optional()
});

const UpdateTagInputSchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional()
});

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

    const slug = normalizeSlug(parsed.data.slug);
    if (!slug) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }
    if (getTagBySlug(app.db, slug)) {
      reply.code(409).send({ message: "Tag already exists" });
      return;
    }

    const name = parsed.data.name ?? slug;
    const now = new Date().toISOString();
    app.db
      .prepare(
        `INSERT INTO tags (slug, name, updated_at)
         VALUES (?, ?, ?)`
      )
      .run(slug, name, now);

    const tag = getTagBySlug(app.db, slug);
    reply.code(201);
    return { tag };
  });

  app.put<{ Params: IdParams }>("/api/admin/tags/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpdateTagInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }
    if (!parsed.success || (!parsed.data.slug && !parsed.data.name)) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }

    const existing = getTagById(app.db, id);
    if (!existing) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    const slug = parsed.data.slug === undefined ? existing.slug : normalizeSlug(parsed.data.slug);
    if (!slug) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }
    const conflictingTag = getTagBySlug(app.db, slug);
    if (conflictingTag && conflictingTag.id !== id) {
      reply.code(409).send({ message: "Tag already exists" });
      return;
    }

    const name = parsed.data.name ?? existing.name;
    const now = new Date().toISOString();
    app.db.prepare("UPDATE tags SET slug = ?, name = ?, updated_at = ? WHERE id = ?").run(slug, name, now, id);

    const tag = getTagById(app.db, id);
    if (!tag) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    return { tag };
  });

  app.delete<{ Params: IdParams }>("/api/admin/tags/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    const result = app.db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    if (result.changes === 0) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    return { ok: true };
  });
}
