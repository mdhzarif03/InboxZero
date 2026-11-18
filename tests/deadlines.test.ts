import { describe, it, expect } from "vitest";
import { extractDeadlines } from "@/lib/analysis/deadlines";

const REF = new Date("2026-11-10T09:00:00Z");

describe("deadline extraction", () => {
  it("marks a date with explicit year as CONFIRMED", () => {
    const [d] = extractDeadlines("Submit the form by November 30, 2026.", REF);
    expect(d).toBeDefined();
    expect(d!.status).toBe("CONFIRMED");
    expect(d!.normalizedAt!.toISOString().slice(0, 10)).toBe("2026-11-30");
    expect(d!.kind).toBe("EXPLICIT_DEADLINE");
  });

  it("never confirms a yearless date", () => {
    const [d] = extractDeadlines("Payment due on Dec 1.", REF);
    expect(d!.status).toBe("AMBIGUOUS");
    expect(d!.kind).toBe("PAYMENT_DUE");
  });

  it("treats relative words as ambiguous and resolves them from the message date", () => {
    const [d] = extractDeadlines("Can we meet tomorrow?", REF);
    expect(d!.status).toBe("AMBIGUOUS");
    expect(d!.normalizedAt!.toISOString().slice(0, 10)).toBe("2026-11-11");
    expect(d!.kind).toBe("MEETING");
  });

  it("resolves a weekday to the next occurrence, never the same day", () => {
    // 2026-11-10 is a Tuesday; next Friday is 2026-11-13.
    const [d] = extractDeadlines("Send it by Friday.", REF);
    expect(d!.normalizedAt!.toISOString().slice(0, 10)).toBe("2026-11-13");
  });

  it("rejects impossible calendar dates", () => {
    const found = extractDeadlines("Ship on 2026-02-30.", REF);
    expect(found.every((d) => d.status !== "CONFIRMED")).toBe(true);
  });

  it("captures a stated timezone and caps confidence when none is stated", () => {
    const [withTz] = extractDeadlines("Call on December 4, 2026 at 10:00 AM GMT.", REF);
    expect(withTz!.timezone).toBe("GMT");
    expect(withTz!.normalizedAt!.toISOString()).toBe("2026-12-04T10:00:00.000Z");
    const [noTz] = extractDeadlines("Due December 4, 2026.", REF);
    expect(noTz!.timezone).toBeNull();
    expect(noTz!.confidence).toBeLessThanOrEqual(0.85);
  });

  it("returns nothing for text without dates", () => {
    expect(extractDeadlines("Thanks, talk soon.", REF)).toEqual([]);
  });
});
