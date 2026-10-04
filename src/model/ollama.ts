import { z } from "zod";

import { ModelUnavailableError, type GenerateRequest, type ModelAdapter } from "./adapter.js";
import { MAX_OUTPUT_TOKENS, MODEL_TIMEOUT_MS, postJson } from "./http.js";

export { MODEL_TIMEOUT_MS };

export interface OllamaAdapterOptions {
  baseUrl: string;
  model: string;
  timeoutMs?: number;
}

const chatResponseSchema = z.object({ message: z.object({ content: z.string() }) });

/** Ollama `/api/chat` with the reply schema in `format` (design.md, Model call contract). */
export function createOllamaAdapter({
  baseUrl,
  model,
  timeoutMs = MODEL_TIMEOUT_MS,
}: OllamaAdapterOptions): ModelAdapter {
  // Relative to the base so a path prefix (e.g. a reverse proxy at /ollama) is kept.
  const url = new URL("api/chat", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

  return {
    async generate({ messages, jsonSchema, signal }: GenerateRequest): Promise<string> {
      const response = await postJson(
        url,
        {
          model,
          messages,
          format: jsonSchema,
          stream: false,
          // Gemma 4 can "think" first; that only adds latency for a short roleplay line.
          think: false,
          options: { num_predict: MAX_OUTPUT_TOKENS },
        },
        { timeoutMs, signal },
      );
      if (response.status < 200 || response.status >= 300) {
        // e.g. 404 when the model hasn't been pulled.
        throw new ModelUnavailableError("upstream");
      }
      const parsed = chatResponseSchema.safeParse(response.body);
      if (!parsed.success) {
        throw new ModelUnavailableError("upstream");
      }
      return parsed.data.message.content;
    },
  };
}
