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

export interface TurnContext {
  config: Pick<Config, "backend" | "model">;
  adapter: ModelAdapter;
}

export interface ApiError {
  error: ErrorCode;
  message: string;
}

export type TurnResponse =
  { status: 200; body: Reply } | { status: 400 | 502 | 503 | 504; body: ApiError };

/** AC-003.2: the first attempt plus one retry. */
const MAX_ATTEMPTS = 2;

export const TONGUE_TIED = "Gemma got tongue-tied — try again";

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
export function rejectTurn(context: TurnContext, message: string): TurnResponse {
  turnRecorder(context.config, performance.now())("unknown", 0, "not_attempted", "invalid_request");
  return { status: 400, body: { error: "invalid_request", message } };
}

/** Runs one POST /api/turn: validate the request, call the model, validate, retry once. */
export async function handleTurn(
  context: TurnContext,
  body: unknown,
  signal?: AbortSignal,
): Promise<TurnResponse> {
  const { config, adapter } = context;
  const record = turnRecorder(config, performance.now());

  const parsed = parseTurnRequest(body);
  if (!parsed.ok) {
    record(parsed.scenario?.id ?? "unknown", 0, "not_attempted", "invalid_request");
    return { status: 400, body: { error: "invalid_request", message: parsed.message } };
  }

  const { scenario, request } = parsed;
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
