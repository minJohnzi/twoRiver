import { completeWithAi, type AiClientConfig } from "./aiClient.js";

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
