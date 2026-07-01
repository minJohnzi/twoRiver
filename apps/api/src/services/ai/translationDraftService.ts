import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  applyArticleTranslationBlocks,
  extractArticleTranslationBlocks,
  projectArticleToMarkdown,
  validateArticleDocument,
  type ArticleTranslatedBlock
} from "@tworiver/content-engine";
import type { ArticleContent, Locale } from "@tworiver/shared";
import { z } from "zod";
import { completeWithAi, type AiClientConfig } from "./aiClient.js";

export interface TranslationDraftSource {
  locale: Locale;
  title: string;
  summary: string;
  content: ArticleContent;
  contentMarkdown: string;
}

export interface TranslationDraftResult {
  locale: Locale;
  title: string;
  summary: string;
  content?: ArticleContent;
  contentMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
}

const MarkdownTranslationSchema = z.object({
  title: z.string().default(""),
  summary: z.string().default(""),
  contentMarkdown: z.string().default("")
});

const TiptapTranslatedSegmentSchema = z.object({
  segmentId: z.string(),
  text: z.string().default("")
});

const TiptapTranslatedBlockSchema = z.object({
  blockId: z.string(),
  segments: z.array(TiptapTranslatedSegmentSchema)
});

const TiptapTranslationSchema = z.object({
  title: z.string().default(""),
  summary: z.string().default(""),
  blocks: z.array(TiptapTranslatedBlockSchema)
});

export class TranslationDraftContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationDraftContractError";
  }
}

export async function draftTranslation(
  config: AiClientConfig,
  markdown: string,
  targetLocale: Locale
): Promise<string> {
  const language = targetLocale === "zh" ? "Chinese" : "English";
  return completeWithAi(config, [
    {
      role: "system",
      content: `Translate technical blog Markdown into ${language}. Preserve Markdown structure and code blocks.`
    },
    {
      role: "user",
      content: markdown
    }
  ]);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText) as unknown;
}

export async function draftPostTranslation(
  config: AiClientConfig,
  source: TranslationDraftSource,
  targetLocale: Locale
): Promise<{ translation: TranslationDraftResult; warnings: string[] }> {
  if (source.content.format === "tiptap") {
    return draftTiptapPostTranslation(
      config,
      source as TranslationDraftSource & { content: Extract<ArticleContent, { format: "tiptap" }> },
      targetLocale
    );
  }

  return draftMarkdownPostTranslation(config, source, targetLocale);
}

async function draftMarkdownPostTranslation(
  config: AiClientConfig,
  source: TranslationDraftSource,
  targetLocale: Locale
): Promise<{ translation: TranslationDraftResult; warnings: string[] }> {
  const language = targetLocale === "zh" ? "Chinese" : "English";
  const response = await completeWithAi(config, [
    {
      role: "system",
      content: [
        `Translate this technical blog draft into ${language}.`,
        "Preserve Markdown structure, code blocks, URLs, and image syntax.",
        'Return only JSON with string fields "title", "summary", and "contentMarkdown".'
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify(source)
    }
  ]);

  try {
    const parsed = MarkdownTranslationSchema.parse(extractJsonObject(response));
    return {
      translation: {
        locale: targetLocale,
        title: parsed.title,
        summary: parsed.summary,
        contentMarkdown: parsed.contentMarkdown,
        seoTitle: null,
        seoDescription: null
      },
      warnings: []
    };
  } catch {
    return {
      translation: {
        locale: targetLocale,
        title: source.title,
        summary: source.summary,
        contentMarkdown: response,
        seoTitle: null,
        seoDescription: null
      },
      warnings: ["AI response was not valid JSON; inserted the raw translated body for review."]
    };
  }
}

async function draftTiptapPostTranslation(
  config: AiClientConfig,
  source: TranslationDraftSource & { content: Extract<ArticleContent, { format: "tiptap" }> },
  targetLocale: Locale
): Promise<{ translation: TranslationDraftResult; warnings: string[] }> {
  const language = targetLocale === "zh" ? "Chinese" : "English";
  const document = validateArticleDocument(source.content.doc);
  const sourceBlocks = extractArticleTranslationBlocks(document);

  const response = await completeWithAi(config, [
    {
      role: "system",
      content: [
        `Translate this technical blog draft into ${language}.`,
        "The body comes from a TipTap document represented as blocks and text segments.",
        "Keep every blockId and segmentId exactly the same and in the same order.",
        "Translate only title, summary, and each segment text.",
        "Do not add, remove, merge, split, rename, or reorder blocks or segments.",
        "Do not translate code snippets, URLs, heading IDs, link targets, or structural metadata.",
        'Return only JSON with string fields "title" and "summary", plus an array field "blocks".',
        'Each block must include "blockId" and "segments"; each segment must include "segmentId" and "text".'
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({
        locale: source.locale,
        title: source.title,
        summary: source.summary,
        blocks: sourceBlocks.map((block) => ({
          blockId: block.blockId,
          nodeType: block.nodeType,
          segments: block.segments.map((segment) => ({
            segmentId: segment.segmentId,
            text: segment.text
          }))
        }))
      })
    }
  ]);

  const parsed = TiptapTranslationSchema.safeParse(safelyExtractJsonObject(response));
  if (!parsed.success) {
    throw new TranslationDraftContractError("AI translation did not return a valid TipTap translation payload.");
  }

  const translatedBlocks = parsed.data.blocks as ArticleTranslatedBlock[];
  let translatedDocument;
  try {
    translatedDocument = applyArticleTranslationBlocks(document, sourceBlocks, translatedBlocks);
  } catch {
    throw new TranslationDraftContractError(
      "AI translation changed the TipTap document structure. The source draft was left unchanged."
    );
  }

  return {
    translation: {
      locale: targetLocale,
      title: parsed.data.title,
      summary: parsed.data.summary,
      content: {
        format: "tiptap",
        schemaVersion: source.content.schemaVersion || ARTICLE_DOCUMENT_SCHEMA_VERSION,
        doc: translatedDocument
      },
      contentMarkdown: projectArticleToMarkdown(translatedDocument),
      seoTitle: null,
      seoDescription: null
    },
    warnings: []
  };
}

function safelyExtractJsonObject(text: string): unknown {
  try {
    return extractJsonObject(text);
  } catch {
    return null;
  }
}
