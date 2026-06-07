import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { listTags } from "../repositories/tagsRepository.js";
import { normalizeSlug } from "../services/slugService.js";

interface IdParams {
  id: string;
}

interface TagRow {
  id: number;
  slug: string;
  name: string;
}

const CreateTagInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).optional()
});

const UpdateTagInputSchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional()
});

function parseId(id: string): number | undefined {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function mapTag(row: TagRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name
  };
}

function getTagById(app: FastifyInstance, id: number) {
  const row = app.db.prepare("SELECT id, slug, name FROM tags WHERE id = ?").get(id) as TagRow | undefined;
  return row ? mapTag(row) : undefined;
}

function getTagBySlug(app: FastifyInstance, slug: string) {
  const row = app.db.prepare("SELECT id, slug, name FROM tags WHERE slug = ?").get(slug) as TagRow | undefined;
  return row ? mapTag(row) : undefined;
}

export async function adminTagRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

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
    if (getTagBySlug(app, slug)) {
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

    const row = app.db.prepare("SELECT id, slug, name FROM tags WHERE slug = ?").get(slug) as TagRow;
    reply.code(201);
    return {
      tag: mapTag(row)
    };
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

    const existing = getTagById(app, id);
    if (!existing) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    const slug = parsed.data.slug === undefined ? existing.slug : normalizeSlug(parsed.data.slug);
    if (!slug) {
      reply.code(400).send({ message: "Invalid tag input" });
      return;
    }
    const conflictingTag = getTagBySlug(app, slug);
    if (conflictingTag && conflictingTag.id !== id) {
      reply.code(409).send({ message: "Tag already exists" });
      return;
    }

    const name = parsed.data.name ?? existing.name;
    const now = new Date().toISOString();
    app.db.prepare("UPDATE tags SET slug = ?, name = ?, updated_at = ? WHERE id = ?").run(slug, name, now, id);

    const tag = getTagById(app, id);
    if (!tag) {
      reply.code(404).send({ message: "Tag not found" });
      return;
    }

    return { tag };
  });

  app.delete<{ Params: IdParams }>("/api/admin/tags/:id", async (request) => {
    const id = parseId(request.params.id);
    if (id) {
      app.db.prepare("DELETE FROM tags WHERE id = ?").run(id);
    }

    return { ok: true };
  });
}
