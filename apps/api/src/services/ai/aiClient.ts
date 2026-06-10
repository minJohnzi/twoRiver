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

interface AiErrorResponse {
  error?: {
    message?: string;
  };
  message?: string;
}

export class AiClientNotConfiguredError extends Error {
  constructor() {
    super("AI client is not configured");
    this.name = "AiClientNotConfiguredError";
  }
}

export class AiProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly providerMessage: string
  ) {
    super(`AI provider request failed with status ${status}`);
    this.name = "AiProviderError";
  }
}

async function readProviderError(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json().catch(() => undefined)) as AiErrorResponse | undefined;
    return data?.error?.message ?? data?.message ?? response.statusText;
  }

  const text = await response.text().catch(() => "");
  return text.trim() || response.statusText;
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
    throw new AiProviderError(response.status, await readProviderError(response));
  }

  const data = (await response.json()) as AiCompletionResponse;
  return data.choices?.[0]?.message?.content ?? "";
}
