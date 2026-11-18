export type AiTask = "classify" | "summarize" | "actions";

export type AiCompletionRequest = {
  task: AiTask;
  system: string;
  user: string;
  maxOutputTokens: number;
};

/**
 * A provider turns a prompt into a JSON string. It knows nothing about email, schemas
 * or the database. Validation happens in the caller.
 */
export interface AiProvider {
  readonly id: "ollama" | "gemini";
  readonly model: string;
  /** True when content leaves the user's machine. Used for consent and privacy gating. */
  readonly cloud: boolean;
  complete(req: AiCompletionRequest): Promise<string>;
}

export class AiProviderError extends Error {
  readonly code: "UNAVAILABLE" | "TIMEOUT" | "BAD_RESPONSE" | "POLICY_BLOCKED";
  constructor(code: AiProviderError["code"], message: string) {
    super(message);
    this.code = code;
  }
}
