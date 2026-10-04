import { z } from "zod";

export const BACKENDS = ["ollama", "gemini"] as const;
export type Backend = (typeof BACKENDS)[number];

const DEFAULT_MODELS: Record<Backend, string> = {
  ollama: "gemma4:e4b",
  gemini: "gemma-4-26b-a4b-it",
};

export interface Config {
  backend: Backend;
  model: string;
  ollamaUrl: string;
  geminiApiKey: string | null;
  port: number;
  dailyTurnCap: number;
  perMinuteLimit: number;
}

/** Thrown when the environment is invalid; names the settings but never their values. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

const positiveInt = z.coerce.number().int().min(1);

// `X=` in .env means "not set", so an empty value falls back to the default.
function blankAsUnset(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value?.trim() === "" ? undefined : value]),
  );
}

const envSchema = z
  .object({
    GEMMA_BACKEND: z.enum(BACKENDS).default("ollama"),
    GEMMA_MODEL: z.string().trim().min(1, "must not be empty").optional(),
    OLLAMA_URL: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:11434"),
    GEMINI_API_KEY: z.string().trim().min(1, "must not be empty").optional(),
    PORT: positiveInt.max(65535).default(8080),
    DAILY_TURN_CAP: positiveInt.default(500),
    PER_MINUTE_LIMIT: positiveInt.default(10),
  })
  .superRefine((env, ctx) => {
    if (env.GEMMA_BACKEND === "gemini" && env.GEMINI_API_KEY === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "is required when GEMMA_BACKEND=gemini",
      });
    }
  });

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(blankAsUnset(env));
  if (!result.success) {
    // Zod issue messages describe the expected shape only; input values are never included.
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const parsed = result.data;
  return {
    backend: parsed.GEMMA_BACKEND,
    model: parsed.GEMMA_MODEL ?? DEFAULT_MODELS[parsed.GEMMA_BACKEND],
    ollamaUrl: parsed.OLLAMA_URL,
    geminiApiKey: parsed.GEMINI_API_KEY ?? null,
    port: parsed.PORT,
    dailyTurnCap: parsed.DAILY_TURN_CAP,
    perMinuteLimit: parsed.PER_MINUTE_LIMIT,
  };
}
