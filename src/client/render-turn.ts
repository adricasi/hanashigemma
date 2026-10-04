import type {
  BreakdownItem,
  FixIssue,
  GemmaTurn,
  GentleFix,
  Segment,
  Suggestion,
} from "./turn-api.js";

// NFR-001: model text only ever reaches the page through textContent and created elements.

/** Hiragana, katakana and CJK ideographs. */
export const JAPANESE_SCRIPT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

export const SHOW_TRANSLATION = "Show romaji & English";

/** AC-008.4: an encouraging label; never "wrong", "incorrect" or "error". */
export const FIX_LABEL = "Gentle Fix — a more natural way to say it";

const ISSUE_LABELS: Record<FixIssue, string> = {
  particle: "Particle",
  politeness: "Politeness",
  vocabulary: "Word choice",
  grammar: "Grammar",
  other: "Tip",
};
export const HIDE_TRANSLATION = "Hide romaji & English";

/** AC-004.1: kanji segments become <ruby>text<rt>reading</rt></ruby>; the rest stay text. */
function japaneseLine(root: Document, segments: readonly Segment[]): HTMLParagraphElement {
  const line = root.createElement("p");
  line.className = "turn-text";
  line.lang = "ja";
  for (const segment of segments) {
    if (segment.reading === undefined) {
      line.append(root.createTextNode(segment.text));
      continue;
    }
    const ruby = root.createElement("ruby");
    const reading = root.createElement("rt");
    reading.textContent = segment.reading;
    ruby.append(root.createTextNode(segment.text), reading);
    line.append(ruby);
  }
  return line;
}

function paragraph(
  root: Document,
  className: string,
  lang: string,
  text: string,
): HTMLParagraphElement {
  const element = root.createElement("p");
  element.className = className;
  element.lang = lang;
  element.textContent = text;
  return element;
}

function element<K extends keyof HTMLElementTagNameMap>(
  root: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = root.createElement(tag);
  created.className = className;
  if (text !== undefined) {
    created.textContent = text;
  }
  return created;
}

/** AC-008.1: the learner's sentence, the natural version, the issue and why. */
function gentleFixCard(root: Document, fix: GentleFix): HTMLElement {
  const card = element(root, "div", "gentle-fix");
  card.setAttribute("role", "note");
  const header = element(root, "p", "fix-header");
  header.append(
    element(root, "span", "fix-label", FIX_LABEL),
    element(root, "span", "fix-issue", ISSUE_LABELS[fix.issue]),
  );
  const original = element(root, "p", "fix-original", fix.original);
  // AC-008.6: the learner may have written English or romaji.
  if (JAPANESE_SCRIPT.test(fix.original)) {
    original.lang = "ja";
  }
  const natural = element(root, "p", "fix-natural", fix.natural);
  natural.lang = "ja";
  card.append(
    header,
    element(root, "p", "fix-caption", "You wrote:"),
    original,
    element(root, "p", "fix-caption", "Try:"),
    natural,
    paragraph(root, "fix-explanation", "en", fix.explanation),
  );
  return card;
}

/** AC-006.1: collapsed by default, so the reply itself stays the focus. */
function breakdownSection(root: Document, items: readonly BreakdownItem[]): HTMLElement {
  const details = element(root, "details", "breakdown");
  const list = element(root, "dl", "breakdown-list");
  for (const item of items) {
    const phrase = element(root, "dt", "breakdown-phrase", item.phrase);
    phrase.lang = "ja";
    list.append(phrase, element(root, "dd", "breakdown-explanation", item.explanation));
  }
  details.append(element(root, "summary", "breakdown-summary", "Gemma's Breakdown"), list);
  return details;
}

/** AC-007.1: Japanese first; romaji and English follow the translation switches. */
function suggestionList(root: Document, suggestions: readonly Suggestion[]): HTMLElement {
  const section = element(root, "div", "suggestions");
  const list = element(root, "ul", "suggestion-list");
  for (const suggestion of suggestions) {
    const button = element(root, "button", "suggestion", suggestion.jp);
    button.type = "button";
    button.lang = "ja";
    button.title = "Copy into your reply";
    const translation = element(
      root,
      "span",
      "suggestion-translation",
      `${suggestion.romaji} — ${suggestion.en}`,
    );
    translation.hidden = true;
    const item = root.createElement("li");
    item.append(button, translation);
    list.append(item);
  }
  section.append(element(root, "p", "suggestions-heading", "You could say:"), list);
  return section;
}

/**
 * One Gemma turn: an optional Gentle Fix, the Japanese line with furigana, its romaji and
 * English behind a per-turn button (AC-005.2), the Breakdown and suggested replies.
 * Starts collapsed; the conversation applies the switches.
 */
export function buildGemmaTurn(root: Document, turn: GemmaTurn, id: string): HTMLLIElement {
  const item = root.createElement("li");
  item.className = "turn turn-gemma";

  const speaker = root.createElement("span");
  speaker.className = "turn-speaker";
  speaker.textContent = "Gemma";

  const panel = root.createElement("div");
  panel.className = "turn-translation";
  panel.id = `translation-${id}`;
  panel.hidden = true;
  panel.append(
    paragraph(root, "turn-romaji", "ja-Latn", turn.romaji),
    paragraph(root, "turn-en", "en", turn.en),
  );

  const button = root.createElement("button");
  button.type = "button";
  button.className = "translation-button secondary";
  button.textContent = SHOW_TRANSLATION;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", panel.id);

  item.append(speaker);
  if (turn.fix !== null) {
    item.append(gentleFixCard(root, turn.fix));
  }
  item.append(japaneseLine(root, turn.segments), button, panel);
  if (turn.breakdown.length > 0) {
    item.append(breakdownSection(root, turn.breakdown));
  }
  if (turn.suggestions.length > 0) {
    item.append(suggestionList(root, turn.suggestions));
  }
  return item;
}
