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

export interface Segment {
  text: string;
  /** Hiragana reading; present on segments that contain kanji (REQ-004). */
  reading?: string;
}

export interface BreakdownItem {
  phrase: string;
  explanation: string;
}

export interface Suggestion {
  jp: string;
  romaji: string;
  en: string;
}

export type FixIssue = "particle" | "politeness" | "vocabulary" | "grammar" | "other";

export interface GentleFix {
  original: string;
  natural: string;
  issue: FixIssue;
  explanation: string;
}

/** The reply fields the conversation renders (design.md, Data model: Reply). */
export interface GemmaTurn {
  jp: string;
  segments: Segment[];
  romaji: string;
  en: string;
  breakdown: BreakdownItem[];
  suggestions: Suggestion[];
  fix: GentleFix | null;
}

const FIX_ISSUES: readonly string[] = ["particle", "politeness", "vocabulary", "grammar", "other"];

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

function parseSegment(value: unknown): Segment | null {
  if (!isRecord(value) || typeof value.text !== "string") {
    return null;
  }
  return typeof value.reading === "string"
    ? { text: value.text, reading: value.reading }
    : { text: value.text };
}

function strings<K extends string>(value: unknown, keys: readonly K[]): Record<K, string> | null {
  if (!isRecord(value)) {
    return null;
  }
  const result = {} as Record<K, string>;
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== "string") {
      return null;
    }
    result[key] = field;
  }
  return result;
}

function parseList<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: T[] = [];
  for (const entry of value) {
    const item = parse(entry);
    if (item === null) {
      return null;
    }
    items.push(item);
  }
  return items;
}

function parseFix(value: unknown): GentleFix | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  const fields = strings(value, ["original", "natural", "issue", "explanation"]);
  if (fields === null || !FIX_ISSUES.includes(fields.issue)) {
    return undefined; // present but malformed
  }
  return { ...fields, issue: fields.issue as FixIssue };
}

/** The server validated the reply; this only guards the shape the view relies on. */
function parseGemmaTurn(data: unknown): GemmaTurn | null {
  if (
    !isRecord(data) ||
    typeof data.jp !== "string" ||
    typeof data.romaji !== "string" ||
    typeof data.en !== "string" ||
    !Array.isArray(data.segments)
  ) {
    return null;
  }
  const segments = parseList(data.segments, parseSegment);
  const breakdown = parseList(data.breakdown ?? [], (item) =>
    strings(item, ["phrase", "explanation"]),
  );
  const suggestions = parseList(data.suggestions ?? [], (item) =>
    strings(item, ["jp", "romaji", "en"]),
  );
  const fix = parseFix(data.fix);
  if (segments === null || breakdown === null || suggestions === null || fix === undefined) {
    return null;
  }
  return {
    jp: data.jp,
    segments,
    romaji: data.romaji,
    en: data.en,
    breakdown,
    suggestions,
    fix,
  };
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

  const turn = response.ok ? parseGemmaTurn(data) : null;
  if (turn !== null) {
    return { ok: true, turn };
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
