import { z } from "zod";

/**
 * Environment access. Values are read lazily so that importing a module
 * (for example in tests) never throws because an unrelated secret is absent.
 */
/** A blank value in .env means "not set", not "invalid". */
const blankAsUnset = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  GOOGLE_GMAIL_CLIENT_ID: z.string().optional(),
  GOOGLE_GMAIL_CLIENT_SECRET: z.string().optional(),
  GOOGLE_GMAIL_REDIRECT_URI: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  SYNC_SECRET: z.string().optional(),
  AI_PROVIDER: z.enum(["none", "ollama", "gemini"]).default("none"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TIER: z.enum(["free", "paid"]).default("free"),
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const cleaned = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, blankAsUnset(v)]));
    const parsed = schema.safeParse(cleaned);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Returns a named value or throws a descriptive error that tells the operator what to configure. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new ConfigurationError(`${String(key)} is not configured.`);
  }
  return value as NonNullable<Env[K]>;
}

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";
}

/** Test helper: clears the cached parse so tests can set process.env freely. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
