import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import type { AiProvider, AiTask } from "@/lib/ai/types";
import { AiProviderError } from "@/lib/ai/types";
import { decideRoute, type RouteRefusal, type RouteResult } from "@/lib/ai/policy";

export { decideRoute };
export type { RouteRefusal, RouteResult, RouteFacts, RouteDecision } from "@/lib/ai/policy";

/**
 * Decides, per user and per call, whether AI may be used and with which provider.
 * Returns a reason on every refusal so the UI can explain the state to the user.
 */

export async function resolveAiProvider(userId: string): Promise<RouteResult> {
  const config = env();
  const pref = await db.userPreference.findUnique({ where: { userId }, select: { aiProvider: true, cloudAiConsentAt: true } });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const usedToday = await db.aiUsage.count({ where: { userId, createdAt: { gte: since }, status: "ok" } });

  const decision = decideRoute({
    choice: (pref?.aiProvider ?? config.AI_PROVIDER) as "none" | "ollama" | "gemini",
    geminiTier: config.GEMINI_TIER,
    cloudConsent: Boolean(pref?.cloudAiConsentAt),
    hasGeminiKey: Boolean(config.GEMINI_API_KEY),
    usedToday,
    dailyLimit: config.AI_DAILY_CALL_LIMIT,
  });

  if (decision.kind === "refuse") return { provider: null, reason: decision.reason };
  if (decision.kind === "ollama") {
    return { provider: new OllamaProvider(config.OLLAMA_MODEL, config.OLLAMA_BASE_URL), reason: "ok" };
  }
  try {
    return { provider: new GeminiProvider(config.GEMINI_MODEL, config.GEMINI_API_KEY!, config.GEMINI_TIER), reason: "ok" };
  } catch (err) {
    if (err instanceof AiProviderError && err.code === "POLICY_BLOCKED") return { provider: null, reason: "free_tier_blocked" };
    return { provider: null, reason: "not_configured" };
  }
}

export async function recordAiUsage(args: {
  userId: string;
  provider: AiProvider;
  task: AiTask;
  inputChars: number;
  outputChars: number;
  status: "ok" | "error";
}): Promise<void> {
  await db.aiUsage.create({
    data: {
      userId: args.userId,
      provider: args.provider.id,
      model: args.provider.model,
      task: args.task,
      // Rough estimate: about four characters per token. Measured counts are not available from all providers.
      inputTokens: Math.ceil(args.inputChars / 4),
      outputTokens: Math.ceil(args.outputChars / 4),
      status: args.status,
    },
  });
}

/** Human-readable explanation for the settings and status UI. */
export function describeRouteReason(reason: RouteRefusal): string {
  switch (reason) {
    case "disabled":
      return "AI is turned off. Deterministic analysis is active.";
    case "not_configured":
      return "The selected AI provider is not configured on this server.";
    case "consent_required":
      return "Cloud AI needs your explicit consent in Settings before email content can be sent.";
    case "free_tier_blocked":
      return "Gemini's free tier cannot receive email content. Use Ollama or a paid Gemini configuration.";
    case "quota_exceeded":
      return "Today's AI limit has been reached. Deterministic analysis continues.";
  }
}
