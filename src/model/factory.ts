import type { Config } from "../config.js";
import type { ModelAdapter } from "./adapter.js";
import { createGeminiAdapter } from "./gemini.js";
import { createOllamaAdapter } from "./ollama.js";

export interface AdapterOverrides {
  /** Tests point the hosted adapter at a local stub. */
  geminiBaseUrl?: string;
}

/** REQ-010: one adapter per backend, chosen by GEMMA_BACKEND. */
export function createModelAdapter(config: Config, overrides: AdapterOverrides = {}): ModelAdapter {
  if (config.backend === "gemini") {
    if (config.geminiApiKey === null) {
      // loadConfig already refuses this (AC-010.2); kept as a guard for direct callers.
      throw new Error("GEMINI_API_KEY is required when GEMMA_BACKEND=gemini");
    }
    return createGeminiAdapter({
      apiKey: config.geminiApiKey,
      model: config.model,
      ...(overrides.geminiBaseUrl ? { baseUrl: overrides.geminiBaseUrl } : {}),
    });
  }
  return createOllamaAdapter({ baseUrl: config.ollamaUrl, model: config.model });
}
