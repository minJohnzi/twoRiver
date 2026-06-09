import type { TranslationChunk, TranslationDraftInput, TranslationDraftResponse } from "@tworiver/shared";
import { translatePostTranslation } from "ztrans";
import type { AppConfig } from "../../config.js";
import { DEFAULT_TRANSLATION_GLOSSARY } from "./defaultGlossary.js";

export class TranslationProviderNotConfiguredError extends Error {
  constructor() {
    super("Translation provider is not configured");
    this.name = "TranslationProviderNotConfiguredError";
  }
}

export class TranslationProviderRequestError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super("Translation provider request failed");
    this.name = "TranslationProviderRequestError";
    this.cause = cause;
  }
}

export async function translatePostDraft(
  config: AppConfig,
  input: TranslationDraftInput
): Promise<TranslationDraftResponse> {
  if (!config.DEEPSEEK_API_KEY) {
    throw new TranslationProviderNotConfiguredError();
  }

  try {
    const result = await translatePostTranslation({
      source: input.source,
      targetLocale: input.targetLocale,
      provider: {
        apiKey: config.DEEPSEEK_API_KEY,
        baseUrl: config.DEEPSEEK_BASE_URL,
        model: config.DEEPSEEK_MODEL,
        temperature: 0.2
      },
      glossary: DEFAULT_TRANSLATION_GLOSSARY,
      validateStructure: true,
      retryOnValidationFailure: true,
      maxRetries: 1
    });

    return {
      translation: {
        locale: input.targetLocale,
        title: result.title,
        summary: result.summary,
        contentMarkdown: result.contentMarkdown,
        seoTitle: result.seoTitle,
        seoDescription: result.seoDescription
      },
      warnings: result.warnings,
      chunks: result.chunks.map(mapChunk)
    };
  } catch (error) {
    throw new TranslationProviderRequestError(error);
  }
}

function mapChunk(chunk: TranslationChunk): TranslationChunk {
  return {
    index: chunk.index,
    inputChars: chunk.inputChars,
    outputChars: chunk.outputChars,
    warnings: chunk.warnings
  };
}
