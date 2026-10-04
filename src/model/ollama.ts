import { z } from "zod";

import {
  ModelUnavailableError,
  type GenerateRequest,
  type ModelAdapter,
  type UnavailableReason,
} from "./adapter.js";

/** NFR-004: server-side model timeout per attempt. */
export const MODEL_TIMEOUT_MS = 45_000;

export interface OllamaAdapterOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

const chatResponseSchema = z.object({ message: z.object({ content: z.string() }) });

/**
 * Upper bound on generated tokens. A full reply measured ~200 tokens on gemma4:e4b; the cap
 * stops a runaway answer from holding the model until the timeout.
 */
const MAX_OUTPUT_TOKENS = 1536;

function failureReason(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  fallback: UnavailableReason,
): UnavailableReason {
  if (callerSignal?.aborted === true) {
    return "cancelled";
  }
  return error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : fallback;
}

/** Ollama `/api/chat` with the reply schema in `format` (design.md, Model call contract). */
export function createOllamaAdapter({
  baseUrl,
  model,
  timeoutMs = MODEL_TIMEOUT_MS,
}: OllamaAdapterOptions): ModelAdapter {
  // Relative to the base so a path prefix (e.g. a reverse proxy at /ollama) is kept.
  const url = new URL("api/chat", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

  return {
    async generate({
      messages,
      jsonSchema,
      signal: callerSignal,
    }: GenerateRequest): Promise<string> {
      // One signal covers the request and reading the body: timeout or caller, first wins.
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            format: jsonSchema,
            stream: false,
            // Gemma 4 can "think" first; that only adds latency for a short roleplay line.
            think: false,
            options: { num_predict: MAX_OUTPUT_TOKENS },
          }),
          signal,
        });
      } catch (error) {
        throw new ModelUnavailableError(failureReason(error, callerSignal, "unreachable"), {
          cause: error,
        });
      }

      if (!response.ok) {
        // e.g. 404 when the model hasn't been pulled. The body is not logged.
        await response.body?.cancel();
        throw new ModelUnavailableError("upstream");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        throw new ModelUnavailableError(failureReason(error, callerSignal, "upstream"), {
          cause: error,
        });
      }
      const parsed = chatResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ModelUnavailableError("upstream");
      }
      return parsed.data.message.content;
    },
  };
}
