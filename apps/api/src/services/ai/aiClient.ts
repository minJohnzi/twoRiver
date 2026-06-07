export interface AiClientConfig {
  apiKey?: string;
  baseUrl: string;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AiCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class AiClientNotConfiguredError extends Error {
  constructor() {
    super("AI client is not configured");
    this.name = "AiClientNotConfiguredError";
  }
}

export async function completeWithAi(config: AiClientConfig, messages: AiMessage[]): Promise<string> {
  if (!config.apiKey) {
    throw new AiClientNotConfiguredError();
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`AI request failed with status ${response.status}`);
  }

  const data = (await response.json()) as AiCompletionResponse;
  return data.choices?.[0]?.message?.content ?? "";
}
