import { z } from "zod";

export type ArticleMarkType = "bold" | "italic" | "strike" | "code" | "link";

export interface ArticleMark {
  type: ArticleMarkType;
  attrs?: Record<string, unknown>;
}

export interface ArticleNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ArticleNode[];
  marks?: ArticleMark[];
  text?: string;
}

export interface ArticleDocument extends ArticleNode {
  type: "doc";
  content: ArticleNode[];
}

export type ArticleDocumentValidationPath = Array<string | number>;

export class ArticleDocumentValidationError extends Error {
  readonly code: string;
  readonly path: ArticleDocumentValidationPath;

  constructor(code: string, path: ArticleDocumentValidationPath = [], message = code) {
    super(path.length > 0 ? `${message} at ${formatValidationPath(path)}` : message);
    this.name = "ArticleDocumentValidationError";
    this.code = code;
    this.path = path;
  }
}

function formatValidationPath(path: ArticleDocumentValidationPath): string {
  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".");
}

const ArticleMarkShape = z
  .object({
    type: z.string().min(1),
    attrs: z.record(z.unknown()).optional()
  })
  .strict();

const ArticleNodeShape: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      type: z.string().min(1),
      attrs: z.record(z.unknown()).optional(),
      content: z.array(ArticleNodeShape).optional(),
      marks: z.array(ArticleMarkShape).optional(),
      text: z.string().optional()
    })
    .strict()
);

export const ArticleDocumentSchema = z
  .object({
    type: z.literal("doc"),
    attrs: z.record(z.unknown()).optional(),
    content: z.array(ArticleNodeShape),
    marks: z.array(ArticleMarkShape).optional(),
    text: z.string().optional()
  })
  .strict() as unknown as z.ZodType<ArticleDocument>;

export const ARTICLE_DOCUMENT_SCHEMA_VERSION = 1 as const;
