import { UpsertSiteSettingsInputSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import { getSiteSettings, updateSiteSettings } from "../repositories/siteSettingsRepository.js";

export async function adminSiteSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", app.requireCsrf);

  app.get("/api/admin/site-settings", async () => ({
    site: getSiteSettings(app.db)
  }));

  app.put("/api/admin/site-settings", async (request, reply) => {
    const parsed = UpsertSiteSettingsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ message: "Invalid site settings input" });
      return;
    }

    return { site: updateSiteSettings(app.db, parsed.data) };
  });
}
