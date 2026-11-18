import { describe, it, expect } from "vitest";
import { decideRoute, type RouteFacts } from "@/lib/ai/policy";

/**
 * Privacy policy for sending email content to AI providers.
 * These rules are the core commitments in docs/PRIVACY.md and must not regress.
 */
const base: RouteFacts = {
  choice: "gemini",
  geminiTier: "paid",
  cloudConsent: true,
  hasGeminiKey: true,
  usedToday: 0,
  dailyLimit: 200,
};

describe("AI routing policy", () => {
  it("never calls a model when the user has AI disabled", () => {
    expect(decideRoute({ ...base, choice: "none" })).toEqual({ kind: "refuse", reason: "disabled" });
  });

  it("NEVER sends email to Gemini's free tier, even with consent and a key", () => {
    expect(decideRoute({ ...base, geminiTier: "free" })).toEqual({ kind: "refuse", reason: "free_tier_blocked" });
    expect(decideRoute({ ...base, geminiTier: "free", cloudConsent: true, hasGeminiKey: true })).toEqual({
      kind: "refuse",
      reason: "free_tier_blocked",
    });
  });

  it("requires explicit cloud consent before any content goes to Gemini", () => {
    expect(decideRoute({ ...base, cloudConsent: false })).toEqual({ kind: "refuse", reason: "consent_required" });
  });

  it("requires a configured key for Gemini", () => {
    expect(decideRoute({ ...base, hasGeminiKey: false })).toEqual({ kind: "refuse", reason: "not_configured" });
  });

  it("allows Gemini only when paid tier, consent and key are all present", () => {
    expect(decideRoute(base)).toEqual({ kind: "gemini" });
  });

  it("local Ollama needs no cloud consent because content stays on the operator's host", () => {
    expect(decideRoute({ ...base, choice: "ollama", cloudConsent: false, geminiTier: "free", hasGeminiKey: false })).toEqual({ kind: "ollama" });
  });

  it("enforces the daily quota for every provider, including local", () => {
    expect(decideRoute({ ...base, usedToday: 200 })).toEqual({ kind: "refuse", reason: "quota_exceeded" });
    expect(decideRoute({ ...base, choice: "ollama", usedToday: 500 })).toEqual({ kind: "refuse", reason: "quota_exceeded" });
  });

  it("is not affected by consent for a disabled provider (consent does not enable anything by itself)", () => {
    expect(decideRoute({ ...base, choice: "none", cloudConsent: true })).toEqual({ kind: "refuse", reason: "disabled" });
  });
});
