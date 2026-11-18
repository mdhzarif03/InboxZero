import { AiProviderError, type AiCompletionRequest, type AiProvider } from "@/lib/ai/types";

/**
 * Google Gemini (cloud). Email content is sent to Google, so this provider is GATED:
 *
 *  - It refuses to construct unless GEMINI_TIER is "paid". Google's free-tier terms allow
 *    prompts to be used to improve its products, which is not acceptable for private mail.
 *  - The router additionally requires the user's explicit cloud-AI consent before calling this.
 *
 * Both checks are repeated here on purpose (defense in depth).
 */
export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  readonly cloud = true;

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    tier: "free" | "paid",
    private readonly timeoutMs = 45_000,
  ) {
    if (tier !== "paid") {
      throw new AiProviderError(
        "POLICY_BLOCKED",
        "Gemini free tier cannot receive email content. Set GEMINI_TIER=paid after enabling billing, or use Ollama.",
      );
    }
    if (!apiKey) {
      throw new AiProviderError("UNAVAILABLE", "GEMINI_API_KEY is not configured.");
    }
  }

  async complete(req: AiCompletionRequest): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: req.maxOutputTokens,
            temperature: 0.1,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new AiProviderError(timeout ? "TIMEOUT" : "UNAVAILABLE", "Gemini request failed.");
    }
    if (!res.ok) {
      throw new AiProviderError("UNAVAILABLE", `Gemini returned HTTP ${res.status}.`);
    }
    const data = (await res.json().catch(() => null)) as
      | { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      | null;
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) {
      throw new AiProviderError("BAD_RESPONSE", "Gemini response had no text.");
    }
    return text;
  }
}
