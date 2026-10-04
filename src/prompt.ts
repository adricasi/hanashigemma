import type { ChatMessage } from "./model/adapter.js";
import type { Scenario } from "./scenarios.js";
import type { HistoryEntry } from "./turn-request.js";

/** Longest invalid answer echoed back on the retry, to keep the prompt bounded. */
const MAX_ECHOED_ANSWER = 4000;
/** The validation reason quotes model text, so it is bounded too. */
const MAX_REASON = 500;

const EXAMPLE = JSON.stringify({
  jp: "いらっしゃいませ。ご注文は？",
  segments: [
    { text: "いらっしゃいませ。", reading: "" },
    { text: "ご", reading: "" },
    { text: "注文", reading: "ちゅうもん" },
    { text: "は？", reading: "" },
  ],
  romaji: "Irasshaimase. Go-chuumon wa?",
  en: "Welcome. What would you like to order?",
  breakdown: [
    { phrase: "いらっしゃいませ", explanation: "A fixed greeting staff use to welcome customers." },
    { phrase: "は", explanation: "Topic particle: “as for your order…”." },
  ],
  suggestions: [{ jp: "ラーメンをください。", romaji: "Raamen o kudasai.", en: "Ramen, please." }],
  fix: null,
  sceneEnded: false,
});

function systemPrompt(scenario: Scenario): string {
  return `You are role-playing a scene with a beginner learner of Japanese (JLPT N5–N4).
Scene: ${scenario.title}.
You play: ${scenario.role}. Always speak as this character and never speak as the learner.
The learner's goal: ${scenario.goal}

How to speak:
- Reply to the learner's last message in 1–2 short sentences of simple Japanese (JLPT N5–N4 vocabulary), polite desu/masu form. Fixed service phrases of your role (e.g. いらっしゃいませ) are fine.
- Help the learner move towards their goal.
- If the learner writes off-topic, stay in role and gently steer back to the scene in Japanese.

Answer ONLY with one JSON object, no other text:
- jp: YOUR answer as ${scenario.role}, responding to the learner. Never repeat or rephrase the learner's sentence (or its corrected version) as your own line.
- segments: jp split into short pieces, one piece per word. Joined in order, the segment texts must equal jp EXACTLY, including every punctuation mark such as 。、？！. EVERY segment has a "reading": the full hiragana reading if the piece contains any kanji (e.g. {"text":"何","reading":"なに"}, {"text":"注文","reading":"ちゅうもん"}), or "" if it has no kanji. Put each word that contains kanji in its own segment.
- romaji: jp in Hepburn romaji.
- en: a natural English translation of jp.
- breakdown: 1–4 items explaining particles (は, が, を, に, で, へ, と, も) or phrases used in jp. Each phrase must be copied exactly from jp; each explanation is one simple English sentence.
- suggestions: 1–2 things the LEARNER could say next, in simple desu/masu Japanese, each with romaji and English.
- fix: if the learner's last message has a mistake or unnatural phrasing, an object with original (the learner's sentence), natural (the natural version), issue (one of particle, politeness, vocabulary, grammar, other) and explanation (1–2 warm, encouraging English sentences). Still reply in jp to what the learner meant. If the message is natural and correct, or there is no learner message yet, fix is null. Writing a word in hiragana or katakana instead of kanji is not a mistake: never correct the writing system, and give no fix if the only difference would be kanji (e.g. "おかんじょう" vs "お勘定", "かまくら" vs "鎌倉"). If the learner writes in English or in romaji, give a fix whose natural is how to say it in Japanese (issue "other", explanation: a short, friendly note on how to say it), and still reply in jp to what they meant. Never use the words "wrong", "incorrect" or "error".
- sceneEnded: false.

Example answer:
${EXAMPLE}`;
}

/** AC-001.2 / AC-002.1: the scenario, every earlier turn and the new message, in order. */
export function buildMessages(
  scenario: Scenario,
  history: readonly HistoryEntry[],
  message: string | null,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(scenario) },
    // Gemma speaks first, but chat templates expect a user turn before the assistant's.
    { role: "user", content: `(Start the scene. ${scenario.opening})` },
  ];
  for (const entry of history) {
    messages.push({ role: entry.role === "gemma" ? "assistant" : "user", content: entry.text });
  }
  if (message !== null) {
    messages.push({ role: "user", content: message });
  }
  return messages;
}

/** AC-003.2: the retry shows the model its rejected answer and why it was rejected. */
export function retryMessages(
  messages: readonly ChatMessage[],
  invalidAnswer: string,
  reason: string,
): ChatMessage[] {
  return [
    ...messages,
    { role: "assistant", content: truncate(invalidAnswer, MAX_ECHOED_ANSWER) },
    {
      role: "user",
      content: `Your previous answer was invalid because ${truncate(reason, MAX_REASON)}. Answer again with only the corrected JSON object.`,
    },
  ];
}

/** Cuts by characters, so a surrogate pair (e.g. an emoji) is never split. */
function truncate(text: string, maxCharacters: number): string {
  return [...text].slice(0, maxCharacters).join("");
}
