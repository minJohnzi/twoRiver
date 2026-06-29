import { z } from "zod";
import { LocaleSchema } from "./common.js";

export const AnalyticsContentTypeSchema = z.enum([
  "home",
  "post",
  "page",
  "project",
  "category",
  "tag",
  "about",
  "not-found"
]);
export type AnalyticsContentType = z.infer<typeof AnalyticsContentTypeSchema>;

export const PageViewInputSchema = z.object({
  path: z.string().startsWith("/").max(500),
  contentType: AnalyticsContentTypeSchema,
  contentId: z.number().int().positive().nullable().optional(),
  locale: LocaleSchema
});
export type PageViewInput = z.infer<typeof PageViewInputSchema>;

export const AnalyticsPeriodSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);
export type AnalyticsPeriod = z.infer<typeof AnalyticsPeriodSchema>;
