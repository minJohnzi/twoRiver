import { UpsertNavigationItemInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createNavigationItem,
  deleteNavigationItem,
  getNavigationItemById,
  listAdminNavigationItems,
  reorderNavigationItems,
  updateNavigationItem
} from "../repositories/navigationRepository.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

const ReorderNavigationInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1)
});

export async function adminNavigationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/navigation", async () => ({
    items: listAdminNavigationItems(app.db)
  }));

  app.post("/api/admin/navigation/reorder", async (request, reply) => {
    const parsed = ReorderNavigationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid navigation order" });
      return;
    }

    try {
      return { items: reorderNavigationItems(app.db, parsed.data.ids) };
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid navigation order") {
        reply.code(400).send({ message: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/admin/navigation", async (request, reply) => {
    const parsed = UpsertNavigationItemInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid navigation input" });
      return;
    }

    const item = createNavigationItem(app.db, parsed.data);
    reply.code(201);
    return { item };
  });

  app.get<{ Params: IdParams }>("/api/admin/navigation/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Navigation item not found" });
      return;
    }

    const item = getNavigationItemById(app.db, id);
    if (!item) {
      reply.code(404).send({ message: "Navigation item not found" });
      return;
    }

    return { item };
  });

  app.put<{ Params: IdParams }>("/api/admin/navigation/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpsertNavigationItemInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Navigation item not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid navigation input" });
      return;
    }

    const item = updateNavigationItem(app.db, id, parsed.data);
    if (!item) {
      reply.code(404).send({ message: "Navigation item not found" });
      return;
    }

    return { item };
  });

  app.delete<{ Params: IdParams }>("/api/admin/navigation/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id || !deleteNavigationItem(app.db, id)) {
      reply.code(404).send({ message: "Navigation item not found" });
      return;
    }

    return { ok: true };
  });
}
