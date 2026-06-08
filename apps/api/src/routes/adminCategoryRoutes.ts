import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { getCategoryById, getCategoryBySlug, listCategories } from "../repositories/categoriesRepository.js";
import { normalizeSlug } from "../services/slugService.js";

interface IdParams {
  id: string;
}

const CreateCategoryInputSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).optional()
});

const UpdateCategoryInputSchema = z.object({
  slug: z.string().min(1).optional(),
  name: z.string().min(1).optional()
});

function parseId(id: string): number | undefined {
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function adminCategoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/categories", async () => ({
    categories: listCategories(app.db)
  }));

  app.post("/api/admin/categories", async (request, reply) => {
    const parsed = CreateCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }

    const slug = normalizeSlug(parsed.data.slug);
    if (!slug) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }
    if (getCategoryBySlug(app.db, slug)) {
      reply.code(409).send({ message: "Category already exists" });
      return;
    }

    const name = parsed.data.name ?? slug;
    const now = new Date().toISOString();
    app.db
      .prepare(
        `INSERT INTO categories (slug, name, updated_at)
         VALUES (?, ?, ?)`
      )
      .run(slug, name, now);

    const category = getCategoryBySlug(app.db, slug);
    reply.code(201);
    return { category };
  });

  app.put<{ Params: IdParams }>("/api/admin/categories/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpdateCategoryInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }
    if (!parsed.success || (!parsed.data.slug && !parsed.data.name)) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }

    const existing = getCategoryById(app.db, id);
    if (!existing) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    const slug = parsed.data.slug === undefined ? existing.slug : normalizeSlug(parsed.data.slug);
    if (!slug) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }
    const conflictingCategory = getCategoryBySlug(app.db, slug);
    if (conflictingCategory && conflictingCategory.id !== id) {
      reply.code(409).send({ message: "Category already exists" });
      return;
    }

    const name = parsed.data.name ?? existing.name;
    const now = new Date().toISOString();
    app.db.prepare("UPDATE categories SET slug = ?, name = ?, updated_at = ? WHERE id = ?").run(slug, name, now, id);

    return { category: getCategoryById(app.db, id) };
  });

  app.delete<{ Params: IdParams }>("/api/admin/categories/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    const result = app.db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    if (result.changes === 0) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    return { ok: true };
  });
}
