import { completeWithAi, type AiClientConfig } from "./aiClient.js";

export async function suggestTags(config: AiClientConfig, markdown: string): Promise<string[]> {
  const response = await completeWithAi(config, [
    {
      role: "system",
      content:
        "Suggest 3 to 6 concise technical blog tags. Return only comma-separated lowercase slugs."
    },
    {
      role: "user",
      content: markdown
    }
  ]);

  return response
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
