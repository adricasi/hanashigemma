// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { buildGemmaTurn } from "../../src/client/render-turn.js";
import type { GemmaTurn } from "../../src/client/turn-api.js";

const turn: GemmaTurn = {
  jp: "ご注文は？",
  segments: [{ text: "ご" }, { text: "注文", reading: "ちゅうもん" }, { text: "は？" }],
  romaji: "Go-chuumon wa?",
  en: "What would you like to order?",
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
    });

    expect(item.querySelector("img")).toBeNull();
    expect(item.querySelector(".turn-text")?.textContent).toContain(markup);
    expect(item.querySelector("rt")?.textContent).toBe(markup);
    expect(item.querySelector(".turn-romaji")?.textContent).toBe(markup);
    expect(item.querySelector(".turn-en")?.textContent).toBe(markup);
  });
});
