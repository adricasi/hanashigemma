// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { buildGemmaTurn } from "../../src/client/render-turn.js";
import type { GemmaTurn } from "../../src/client/turn-api.js";

const turn: GemmaTurn = {
  jp: "ご注文は？",
  segments: [{ text: "ご" }, { text: "注文", reading: "ちゅうもん" }, { text: "は？" }],
  romaji: "Go-chuumon wa?",
  en: "What would you like to order?",
  breakdown: [],
  suggestions: [],
  fix: null,
};

function render(value: GemmaTurn = turn) {
  return buildGemmaTurn(document, value, "t1");
}

describe("buildGemmaTurn", () => {
  it("AC-004.1: shows the hiragana reading of every kanji segment as ruby text", () => {
    const line = render().querySelector(".turn-text");

    const rubies = [...(line?.querySelectorAll("ruby") ?? [])];
    expect(rubies).toHaveLength(1);
    expect(rubies[0]?.firstChild?.textContent).toBe("注文");
    expect(rubies[0]?.querySelector("rt")?.textContent).toBe("ちゅうもん");
  });

  it("AC-004.1: keeps segments without kanji as plain text, in reading order", () => {
    const line = render().querySelector(".turn-text");
    const withoutReadings = [...(line?.childNodes ?? [])]
      .map((node) => (node.nodeName === "RUBY" ? node.firstChild?.textContent : node.textContent))
      .join("");

    expect(withoutReadings).toBe("ご注文は？");
  });

  it("NFR-009: marks the Japanese line and the romaji with their languages", () => {
    const item = render();

    expect(item.querySelector(".turn-text")?.getAttribute("lang")).toBe("ja");
    expect(item.querySelector(".turn-romaji")?.getAttribute("lang")).toBe("ja-Latn");
    expect(item.querySelector(".turn-en")?.getAttribute("lang")).toBe("en");
  });

  it("AC-005.4: starts with romaji and English hidden and the button collapsed", () => {
    const item = render();
    const button = item.querySelector("button.translation-button");
    const panel = item.querySelector(".turn-translation") as HTMLElement;

    expect(panel.hidden).toBe(true);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-controls")).toBe(panel.id);
    expect(button?.textContent).toBe("Show romaji & English");
    expect(panel.querySelector(".turn-romaji")?.textContent).toBe("Go-chuumon wa?");
    expect(panel.querySelector(".turn-en")?.textContent).toBe("What would you like to order?");
  });

  it("NFR-001: shows markup in any model field as literal text", () => {
    const markup = '<img src="x" onerror="alert(1)">';
    const item = render({
      jp: `${markup}注`,
      segments: [{ text: markup }, { text: "注", reading: markup }],
      romaji: markup,
      en: markup,
      breakdown: [],
      suggestions: [],
      fix: null,
    });

    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector(".turn-text")?.textContent).toContain(markup);
    expect(item.querySelector("rt")?.textContent).toBe(markup);
    expect(item.querySelector(".turn-romaji")?.textContent).toBe(markup);
    expect(item.querySelector(".turn-en")?.textContent).toBe(markup);
  });
});

