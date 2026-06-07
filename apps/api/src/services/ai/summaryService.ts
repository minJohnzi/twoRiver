import { completeWithAi, type AiClientConfig } from "./aiClient.js";

export async function generateSummary(
  config: AiClientConfig,
  markdown: string,
  locale: "zh" | "en"
): Promise<string> {
  const language = locale === "zh" ? "Chinese" : "English";
  return completeWithAi(config, [
    {
      role: "system",
      content: `Write concise ${language} summaries for technical blog posts.`
    },
    {
      role: "user",
      content: markdown
    }
  ]);
}
