import { AnalyticsPeriodSchema } from "@tworiver/shared";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { createAnalyticsCsv, getAnalyticsDashboard, recordPageView } from "../services/analyticsService.js";

interface AnalyticsRouteOptions {
  config: AppConfig;
}

interface PeriodQuery {
  period?: unknown;
}

function getPeriod(query: PeriodQuery) {
  const parsed = AnalyticsPeriodSchema.safeParse(Number(query.period ?? 7));
  return parsed.success ? parsed.data : 7;
}

export async function analyticsRoutes(app: FastifyInstance, { config }: AnalyticsRouteOptions) {
  app.post("/api/analytics/page-view", async (request, reply) => {
    const result = recordPageView(app.db, config, request, request.body);
    if (result === "invalid") {
      reply.code(400).send({ message: "Invalid page view input" });
      return;
    }

    reply.code(204).send();
  });

  app.get<{ Querystring: PeriodQuery }>(
    "/api/admin/analytics/summary",
    { preHandler: app.requireAuth },
    async (request) => getAnalyticsDashboard(app.db, getPeriod(request.query))
  );

  app.get<{ Querystring: PeriodQuery }>(
    "/api/admin/analytics/export.csv",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      reply.type("text/csv; charset=utf-8");
      return createAnalyticsCsv(app.db, getPeriod(request.query));
    }
  );
}
