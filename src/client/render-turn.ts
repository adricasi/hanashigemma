import type { GemmaTurn, Segment } from "./turn-api.js";

// NFR-001: model text only ever reaches the page through textContent and created elements.

export const SHOW_TRANSLATION = "Show romaji & English";
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

/**
 * One Gemma turn: the Japanese line with furigana, plus its romaji and English behind a
 * per-turn button (AC-005.2). Starts collapsed; the conversation applies the switches.
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

  item.append(speaker, japaneseLine(root, turn.segments), button, panel);
  return item;
}
