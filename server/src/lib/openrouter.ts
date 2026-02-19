// OpenRouter removed — unlocked self-hosted fork

export async function callOpenRouter(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): Promise<string> {
  throw new Error("OpenRouter is not configured in self-hosted mode");
}
