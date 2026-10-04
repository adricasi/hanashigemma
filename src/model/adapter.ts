export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  /** JSON schema the answer must follow (used by backends that support it). */
  jsonSchema: Record<string, unknown>;
  /** Aborts the call, e.g. when the browser has gone away. */
  signal?: AbortSignal;
}

/** AC-010.4: every backend returns the raw answer text; validation is shared. */
export interface ModelAdapter {
  generate(request: GenerateRequest): Promise<string>;
}

export type UnavailableReason = "unreachable" | "timeout" | "upstream" | "cancelled";

/** The backend could not produce an answer (AC-010.3). Never carries message content. */
export class ModelUnavailableError extends Error {
  constructor(
    readonly reason: UnavailableReason,
    options?: ErrorOptions,
  ) {
    super(`model unavailable: ${reason}`, options);
    this.name = "ModelUnavailableError";
  }
}
