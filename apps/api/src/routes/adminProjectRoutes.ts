import { UpsertProjectInputSchema } from "@tworiver/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createProject,
  deleteProject,
  getAdminProjectById,
  InvalidProjectInputError,
  listAdminProjects,
  ProjectSlugConflictError,
  updateProject
} from "../repositories/projectsRepository.js";
import { parseId } from "./parseId.js";

interface IdParams {
  id: string;
}

function sendProjectMutationError(error: unknown, reply: FastifyReply): boolean {
  if (error instanceof ProjectSlugConflictError) {
    reply.code(409).send({ message: error.message });
    return true;
  }
  if (error instanceof InvalidProjectInputError) {
    reply.code(400).send({ message: "Invalid project input" });
    return true;
  }
  return false;
}

export async function adminProjectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/projects", async () => ({
    projects: listAdminProjects(app.db)
  }));

  app.post("/api/admin/projects", async (request, reply) => {
    const parsed = UpsertProjectInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid project input" });
      return;
    }

    try {
      const project = createProject(app.db, parsed.data);
      reply.code(201);
      return { project };
    } catch (error) {
      if (sendProjectMutationError(error, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get<{ Params: IdParams }>("/api/admin/projects/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id) {
      reply.code(404).send({ message: "Project not found" });
      return;
    }

    const project = getAdminProjectById(app.db, id);
    if (!project) {
      reply.code(404).send({ message: "Project not found" });
      return;
    }

    return { project };
  });

  app.put<{ Params: IdParams }>("/api/admin/projects/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const parsed = UpsertProjectInputSchema.safeParse(request.body);
    if (!id) {
      reply.code(404).send({ message: "Project not found" });
      return;
    }
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid project input" });
      return;
    }

    try {
      const project = updateProject(app.db, id, parsed.data);
      if (!project) {
        reply.code(404).send({ message: "Project not found" });
        return;
      }
      return { project };
    } catch (error) {
      if (sendProjectMutationError(error, reply)) {
        return;
      }
      throw error;
    }
  });

  app.delete<{ Params: IdParams }>("/api/admin/projects/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    if (!id || !deleteProject(app.db, id)) {
      reply.code(404).send({ message: "Project not found" });
      return;
    }

    return { ok: true };
  });
}
