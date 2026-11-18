import { z } from "zod";

/**
 * Every AI output is validated here before it can touch the database.
 * Anything that fails validation is discarded and the deterministic result is kept.
 */

export const CATEGORY_VALUES = [
  "PRIORITY",
  "NEEDS_REPLY",
  "WAITING_FOR_REPLY",
  "FOLLOW_UP",
  "DEADLINES",
  "NEWSLETTERS",
  "NOTIFICATIONS",
  "PROMOTIONS",
  "ARCHIVED",
  "GENERAL",
] as const;

export const classificationSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  priority: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().max(200)).max(5),
});
export type ClassificationOutput = z.infer<typeof classificationSchema>;

export const summarySchema = z.object({
  mainSubject: z.string().min(1).max(200),
  currentStatus: z.string().max(300),
  items: z
    .array(
      z.object({
        kind: z.enum(["important_info", "decision", "question", "action_item", "deadline", "person"]),
        text: z.string().min(1).max(400),
        // "stated" = explicitly written in an email. "inferred" = AI interpretation.
        basis: z.enum(["stated", "inferred"]),
        sourceMessageIds: z.array(z.string()).max(10),
      }),
    )
    .max(30),
});
export type SummaryOutput = z.infer<typeof summarySchema>;

export const actionsSchema = z.object({
  actions: z
    .array(
      z.object({
        description: z.string().min(3).max(300),
        responsible: z.string().max(120).nullable(),
        // Verbatim expression from the email. Date normalization is done by deterministic code.
        deadlineText: z.string().max(120).nullable(),
        priority: z.number().int().min(1).max(5),
        confidence: z.number().min(0).max(1),
        sourceMessageId: z.string(),
      }),
    )
    .max(10),
});
export type ActionsOutput = z.infer<typeof actionsSchema>;

/**
 * Extracts a JSON object from model text. Models sometimes wrap JSON in code fences or prose.
 * Returns null when no valid JSON object can be found. Never throws.
 */
export function parseModelJson<T extends z.ZodTypeAny>(text: string, schema: T): z.infer<T> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}
