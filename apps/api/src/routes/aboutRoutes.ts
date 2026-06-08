import { UpsertAboutProfileInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { getAboutProfile, updateAboutProfile } from "../repositories/aboutRepository.js";

export async function publicAboutRoutes(app: FastifyInstance) {
  app.get("/api/about", async () => ({
    about: getAboutProfile(app.db)
  }));
}

export async function adminAboutRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/api/admin/about", async () => ({
    about: getAboutProfile(app.db)
  }));

  app.put("/api/admin/about", async (request, reply) => {
    const parsed = UpsertAboutProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid about profile input" });
      return;
    }

    return {
      about: updateAboutProfile(app.db, parsed.data)
    };
  });
}
