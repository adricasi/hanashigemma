import { randomUUID } from "node:crypto";

import type { Config } from "../config.js";
import {
  ModelUnavailableError,
  type ModelAdapter,
  type UnavailableReason,
} from "../model/adapter.js";
import { buildMessages, retryMessages } from "../prompt.js";
import { REPLY_JSON_SCHEMA, validateReply, type Reply } from "../reply.js";
import { parseTurnRequest } from "../turn-request.js";
import { logTurn, type ErrorCode, type TurnLogRecord } from "./logger.js";
import type { RateLimiter } from "./rate-limit.js";

export interface TurnContext {
  config: Pick<Config, "backend" | "model">;
  adapter: ModelAdapter;
  limiter: RateLimiter;
}

export interface TurnOptions {
  /** Aborts the model call when the browser goes away. */
  signal?: AbortSignal;
  /** Identifies the client for the per-minute limit (AC-011.1). */
  clientKey?: string;
}

export interface ApiError {
  error: ErrorCode;
  message: string;
}

export type TurnResponse =
  { status: 200; body: Reply } | { status: 400 | 429 | 502 | 503 | 504; body: ApiError };

/** AC-003.2: the first attempt plus one retry. */
const MAX_ATTEMPTS = 2;

export const TONGUE_TIED = "Gemma got tongue-tied — try again";

/** AC-011.1 */
export const SLOW_DOWN =
  "You're sending messages very quickly. Please slow down and try again in a minute.";

/** AC-011.2 and AC-011.3 share this message. */
export const DEMO_BUSY =
  "The demo is busy right now. You can run HanashiGemma on your own computer for free — see the offline setup in the README.";

function unavailableMessage(config: TurnContext["config"], reason: UnavailableReason): string {
  // AC-010.3: only the local backend gets Ollama hints.
  if (config.backend !== "ollama") {
    return "Gemma is unavailable right now. Please try again in a moment.";
  }
  return reason === "upstream"
    ? `Gemma is unavailable. Ollama answered with an error — is the model pulled? Run “ollama pull ${config.model}” and try again.`
    : "Gemma is unavailable. Is Ollama running? Start it with “ollama serve” and try again.";
}

type RecordTurn = (
  scenarioId: string,
  attempts: number,
  validation: TurnLogRecord["validation"],
  errorType: ErrorCode | null,
) => void;

/** One NFR-007 record per turn, with the latency measured from `startedAt`. */
function turnRecorder(config: TurnContext["config"], startedAt: number): RecordTurn {
  return (scenarioId, attempts, validation, errorType) => {
    logTurn({
      requestId: randomUUID(),
      // Only known ids are logged: a made-up id could be learner text (NFR-002).
      scenarioId,
      backend: config.backend,
      model: config.model,
      latencyMs: Math.round(performance.now() - startedAt),
      attempts,
      validation,
      errorType,
    });
  };
}

/** A request rejected before reaching the model (bad body, size, content type). */
export function rejectTurn(config: TurnContext["config"], message: string): TurnResponse {
  turnRecorder(config, performance.now())("unknown", 0, "not_attempted", "invalid_request");
  return { status: 400, body: { error: "invalid_request", message } };
}

/** Runs one POST /api/turn: validate the request, call the model, validate, retry once. */
export async function handleTurn(
  context: TurnContext,
  body: unknown,
  { signal, clientKey = "unknown" }: TurnOptions = {},
): Promise<TurnResponse> {
  const { config, adapter, limiter } = context;
  const record = turnRecorder(config, performance.now());

  const parsed = parseTurnRequest(body);
  if (!parsed.ok) {
    record(parsed.scenario?.id ?? "unknown", 0, "not_attempted", "invalid_request");
    return { status: 400, body: { error: "invalid_request", message: parsed.message } };
  }

  const { scenario, request } = parsed;

  // REQ-011: counted per turn, before any model call; retries don't count again.
  const limit = limiter.take(clientKey);
  if (limit === "rate_limited") {
    record(scenario.id, 0, "not_attempted", "rate_limited");
    return { status: 429, body: { error: "rate_limited", message: SLOW_DOWN } };
  }
  if (limit === "demo_busy") {
    record(scenario.id, 0, "not_attempted", "demo_busy");
    return { status: 503, body: { error: "demo_busy", message: DEMO_BUSY } };
  }

  let messages = buildMessages(scenario, request.history, request.message);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Every attempt after the first follows an output that failed validation.
    const validationSoFar = attempt > 1 ? "failed" : "not_attempted";
    let raw: string;
    try {
      raw = await adapter.generate({
        messages,
        jsonSchema: REPLY_JSON_SCHEMA,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (!(error instanceof ModelUnavailableError)) {
        record(scenario.id, attempt, validationSoFar, "internal");
        throw error;
      }
      if (error.reason === "quota") {
        // AC-011.3: the hosted quota is the demo being busy, not Gemma being broken.
        record(scenario.id, attempt, validationSoFar, "demo_busy");
        return { status: 503, body: { error: "demo_busy", message: DEMO_BUSY } };
      }
      record(scenario.id, attempt, validationSoFar, "model_unavailable");
      return {
        status: error.reason === "timeout" ? 504 : 503,
        body: { error: "model_unavailable", message: unavailableMessage(config, error.reason) },
      };
    }

    const validation = validateReply(raw);
    if (validation.ok) {
      record(scenario.id, attempt, "passed", null);
      return { status: 200, body: validation.reply };
    }
    messages = retryMessages(messages, raw, validation.error);
  }

  // AC-003.3: never return an unvalidated turn.
  record(scenario.id, MAX_ATTEMPTS, "failed", "model_invalid_output");
  return { status: 502, body: { error: "model_invalid_output", message: TONGUE_TIED } };
}
