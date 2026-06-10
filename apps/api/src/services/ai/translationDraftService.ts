import { completeWithAi, type AiClientConfig } from "./aiClient.js";

export interface TranslationDraftSource {
  locale: "zh" | "en";
  title: string;
  summary: string;
  contentMarkdown: string;
}

export interface TranslationDraftResult {
  locale: "zh" | "en";
  title: string;
  summary: string;
  contentMarkdown: string;
  seoTitle: string | null;
  seoDescription: string | null;
}

export async function draftTranslation(
  config: AiClientConfig,
  markdown: string,
  targetLocale: "zh" | "en"
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function draftPostTranslation(
  config: AiClientConfig,
  source: TranslationDraftSource,
  targetLocale: "zh" | "en"
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
    const parsed = extractJsonObject(response) as Record<string, unknown>;
    return {
      translation: {
        locale: targetLocale,
        title: asString(parsed.title),
        summary: asString(parsed.summary),
        contentMarkdown: asString(parsed.contentMarkdown),
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
