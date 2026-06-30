import { CreateCategoryInputSchema, DetachTaxonomyInputSchema, UpdateCategoryInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import {
  CategoryConflictError,
  CategoryReferencedError,
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategories,
  updateCategory
} from "../repositories/categoriesRepository.js";
import {
  detachCategoryReferences,
  listCategoryReferences
} from "../repositories/taxonomyReferencesRepository.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

export async function adminCategoryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/categories", async () => ({
    categories: listCategories(app.db)
  }));

  app.get<{ Params: IdParams }>("/api/admin/categories/:id/references", async (request, reply) => {
    const id = parseId(request.params.id);
    const category = id ? getCategoryById(app.db, id) : undefined;
    if (!category) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    return {
      references: listCategoryReferences(app.db, category.id),
      activePostCount: category.activePostCount,
      trashedPostCount: category.trashedPostCount,
      totalPostCount: category.totalPostCount
    };
  });

  app.post<{ Params: IdParams }>("/api/admin/categories/:id/detach", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = DetachTaxonomyInputSchema.safeParse(request.body);
    const category = id ? getCategoryById(app.db, id) : undefined;
    if (!category) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid taxonomy detach input" });
      return;
    }

    const detachedCount = detachCategoryReferences(app.db, category.id, parsed.data.postIds);
    const updated = getCategoryById(app.db, category.id)!;
    return {
      detachedCount,
      activePostCount: updated.activePostCount,
      trashedPostCount: updated.trashedPostCount,
      totalPostCount: updated.totalPostCount
    };
  });

  app.post("/api/admin/categories", async (request, reply) => {
    const parsed = CreateCategoryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }

    try {
      const category = createCategory(app.db, parsed.data);
      reply.code(201);
      return { category };
    } catch (error) {
      if (error instanceof CategoryConflictError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      if (error instanceof Error && error.message === "Invalid category slug") {
        reply.code(400).send({ message: "Invalid category input" });
        return;
      }
      throw error;
    }
  });

  app.put<{ Params: IdParams }>("/api/admin/categories/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpdateCategoryInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid category input" });
      return;
    }

    try {
      const category = updateCategory(app.db, id, parsed.data);
      if (!category) {
        reply.code(404).send({ message: "Category not found" });
        return;
      }
      return { category };
    } catch (error) {
      if (error instanceof CategoryConflictError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      if (error instanceof Error && error.message === "Invalid category slug") {
        reply.code(400).send({ message: "Invalid category input" });
        return;
      }
      throw error;
    }
  });

  app.delete<{ Params: IdParams }>("/api/admin/categories/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Category not found" });
      return;
    }

    try {
      if (!deleteCategory(app.db, id)) {
        reply.code(404).send({ message: "Category not found" });
        return;
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof CategoryReferencedError) {
        reply.code(409).send({ message: error.message });
        return;
      }
      throw error;
    }
  });
}
