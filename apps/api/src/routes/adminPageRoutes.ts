import { UpsertPageInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import {
  createPage,
  getAdminPageById,
  InvalidPageInputError,
  listAdminPages,
  PageSlugConflictError,
  trashPage,
  updatePage
} from "../repositories/pagesRepository.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

function sendPageMutationError(error: unknown, reply: { code: (statusCode: number) => { send: (payload: unknown) => void } }): boolean {
  if (error instanceof PageSlugConflictError) {
    reply.code(409).send({ message: error.message });
    return true;
  }
  if (error instanceof InvalidPageInputError) {
    reply.code(400).send({ message: "Invalid page input" });
    return true;
  }
  return false;
}

export async function adminPageRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/pages", async () => ({
    pages: listAdminPages(app.db)
  }));

  app.post("/api/admin/pages", async (request, reply) => {
    const parsed = UpsertPageInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid page input" });
      return;
    }

    try {
      const page = createPage(app.db, parsed.data);
      reply.code(201);
      return { page };
    } catch (error) {
      if (sendPageMutationError(error, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get<{ Params: IdParams }>("/api/admin/pages/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Page not found" });
      return;
    }

    const page = getAdminPageById(app.db, id);
    if (!page) {
      reply.code(404).send({ message: "Page not found" });
      return;
    }

    return { page };
  });

  app.put<{ Params: IdParams }>("/api/admin/pages/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpsertPageInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Page not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid page input" });
      return;
    }

    try {
      const page = updatePage(app.db, id, parsed.data);
      if (!page) {
        reply.code(404).send({ message: "Page not found" });
        return;
      }
      return { page };
    } catch (error) {
      if (sendPageMutationError(error, reply)) {
        return;
      }
      throw error;
    }
  });

  app.delete<{ Params: IdParams }>("/api/admin/pages/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id || !trashPage(app.db, id)) {
      reply.code(404).send({ message: "Page not found" });
      return;
    }

    return { ok: true };
  });
}
