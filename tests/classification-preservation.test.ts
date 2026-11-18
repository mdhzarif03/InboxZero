import { describe, it, expect } from "vitest";
import { resolveClassificationWrite, mergeAiCategory, isAiProducer, classificationInputKey } from "@/lib/analysis/ai-state";

/**
 * Regression tests for the deterministic refresh overwriting AI classifications.
 */
const KEY = "key-A";

describe("classification preservation", () => {
  it("keeps a valid AI classification when content and Gmail state are unchanged", () => {
    const r = resolveClassificationWrite({
      deterministicCategory: "GENERAL",
      existing: { producer: "gemini:gemini-2.5-flash", aiInputKey: KEY },
      inputKey: KEY,
    });
    expect(r.action).toBe("keep_ai");
  });

  it("keeps an Ollama classification the same way", () => {
    const r = resolveClassificationWrite({
      deterministicCategory: "GENERAL",
      existing: { producer: "ollama:llama3.2", aiInputKey: KEY },
      inputKey: KEY,
    });
    expect(r.action).toBe("keep_ai");
  });

  it("refreshes an AI classification when the content or Gmail labels changed", () => {
    const r = resolveClassificationWrite({
      deterministicCategory: "NEEDS_REPLY",
      existing: { producer: "ollama:llama3.2", aiInputKey: "old-key" },
      inputKey: KEY,
    });
    expect(r.action).toBe("write_deterministic");
  });

  it("writes the deterministic result when no AI classification exists (AI unavailable)", () => {
    const r = resolveClassificationWrite({ deterministicCategory: "NEWSLETTERS", existing: null, inputKey: KEY });
    expect(r.action).toBe("write_deterministic");
  });

  it("writes the deterministic result when the stored row is deterministic", () => {
    const r = resolveClassificationWrite({
      deterministicCategory: "GENERAL",
      existing: { producer: "deterministic", aiInputKey: null },
      inputKey: KEY,
    });
    expect(r.action).toBe("write_deterministic");
  });

  it("always applies Gmail-authoritative categories, even over a matching AI classification", () => {
    for (const category of ["ARCHIVED", "PROMOTIONS"]) {
      const r = resolveClassificationWrite({
        deterministicCategory: category,
        existing: { producer: "gemini:gemini-2.5-flash", aiInputKey: KEY },
        inputKey: KEY,
      });
      expect(r.action).toBe("write_deterministic");
    }
  });

  it("refreshes a stored AI category that is no longer authoritative once Gmail stops labelling it", () => {
    const r = resolveClassificationWrite({
      deterministicCategory: "GENERAL",
      existing: { producer: "gemini:gemini-2.5-flash", aiInputKey: "old" },
      inputKey: KEY,
    });
    expect(r.action).toBe("write_deterministic");
  });
});

describe("AI cannot override Gmail labels", () => {
  it("keeps ARCHIVED and PROMOTIONS whatever the model says", () => {
    expect(mergeAiCategory("ARCHIVED", "NEEDS_REPLY")).toBe("ARCHIVED");
    expect(mergeAiCategory("PROMOTIONS", "PRIORITY")).toBe("PROMOTIONS");
  });

  it("never lets the model introduce ARCHIVED, which is a Gmail state", () => {
    expect(mergeAiCategory("NEEDS_REPLY", "ARCHIVED")).toBe("NEEDS_REPLY");
  });

  it("accepts an ordinary model judgment on non-authoritative categories", () => {
    expect(mergeAiCategory("GENERAL", "NEEDS_REPLY")).toBe("NEEDS_REPLY");
  });
});

describe("producer detection", () => {
  it("recognises only AI producers", () => {
    expect(isAiProducer("ollama:llama3.2")).toBe(true);
    expect(isAiProducer("gemini:gemini-2.5-flash")).toBe(true);
    expect(isAiProducer("deterministic")).toBe(false);
    expect(isAiProducer("user")).toBe(false);
  });
});

describe("end to end classification sequence", () => {
  it("deterministic -> AI -> deterministic refresh with no label change keeps the AI result", () => {
    const k = classificationInputKey({ contentHash: "c1", labelIds: ["INBOX"], archived: false, starred: false, lastMessageFromMe: false });
    // Pipeline run 1: nothing stored yet, deterministic written.
    let stored: { producer: string; aiInputKey: string | null } | null = null;
    let r = resolveClassificationWrite({ deterministicCategory: "GENERAL", existing: stored, inputKey: k });
    expect(r.action).toBe("write_deterministic");
    stored = { producer: "deterministic", aiInputKey: null };
    // AI classify succeeds and stores its result with the key.
    stored = { producer: "ollama:llama3.2", aiInputKey: k };
    // Pipeline run 2 (sync, nothing changed): the AI result must be kept.
    r = resolveClassificationWrite({ deterministicCategory: "GENERAL", existing: stored, inputKey: k });
    expect(r.action).toBe("keep_ai");
  });
});
