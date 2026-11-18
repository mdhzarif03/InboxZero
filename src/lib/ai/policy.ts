/**
 * Pure AI routing policy. No database, no network: safe to import in unit tests.
 * Every rule that decides whether email content may leave the host is defined here.
 */
import type { AiProvider } from "@/lib/ai/types";

export type RouteRefusal = "disabled" | "not_configured" | "consent_required" | "free_tier_blocked" | "quota_exceeded";
export type RouteResult = { provider: AiProvider; reason: "ok" } | { provider: null; reason: RouteRefusal };

export type RouteFacts = {
  choice: "none" | "ollama" | "gemini";
  geminiTier: "free" | "paid";
  cloudConsent: boolean;
  hasGeminiKey: boolean;
  usedToday: number;
  dailyLimit: number;
};

export type RouteDecision = { kind: "refuse"; reason: RouteRefusal } | { kind: "ollama" } | { kind: "gemini" };

/**
 * Pure policy: which provider, if any, may process email content for this user right now.
 * Every privacy rule lives here so it can be tested without a database:
 *  - "none" never calls a model.
 *  - The daily quota applies to every provider.
 *  - Ollama runs on the operator's own host and needs no cloud consent.
 *  - Gemini needs: a paid tier, a key, and the user's recorded consent. Free tier is refused
 *    regardless of consent, because free-tier prompts may be used to improve Google's products.
 */
export function decideRoute(f: RouteFacts): RouteDecision {
  if (f.choice === "none") return { kind: "refuse", reason: "disabled" };
  if (f.usedToday >= f.dailyLimit) return { kind: "refuse", reason: "quota_exceeded" };
  if (f.choice === "ollama") return { kind: "ollama" };
  // choice === "gemini"
  if (f.geminiTier !== "paid") return { kind: "refuse", reason: "free_tier_blocked" };
  if (!f.cloudConsent) return { kind: "refuse", reason: "consent_required" };
  if (!f.hasGeminiKey) return { kind: "refuse", reason: "not_configured" };
  return { kind: "gemini" };
}
