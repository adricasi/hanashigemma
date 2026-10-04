import { describe, expect, it } from "vitest";

import { parseTurnRequest } from "../src/turn-request.js";

function rejection(body: unknown): string {
  const result = parseTurnRequest(body);
  if (result.ok) {
    throw new Error("expected the request to be rejected");
  }
  return result.message;
}

const learner = (text: string) => ({ role: "learner", text });
const gemma = (text: string) => ({ role: "gemma", text });
const opening = [gemma("いらっしゃいませ。")];

describe("parseTurnRequest", () => {
  it("AC-001.2: accepts the start of a scene (no message, empty history)", () => {
    const result = parseTurnRequest({ scenarioId: "izakaya-ramen", history: [], message: null });

    expect(result.ok && result.scenario.id).toBe("izakaya-ramen");
  });

  it("AC-002.1: accepts a learner message with the earlier turns", () => {
    const result = parseTurnRequest({
      scenarioId: "kyoto-directions",
      history: [gemma("こんにちは。")],
      message: "  きよみずでらはどこですか。 ",
    });

    expect(result.ok && result.request.message).toBe("きよみずでらはどこですか。");
  });

  it("AC-001.3: rejects a scenario that does not exist", () => {
    expect(rejection({ scenarioId: "tokyo-sushi", history: [], message: null })).toMatch(
      /scenario/i,
    );
  });

  it.each(["", "   ", "\n\t"])("AC-002.3: rejects an empty message %j", (message) => {
    expect(rejection({ scenarioId: "izakaya-ramen", history: opening, message })).toMatch(
      /message/i,
    );
  });

  it("AC-002.4: rejects a message longer than 200 characters and states the limit", () => {
    const message = "あ".repeat(201);

    expect(rejection({ scenarioId: "izakaya-ramen", history: opening, message })).toContain("200");
  });

  it("AC-002.4: counts characters, not UTF-16 code units", () => {
    const message = "🍜".repeat(200);

    expect(parseTurnRequest({ scenarioId: "izakaya-ramen", history: opening, message }).ok).toBe(
      true,
    );
  });

  it("rejects history on a scene start", () => {
    expect(
      rejection({ scenarioId: "izakaya-ramen", history: [gemma("はい。")], message: null }),
    ).not.toBe("");
  });

  it("rejects more than 29 earlier learner messages", () => {
    const history = [
      ...Array.from({ length: 30 }, () => [gemma("はい。"), learner("はい。")]).flat(),
      gemma("はい。"),
    ];

    expect(rejection({ scenarioId: "izakaya-ramen", history, message: "はい" })).toMatch(
      /restart/i,
    );
  });

  it("AC-001.2: rejects a learner message before Gemma's opening line", () => {
    expect(rejection({ scenarioId: "izakaya-ramen", history: [], message: "はい" })).not.toBe("");
  });

  it.each([
    ["starts with the learner", [learner("はい"), gemma("はい。")]],
    ["ends with the learner", [gemma("はい。"), learner("はい")]],
  ])("rejects history that %s", (_name, history) => {
    expect(rejection({ scenarioId: "izakaya-ramen", history, message: "はい" })).not.toBe("");
  });

  it("AC-002.4: applies the 200-character limit to earlier learner messages too", () => {
    const history = [gemma("はい。"), learner("あ".repeat(201)), gemma("はい。")];

    expect(rejection({ scenarioId: "izakaya-ramen", history, message: "はい" })).not.toBe("");
  });

  it("rejects a history entry longer than 400 characters", () => {
    const history = [gemma("あ".repeat(401))];

    expect(rejection({ scenarioId: "izakaya-ramen", history, message: "はい" })).not.toBe("");
  });

  it.each([null, "text", { scenarioId: "izakaya-ramen" }, { history: [], message: null }])(
    "rejects a malformed body %j",
    (body) => {
      expect(rejection(body)).not.toBe("");
    },
  );
});
