/**
 * HTTP client for ExoSkull API.
 * Used for direct API calls when Tauri invoke isn't suitable
 * (e.g., SSE streaming for chat).
 */

const BASE_URL = "https://exoskull.xyz";

export class ExoSkullClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Stream chat response via SSE.
   * Returns an async generator yielding text chunks.
   */
  async *streamChat(
    messages: { role: string; content: string }[]
  ): AsyncGenerator<string> {
    const response = await fetch(`${BASE_URL}/api/chat/stream`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ messages, stream: true }),
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              yield parsed.content;
            }
          } catch {
            // Non-JSON SSE data, yield as text
            if (data.trim()) yield data;
          }
        }
      }
    }
  }
}
