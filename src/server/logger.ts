import type { Backend } from "../config.js";

export type ErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "demo_busy"
  | "model_invalid_output"
  | "model_unavailable"
  | "internal";

/** NFR-007: the only fields a turn log may carry. Never message content (NFR-002). */
export interface TurnLogRecord {
  requestId: string;
  scenarioId: string;
  backend: Backend;
  model: string;
  latencyMs: number;
  attempts: number;
  validation: "passed" | "failed" | "not_attempted";
  errorType: ErrorCode | null;
}

export function formatTurnLog(record: TurnLogRecord): string {
  // Copy field by field so that extra properties on the argument can never reach the log.
  const line: TurnLogRecord = {
    requestId: record.requestId,
    scenarioId: record.scenarioId,
    backend: record.backend,
    model: record.model,
    latencyMs: record.latencyMs,
    attempts: record.attempts,
    validation: record.validation,
    errorType: record.errorType,
  };
  return JSON.stringify(line);
}

export function logTurn(record: TurnLogRecord): void {
  console.log(formatTurnLog(record));
}
