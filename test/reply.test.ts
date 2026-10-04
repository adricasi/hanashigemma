import { describe, expect, it } from "vitest";

import { REPLY_JSON_SCHEMA, validateReply } from "../src/reply.js";
import { validReply, validReplyJson } from "./fixtures.js";

function invalidReason(raw: string): string {
  const result = validateReply(raw);
  if (result.ok) {
    throw new Error("expected the reply to be invalid");
  }
  return result.error;
}

describe("validateReply", () => {
  it("AC-003.1: accepts a reply that matches the schema", () => {
    const result = validateReply(validReplyJson());

    expect(result).toEqual({ ok: true, reply: validReply() });
  });

  it("AC-003.1: accepts a Gentle Fix with an issue type", () => {
    const reply = {
      ...validReply(),
      fix: {
        original: "ラーメンがください",
        natural: "ラーメンをください",
        issue: "particle",
        explanation: "Nice try! With ください the thing you want takes を.",
      },
    };

    expect(validateReply(JSON.stringify(reply)).ok).toBe(true);
  });

  it("strips a Markdown code fence around the JSON", () => {
    expect(validateReply("```json\n" + validReplyJson() + "\n```").ok).toBe(true);
  });

  it("AC-003.1: rejects output that is not JSON", () => {
    expect(invalidReason("いらっしゃいませ！")).toMatch(/not valid JSON/);
  });

  it.each([
    ["missing romaji", { romaji: undefined }],
    ["no breakdown items", { breakdown: [] }],
    ["five breakdown items", { breakdown: Array(5).fill(validReply().breakdown[0]) }],
    ["no suggestions", { suggestions: [] }],
    ["three suggestions", { suggestions: Array(3).fill(validReply().suggestions[0]) }],
    [
      "unknown fix issue",
      { fix: { original: "a", natural: "b", issue: "spelling", explanation: "c" } },
    ],
    ["sceneEnded not boolean", { sceneEnded: "no" }],
  ])("AC-003.1: rejects a reply with %s", (_name, change) => {
    const reason = invalidReason(JSON.stringify({ ...validReply(), ...change }));

    expect(reason).not.toBe("");
  });

  it("rejects a reply too long to be sent back as history", () => {
    const jp = "あ".repeat(401);
    const reply = {
      ...validReply(),
      jp,
      segments: [{ text: jp }],
      breakdown: [{ phrase: "あ", explanation: "A." }],
    };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/jp/);
  });

  it("keeps whitespace around jp so the join check compares like with like", () => {
    const reply = {
      ...validReply(),
      jp: "はい。 ",
      segments: [{ text: "はい。 " }],
      breakdown: [{ phrase: "はい", explanation: "Yes." }],
    };

    expect(validateReply(JSON.stringify(reply)).ok).toBe(true);
  });

  it("rejects a whitespace-only breakdown phrase", () => {
    const reply = { ...validReply(), breakdown: [{ phrase: " ", explanation: "Space." }] };

    expect(validateReply(JSON.stringify(reply)).ok).toBe(false);
  });

  it("AC-003.4: rejects segments that don't join to the Japanese reply", () => {
    // Real gemma4:e4b output from the T-002 spike: the final 。 was left out of the segments.
    const reply = {
      ...validReply(),
      jp: "いらっしゃいませ。",
      segments: [{ text: "いらっしゃい" }, { text: "ませ" }],
      breakdown: [{ phrase: "いらっしゃいませ", explanation: "Welcome." }],
    };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/segments/);
  });

  it("AC-003.1: rejects a kanji segment without a reading", () => {
    const reply = validReply();
    reply.segments[1] = { text: "注文" };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/注文/);
  });

  it("AC-003.1: rejects a reading that is not hiragana", () => {
    const reply = validReply();
    reply.segments[1] = { text: "注文", reading: "chuumon" };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/hiragana/);
  });

  it("accepts the prolonged sound mark in a reading", () => {
    const reply = {
      ...validReply(),
      jp: "東京ラーメン",
      segments: [{ text: "東京", reading: "とーきょー" }, { text: "ラーメン" }],
      breakdown: [{ phrase: "ラーメン", explanation: "Ramen." }],
    };

    expect(validateReply(JSON.stringify(reply)).ok).toBe(true);
  });

  it("AC-003.1: treats an empty reading on a kanji segment as missing", () => {
    const reply = validReply();
    reply.segments[1] = { text: "注文", reading: "" };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/注文.*no reading/);
  });

  it("accepts the empty readings the model gives kana segments, and drops them", () => {
    const reply = validReply();
    reply.segments[0] = { text: "いらっしゃいませ。ご", reading: "" };

    const result = validateReply(JSON.stringify(reply));

    expect(result.ok && result.reply.segments[0]).toEqual({ text: "いらっしゃいませ。ご" });
  });

  it("drops readings on segments without kanji", () => {
    const reply = validReply();
    reply.segments[0] = { text: "いらっしゃいませ。ご", reading: "いらっしゃいませ" };

    const result = validateReply(JSON.stringify(reply));

    expect(result.ok && result.reply.segments[0]).toEqual({ text: "いらっしゃいませ。ご" });
  });

  it("AC-006.2: drops breakdown items whose phrase is not in the reply", () => {
    const reply = {
      ...validReply(),
      breakdown: [
        ...validReply().breakdown,
        { phrase: "ありがとう", explanation: "Not in the reply." },
      ],
    };

    const result = validateReply(JSON.stringify(reply));

    expect(result.ok && result.reply.breakdown.map((item) => item.phrase)).toEqual([
      "いらっしゃいませ",
      "は",
    ]);
  });

  it("AC-006.2: treats the reply as invalid when no breakdown item remains", () => {
    const reply = {
      ...validReply(),
      breakdown: [{ phrase: "ありがとう", explanation: "Not in the reply." }],
    };

    expect(invalidReason(JSON.stringify(reply))).toMatch(/breakdown/);
  });
});

describe("REPLY_JSON_SCHEMA", () => {
  it("AC-010.4: describes every reply field for the model's structured output", () => {
    expect(REPLY_JSON_SCHEMA).toMatchObject({
      type: "object",
      required: expect.arrayContaining([
        "jp",
        "segments",
        "romaji",
        "en",
        "breakdown",
        "suggestions",
        "fix",
        "sceneEnded",
      ]) as unknown,
    });
  });

  it("makes the model give every segment a reading (empty for kana)", () => {
    // Measured on gemma4:e4b: with an optional reading, kanji segments often came back
    // without one; requiring the field fixed most of those turns.
    const segments = (REPLY_JSON_SCHEMA as { properties: Record<string, unknown> }).properties
      .segments as { items: { required: string[] } };

    expect(segments.items.required).toEqual(expect.arrayContaining(["text", "reading"]));
  });
});
