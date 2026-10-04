import type { GenerateRequest, ModelAdapter } from "../src/model/adapter.js";

/** A reply that passes the schema and every cross-check. */
export function validReply() {
  return {
    jp: "いらっしゃいませ。ご注文は？",
    segments: [
      { text: "いらっしゃいませ。ご" },
      { text: "注文", reading: "ちゅうもん" },
      { text: "は？" },
    ],
    romaji: "Irasshaimase. Go-chuumon wa?",
    en: "Welcome. What would you like to order?",
    breakdown: [
      { phrase: "いらっしゃいませ", explanation: "A fixed greeting staff use for customers." },
      { phrase: "は", explanation: "Marks the topic: as for your order…" },
    ],
    suggestions: [
      { jp: "ラーメンをください。", romaji: "Raamen o kudasai.", en: "Ramen, please." },
    ],
    fix: null,
    sceneEnded: false,
  };
}

export function validReplyJson(): string {
  return JSON.stringify(validReply());
}

/** Model adapter that returns (or throws) the given outputs in order and records each request. */
export function fakeAdapter(outputs: Array<string | Error>) {
  const requests: GenerateRequest[] = [];
  const adapter: ModelAdapter = {
    generate(request) {
      requests.push(request);
      const next = outputs.shift();
      if (next === undefined) {
        return Promise.reject(new Error("fake adapter: no more outputs"));
      }
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  return { adapter, requests };
}
