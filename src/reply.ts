import { z } from "zod";

import { MAX_HISTORY_ENTRY_LENGTH } from "./turn-request.js";

/** Non-blank text of bounded length. Bounds keep replies, retries and history small. */
const text = (max: number) => z.string().trim().min(1).max(max);

/** REQ-003: the shape every Gemma turn must have (design.md, Data model). */
export const replySchema = z.object({
  // Not trimmed: the join check (AC-003.4) must compare against what the model wrote.
  // Capped so the reply can be sent back as a history entry on the next turn.
  // min(1) also reaches the JSON schema sent to Ollama; the blank check below does not.
  jp: z
    .string()
    .min(1)
    .max(MAX_HISTORY_ENTRY_LENGTH)
    .refine((value) => value.trim() !== "", "must not be blank"),
  segments: z
    .array(z.object({ text: z.string().min(1), reading: z.string().max(100).optional() }))
    .min(1)
    .max(200),
  romaji: text(1000),
  en: text(1000),
  breakdown: z
    .array(z.object({ phrase: text(MAX_HISTORY_ENTRY_LENGTH), explanation: text(300) }))
    .min(1)
    .max(4),
  suggestions: z
    .array(z.object({ jp: text(200), romaji: text(400), en: text(400) }))
    .min(1)
    .max(2),
  fix: z
    .object({
      original: text(400),
      natural: text(400),
      issue: z.enum(["particle", "politeness", "vocabulary", "grammar", "other"]),
      explanation: text(400),
    })
    .nullable(),
  sceneEnded: z.boolean(),
});

export type Reply = z.infer<typeof replySchema>;

/**
 * Sent to Ollama's `format` field so generation is constrained to the reply shape. Unlike
 * the API reply, every segment must carry a reading ("" for kana): measured on gemma4:e4b,
 * an optional field was often left out on kanji segments, failing most turns.
 */
export const REPLY_JSON_SCHEMA = z.toJSONSchema(
  replySchema.extend({
    segments: z
      .array(z.object({ text: z.string().min(1), reading: z.string().max(100) }))
      .min(1)
      .max(200),
  }),
) as Record<string, unknown>;

export type ReplyValidation = { ok: true; reply: Reply } | { ok: false; error: string };

// CJK Unified Ideographs and Extension A (design.md, Data model).
const KANJI = /[㐀-䶿一-鿿]/;
const HIRAGANA_READING = /^[ぁ-ゖー]+$/;
const CODE_FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

function invalid(error: string): ReplyValidation {
  return { ok: false, error };
}

/**
 * Parses and validates raw model output. Errors are written for the model: on the retry
 * they are fed back to it as the reason its previous answer was rejected (AC-003.2).
 */
export interface ValidateOptions {
  /** AC-003.5: on the last attempt, show kanji without furigana rather than fail. */
  allowMissingReadings?: boolean;
}

export function validateReply(
  raw: string,
  { allowMissingReadings = false }: ValidateOptions = {},
): ReplyValidation {
  const trimmed = raw.trim();
  const unfenced = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;

  let data: unknown;
  try {
    data = JSON.parse(unfenced);
  } catch {
    return invalid("the answer is not valid JSON");
  }

  const parsed = replySchema.safeParse(data);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "answer"}: ${issue.message}`,
    );
    return invalid(`the JSON does not match the schema (${problems.join("; ")})`);
  }
  const reply = parsed.data;

  // AC-003.4: the segments are what the UI renders, so they must spell out jp exactly.
  const joined = reply.segments.map((segment) => segment.text).join("");
  if (joined !== reply.jp) {
    return invalid(
      `the segments joined together ("${joined}") must equal jp ("${reply.jp}") exactly, including punctuation`,
    );
  }

  const segments: Reply["segments"] = [];
  for (const segment of reply.segments) {
    if (!KANJI.test(segment.text)) {
      // Readings are only shown over kanji; a reading on kana is noise, not an error.
      segments.push({ text: segment.text });
      continue;
    }
    const reading = segment.reading?.trim() ?? "";
    const problem =
      reading === ""
        ? `the segment "${segment.text}" contains kanji but has no reading`
        : HIRAGANA_READING.test(reading)
          ? null
          : `the reading of "${segment.text}" must be written in hiragana only`;
    if (problem !== null) {
      if (!allowMissingReadings) {
        return invalid(problem);
      }
      segments.push({ text: segment.text });
      continue;
    }
    segments.push({ text: segment.text, reading });
  }

  // AC-006.2: drop breakdown items whose phrase isn't in the reply; none left is invalid.
  const breakdown = reply.breakdown.filter((item) => reply.jp.includes(item.phrase));
  if (breakdown.length === 0) {
    return invalid("every breakdown phrase must be copied exactly from jp");
  }

  return { ok: true, reply: { ...reply, segments, breakdown } };
}
