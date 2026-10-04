import { describe, expect, it } from "vitest";

import { buildMessages, retryMessages } from "../src/prompt.js";
import { SCENARIOS } from "../src/scenarios.js";

const ramen = SCENARIOS.find((scenario) => scenario.id === "izakaya-ramen")!;

describe("buildMessages", () => {
  it("puts the scenario role, goal, level and JSON rules in the system prompt", () => {
    const [system] = buildMessages(ramen, [], null);

    expect(system?.role).toBe("system");
    expect(system?.content).toContain(ramen.role);
    expect(system?.content).toContain(ramen.goal);
    expect(system?.content).toMatch(/N5/);
    expect(system?.content).toMatch(/desu\/masu/);
    expect(system?.content).toMatch(/JSON/);
    expect(system?.content).toMatch(/never use the words/i);
  });

  it("AC-001.2: asks Gemma to speak first when the scene starts", () => {
    const messages = buildMessages(ramen, [], null);

    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain(ramen.opening);
  });

  it("AC-002.1: includes every earlier turn and the new message in order", () => {
    const messages = buildMessages(
      ramen,
      [
        { role: "gemma", text: "いらっしゃいませ。" },
        { role: "learner", text: "ラーメンをください。" },
        { role: "gemma", text: "はい、どうぞ。" },
      ],
      "みずをください。",
    );

    expect(messages.slice(1)).toEqual([
      { role: "user", content: expect.stringContaining(ramen.opening) as unknown },
      { role: "assistant", content: "いらっしゃいませ。" },
      { role: "user", content: "ラーメンをください。" },
      { role: "assistant", content: "はい、どうぞ。" },
      { role: "user", content: "みずをください。" },
    ]);
  });
});

describe("retryMessages", () => {
  it("AC-003.2: feeds the invalid answer and the reason back to the model", () => {
    const first = buildMessages(ramen, [], null);

    const retry = retryMessages(first, "{not json", "the answer is not valid JSON");

    expect(retry.slice(0, first.length)).toEqual(first);
    expect(retry.at(-2)).toEqual({ role: "assistant", content: "{not json" });
    expect(retry.at(-1)?.content).toContain("the answer is not valid JSON");
  });

  it("bounds the echoed answer and the reason, without splitting characters", () => {
    const first = buildMessages(ramen, [], null);

    const retry = retryMessages(first, "🍜".repeat(5000), "x".repeat(5000));

    expect([...(retry.at(-2)?.content ?? "")]).toHaveLength(4000);
    expect(retry.at(-2)?.content).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(retry.at(-1)?.content.length).toBeLessThan(700);
  });
});
