import { z } from "zod";

import {
  ModelUnavailableError,
  type ChatMessage,
  type GenerateRequest,
  type ModelAdapter,
} from "./adapter.js";
import { MAX_OUTPUT_TOKENS, MODEL_TIMEOUT_MS, postJson } from "./http.js";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

const generateResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional(), thought: z.boolean().optional() }))
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

function toContents(messages: readonly ChatMessage[]) {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
}

/**
 * Hosted Gemma on the Gemini API `generateContent` (design.md, Model call contract).
 * Structured output is not documented for Gemma models here, so `jsonSchema` is not sent:
 * the prompt asks for JSON and the shared validator checks it (ADR-0003).
 */
export function createGeminiAdapter({
  apiKey,
  model,
  baseUrl = GEMINI_BASE_URL,
  timeoutMs = MODEL_TIMEOUT_MS,
}: GeminiAdapterOptions): ModelAdapter {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(`models/${encodeURIComponent(model)}:generateContent`, base);

  return {
    async generate({ messages, signal }: GenerateRequest): Promise<string> {
      const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
      const response = await postJson(
        url,
        {
          ...(system === "" ? {} : { systemInstruction: { parts: [{ text: system }] } }),
          contents: toContents(messages),
          generationConfig: {
            // "minimal" switches Gemma 4's thinking off; a short roleplay line doesn't need it.
            thinkingConfig: { thinkingLevel: "minimal" },
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        },
        // The key goes in a header, never the URL, so it can't end up in access logs.
        { headers: { "x-goog-api-key": apiKey }, timeoutMs, signal },
      );

      if (response.status === 429) {
        throw new ModelUnavailableError("quota"); // AC-011.3
      }
      if (response.status < 200 || response.status >= 300) {
        throw new ModelUnavailableError("upstream");
      }
      const parsed = generateResponseSchema.safeParse(response.body);
      const parts = parsed.success ? (parsed.data.candidates?.[0]?.content?.parts ?? []) : [];
      const text = parts
        .filter((part) => part.thought !== true)
        .map((part) => part.text ?? "")
        .join("");
      if (text.trim() === "") {
        // No candidate text, e.g. the prompt or answer was blocked.
        throw new ModelUnavailableError("upstream");
      }
      return text;
    },
  };
}
