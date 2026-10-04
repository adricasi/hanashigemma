// Mirrors POST /api/turn in src/server/turn.ts; the browser build can't import server code.

export const MAX_MESSAGE_LENGTH = 200;

export interface HistoryEntry {
  role: "learner" | "gemma";
  text: string;
}

export interface TurnBody {
  scenarioId: string;
  history: HistoryEntry[];
  message: string | null;
}

/** Only the fields this view renders so far; later tasks render the rest of the reply. */
export interface GemmaTurn {
  jp: string;
}

export type TurnResult =
  { ok: true; turn: GemmaTurn } | { ok: false; error: string; message: string; canRetry: boolean };

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type DraftCheck = { kind: "empty" } | { kind: "too_long" } | { kind: "ok"; text: string };

/** AC-002.3 / AC-002.4: decide in the browser whether a draft may be sent at all. */
export function checkDraft(draft: string): DraftCheck {
  const text = draft.trim();
  if (text === "") {
    return { kind: "empty" };
  }
  // Count characters as the learner sees them, matching the server.
  return [...text].length > MAX_MESSAGE_LENGTH ? { kind: "too_long" } : { kind: "ok", text };
}

const UNREACHABLE = "Couldn't reach the HanashiGemma server. Is it still running?";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function postTurn(fetchFn: FetchFn, body: TurnBody): Promise<TurnResult> {
  let response: Response;
  let data: unknown;
  try {
    response = await fetchFn("/api/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    data = await response.json();
  } catch {
    return { ok: false, error: "network", message: UNREACHABLE, canRetry: true };
  }

  if (response.ok && isRecord(data) && typeof data.jp === "string") {
    return { ok: true, turn: { jp: data.jp } };
  }
  if (isRecord(data) && typeof data.error === "string" && typeof data.message === "string") {
    // Bad requests won't succeed when repeated; everything else may (AC-003.3).
    return {
      ok: false,
      error: data.error,
      message: data.message,
      canRetry: data.error !== "invalid_request",
    };
  }
  return {
    ok: false,
    error: "unexpected",
    message: "Something went wrong. Please try again.",
    canRetry: true,
  };
}
