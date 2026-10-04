import { z } from "zod";

import { SCENARIOS, type Scenario } from "./scenarios.js";

export const MAX_MESSAGE_LENGTH = 200;
/** The 30th learner message is the last one (AC-002.5), so at most 29 come before it. */
export const MAX_EARLIER_LEARNER_MESSAGES = 29;
export const MAX_HISTORY_ENTRY_LENGTH = 400;

const historyEntrySchema = z.object({
  role: z.enum(["learner", "gemma"]),
  text: z.string().max(MAX_HISTORY_ENTRY_LENGTH),
});

const turnRequestSchema = z.object({
  scenarioId: z.string(),
  // Coarse bound only; the per-role counts below give the learner a useful message.
  history: z.array(historyEntrySchema).max(100),
  message: z.string().nullable(),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export interface TurnRequest {
  history: HistoryEntry[];
  /** Trimmed learner message, or null to start the scene (Gemma speaks first). */
  message: string | null;
}

export type TurnRequestParse =
  | { ok: true; request: TurnRequest; scenario: Scenario }
  | { ok: false; message: string; scenario: Scenario | null };

/** Counts characters as the learner sees them, not UTF-16 code units. */
export function characterCount(text: string): number {
  return [...text].length;
}

/** Validates a POST /api/turn body; `message` is shown to the learner on rejection. */
export function parseTurnRequest(body: unknown): TurnRequestParse {
  const parsed = turnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, message: "The request is not a valid turn.", scenario: null };
  }
  const { scenarioId, history, message } = parsed.data;

  const scenario = SCENARIOS.find((candidate) => candidate.id === scenarioId);
  if (scenario === undefined) {
    // AC-001.3
    return { ok: false, message: "That scenario does not exist.", scenario: null };
  }
  const reject = (text: string): TurnRequestParse => ({ ok: false, message: text, scenario });

  // AC-001.2: Gemma speaks first, then the turns alternate, ending with Gemma's answer.
  const alternates = history.every((entry, index) => entry.role !== history[index - 1]?.role);
  if (
    history.length > 0 &&
    (history[0]?.role !== "gemma" || history.at(-1)?.role !== "gemma" || !alternates)
  ) {
    return reject("The conversation history is not valid. Please restart the scene.");
  }
  const tooLong = history.some(
    (entry) => entry.role === "learner" && characterCount(entry.text) > MAX_MESSAGE_LENGTH,
  );
  if (tooLong) {
    return reject(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const learnerTurns = history.filter((entry) => entry.role === "learner").length;
  if (learnerTurns > MAX_EARLIER_LEARNER_MESSAGES) {
    return reject("This scene has reached its length limit. Please restart it.");
  }

  if (message === null) {
    return history.length === 0
      ? { ok: true, request: { history, message: null }, scenario }
      : reject("A scene can only be started without earlier turns.");
  }

  if (history.length === 0) {
    return reject("Please wait for Gemma to start the scene.");
  }
  const trimmed = message.trim();
  if (trimmed === "") {
    // AC-002.3
    return reject("Please write a message before sending.");
  }
  if (characterCount(trimmed) > MAX_MESSAGE_LENGTH) {
    // AC-002.4
    return reject(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return { ok: true, request: { history, message: trimmed }, scenario };
}
