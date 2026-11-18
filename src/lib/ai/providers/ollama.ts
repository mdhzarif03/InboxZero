import { AiProviderError, type AiCompletionRequest, type AiProvider } from "@/lib/ai/types";

/**
 * Local inference through Ollama (http://localhost:11434 by default).
 * Content stays on the host machine. Still treated as untrusted input by prompts.ts.
 */
export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const;
  readonly cloud = false;

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs = 45_000,
  ) {}

  async complete(req: AiCompletionRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          options: { num_predict: req.maxOutputTokens, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new AiProviderError(timeout ? "TIMEOUT" : "UNAVAILABLE", "Ollama is not reachable.");
    }
    if (!res.ok) {
      throw new AiProviderError("UNAVAILABLE", `Ollama returned HTTP ${res.status}.`);
    }
    const data = (await res.json().catch(() => null)) as { message?: { content?: string } } | null;
    const content = data?.message?.content;
    if (typeof content !== "string") {
      throw new AiProviderError("BAD_RESPONSE", "Ollama response had no content.");
    }
    return content;
  }
}