describe("tutor parts", () => {
  const full: GemmaTurn = {
    ...turn,
    breakdown: [
      { phrase: "注文", explanation: "Order (noun)." },
      { phrase: "は", explanation: "Topic particle." },
    ],
    suggestions: [
      { jp: "ラーメンをください。", romaji: "Raamen o kudasai.", en: "Ramen, please." },
      { jp: "みずをください。", romaji: "Mizu o kudasai.", en: "Water, please." },
    ],
    fix: {
      original: "ラーメンがください",
      natural: "ラーメンをください",
      issue: "particle",
      explanation: "So close! With ください the thing you ask for takes を.",
    },
  };

  it("AC-006.1: offers a collapsed Breakdown listing each phrase with its explanation", () => {
    const breakdown = buildGemmaTurn(document, full, "t2").querySelector("details.breakdown");

    expect(breakdown).not.toBeNull();
    expect((breakdown as HTMLDetailsElement).open).toBe(false);
    expect(breakdown?.querySelector("summary")?.textContent).toBe("Gemma's Breakdown");
    const phrases = [...(breakdown?.querySelectorAll("dt") ?? [])];
    expect(phrases.map((dt) => dt.textContent)).toEqual(["注文", "は"]);
    expect(phrases.every((dt) => dt.getAttribute("lang") === "ja")).toBe(true);
    expect([...(breakdown?.querySelectorAll("dd") ?? [])].map((dd) => dd.textContent)).toEqual([
      "Order (noun).",
      "Topic particle.",
    ]);
  });

  it("AC-007.1: shows each suggested reply in Japanese with its romaji and English", () => {
    const item = buildGemmaTurn(document, full, "t3");
    const buttons = [...item.querySelectorAll<HTMLButtonElement>("button.suggestion")];

    expect(buttons.map((button) => button.textContent)).toEqual([
      "ラーメンをください。",
      "みずをください。",
    ]);
    expect(buttons.every((button) => button.getAttribute("lang") === "ja")).toBe(true);
    const translations = [...item.querySelectorAll(".suggestion-translation")];
    expect(translations.map((t) => t.textContent)).toEqual([
      "Raamen o kudasai. — Ramen, please.",
      "Mizu o kudasai. — Water, please.",
    ]);
  });

  it("AC-008.1: shows the Gentle Fix above the reply with original, natural version, issue and explanation", () => {
    const item = buildGemmaTurn(document, full, "t4");
    const card = item.querySelector(".gentle-fix");
    const reply = item.querySelector(".turn-text");

    expect(card).not.toBeNull();
    expect(card!.compareDocumentPosition(reply!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card?.querySelector(".fix-original")?.textContent).toBe("ラーメンがください");
    expect(card?.querySelector(".fix-natural")?.textContent).toBe("ラーメンをください");
    expect(card?.querySelector(".fix-natural")?.getAttribute("lang")).toBe("ja");
    expect(card?.querySelector(".fix-issue")?.textContent).toBe("Particle");
    expect(card?.querySelector(".fix-explanation")?.textContent).toContain("So close!");
  });

  it("AC-008.4: labels the Gentle Fix encouragingly, never as wrong, incorrect or an error", () => {
    const card = buildGemmaTurn(document, full, "t5").querySelector(".gentle-fix");
    const label = card?.querySelector(".fix-label")?.textContent ?? "";

    expect(label).not.toBe("");
    expect(label).not.toMatch(/wrong|incorrect|error/i);
  });

  it("AC-008.6: labels a fix for English or romaji input as how to say it in Japanese", () => {
    const item = buildGemmaTurn(
      document,
      {
        ...full,
        fix: {
          original: "I want ramen",
          natural: "ラーメンをください。",
          issue: "other",
          explanation: "Here's how to ask for it in Japanese.",
        },
      },
      "t6",
    );

    expect(item.querySelector(".fix-issue")?.textContent).toBe("Tip");
    expect(item.querySelector(".fix-original")?.hasAttribute("lang")).toBe(false);
  });

  it("AC-008.3: shows no Gentle Fix when the learner's message was fine", () => {
    expect(
      buildGemmaTurn(document, { ...full, fix: null }, "t7").querySelector(".gentle-fix"),
    ).toBeNull();
  });

  it("NFR-001: shows markup in breakdown, suggestions and fix as literal text", () => {
    const markup = "<img src=x onerror=alert(1)>";
    const item = buildGemmaTurn(
      document,
      {
        ...full,
        breakdown: [{ phrase: markup, explanation: markup }],
        suggestions: [{ jp: markup, romaji: markup, en: markup }],
        fix: { original: markup, natural: markup, issue: "other", explanation: markup },
      },
      "t8",
    );

    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector("dt")?.textContent).toBe(markup);
    expect(item.querySelector("button.suggestion")?.textContent).toBe(markup);
    expect(item.querySelector(".fix-explanation")?.textContent).toBe(markup);
  });
});
