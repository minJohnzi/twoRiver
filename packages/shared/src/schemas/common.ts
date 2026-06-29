import { z } from "zod";

export const DateTimeStringSchema = z.string().datetime();

export const LocaleSchema = z.enum(["zh", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const SlugSchema = z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export function hasUniqueLocales(values: ReadonlyArray<{ locale: Locale }>): boolean {
  return new Set(values.map((value) => value.locale)).size === values.length;
}
