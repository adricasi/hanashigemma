import type { ScenarioView } from "./config.js";
import {
  buildGemmaTurn,
  HIDE_TRANSLATION,
  JAPANESE_SCRIPT,
  SHOW_TRANSLATION,
} from "./render-turn.js";
import {
  checkDraft,
  MAX_MESSAGE_LENGTH,
  postTurn,
  type FetchFn,
  type GemmaTurn,
  type HistoryEntry,
  type TurnBody,
} from "./turn-api.js";

// NFR-001: every piece of text goes through textContent, never innerHTML.

export interface ConversationOptions {
  root: Document;
  scenario: ScenarioView;
  fetchFn: FetchFn;
  /** AC-005.5: on for the hosted demo, off locally (reading practice). */
  alwaysShowTranslations?: boolean;
}

export interface Conversation {
  /** AC-001.2: show the conversation and ask Gemma for its opening line. */
  start(): void;
}

function required<T extends HTMLElement>(root: Document, id: string): T {
  const element = root.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element as T;
}

export function mountConversation({
  root,
  scenario,
  fetchFn,
  alwaysShowTranslations = false,
}: ConversationOptions): Conversation {
  const section = required(root, "conversation");
  const title = required(root, "scene-title");
  const goal = required(root, "scene-goal");
  const transcript = required(root, "transcript");
  const waiting = required(root, "waiting");
  const errorBox = required(root, "turn-error");
  const errorText = required(root, "turn-error-text");
  const retryButton = required<HTMLButtonElement>(root, "retry-button");
  const composer = required<HTMLFormElement>(root, "composer");
  const input = required<HTMLTextAreaElement>(root, "message-input");
  const sendButton = required<HTMLButtonElement>(root, "send-button");
  const furiganaToggle = required<HTMLInputElement>(root, "furigana-toggle");
  const translationToggle = required<HTMLInputElement>(root, "translation-toggle");

  const history: HistoryEntry[] = [];
  let pending = false;
  /** AC-001.2: the learner can only reply once Gemma's opening line has arrived. */
  let started = false;
  let lastBody: TurnBody | null = null;
  let gemmaTurns = 0;

  // AC-004.3: furigana starts on; AC-005.5: "Always show" starts from the backend.
  furiganaToggle.checked = true;
  translationToggle.checked = alwaysShowTranslations;

  /** AC-004.2: one switch for every reading in the conversation. */
  function applyFurigana(): void {
    for (const reading of transcript.querySelectorAll<HTMLElement>("rt")) {
      reading.hidden = !furiganaToggle.checked;
    }
  }

  /** AC-005.2–AC-005.4: a turn shows its translation if it was opened or "Always show" is on. */
  function applyTranslation(item: Element): void {
    const button = item.querySelector<HTMLButtonElement>("button.translation-button");
    const panel = item.querySelector<HTMLElement>(".turn-translation");
    if (button === null || panel === null) {
      return;
    }
    const opened = button.getAttribute("aria-expanded") === "true";
    const visible = opened || translationToggle.checked;
    panel.hidden = !visible;
    // AC-007.1: suggestions follow the same rule as the reply.
    for (const translation of item.querySelectorAll<HTMLElement>(".suggestion-translation")) {
      translation.hidden = !visible;
    }
    // With "Always show" on, the per-turn button has nothing to do.
    button.hidden = translationToggle.checked;
  }

  function appendGemmaTurn(turn: GemmaTurn): void {
    gemmaTurns += 1;
    const item = buildGemmaTurn(root, turn, `${scenario.id}-${gemmaTurns}`);
    const button = item.querySelector<HTMLButtonElement>("button.translation-button");
    button?.addEventListener("click", () => {
      const opened = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(opened));
      button.textContent = opened ? HIDE_TRANSLATION : SHOW_TRANSLATION;
      applyTranslation(item);
    });
    for (const suggestion of item.querySelectorAll<HTMLButtonElement>("button.suggestion")) {
      suggestion.addEventListener("click", () => {
        // AC-007.2: fill the input, don't send, so the learner can edit it first.
        if (pending) {
          return;
        }
        input.value = suggestion.textContent ?? "";
        input.focus();
      });
    }
    transcript.append(item);
    applyTranslation(item);
    applyFurigana();
  }

  function appendLearnerLine(text: string): void {
    const item = root.createElement("li");
    item.className = "turn turn-learner";
    const label = root.createElement("span");
    label.className = "turn-speaker";
    label.textContent = "You";
    const line = root.createElement("p");
    line.className = "turn-text";
    // NFR-009: learners may also write English or romaji (AC-008.6), which script detection
    // can't tell apart, so only real Japanese is marked; the rest inherits the page language.
    if (JAPANESE_SCRIPT.test(text)) {
      line.lang = "ja";
    }
    line.textContent = text;
    item.append(label, line);
    transcript.append(item);
  }

  function showError(message: string, canRetry: boolean): void {
    errorText.textContent = message;
    retryButton.hidden = !canRetry;
    errorBox.hidden = false;
  }

  function clearError(): void {
    errorText.textContent = "";
    errorBox.hidden = true;
    retryButton.hidden = true;
  }

  function setPending(value: boolean): void {
    // AC-002.2: one turn at a time, with a visible waiting indicator.
    pending = value;
    waiting.hidden = !value;
    updateControls();
  }

  function updateControls(): void {
    // Send works only once Gemma has opened the scene (AC-001.2) and no turn is in flight.
    sendButton.disabled = pending || !started;
    // Read-only, not disabled: the text stays focusable and readable, but what was sent
    // can't change mid-turn, so it can be cleared or kept as a whole afterwards.
    input.readOnly = pending;
  }

  async function runTurn(body: TurnBody): Promise<void> {
    lastBody = body;
    clearError();
    setPending(true);
    const result = await postTurn(fetchFn, body);
    setPending(false);

    if (!result.ok) {
      // AC-003.3 / AC-010.3: the learner's text stays in the input; no turn is added.
      showError(result.message, result.canRetry);
      return;
    }
    if (body.message !== null) {
      history.push({ role: "learner", text: body.message });
      appendLearnerLine(body.message);
      // The input was read-only during the turn, so it still holds exactly what was sent.
      input.value = "";
    }
    started = true;
    updateControls();
    history.push({ role: "gemma", text: result.turn.jp });
    appendGemmaTurn(result.turn);
    lastBody = null;
    input.focus();
  }

  function send(): void {
    if (pending || !started) {
      return;
    }
    const draft = checkDraft(input.value);
    if (draft.kind === "empty") {
      return; // AC-002.3
    }
    if (draft.kind === "too_long") {
      showError(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`, false); // AC-002.4
      return;
    }
    void runTurn({ scenarioId: scenario.id, history: [...history], message: draft.text });
  }

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    send();
  });
  input.addEventListener("keydown", (event) => {
    // Enter sends, Shift+Enter adds a line; Enter that confirms IME input is left alone.
    // Safari reports that Enter with isComposing false but keyCode 229.
    const confirmsIme = event.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !event.shiftKey && !confirmsIme) {
      event.preventDefault();
      send();
    }
  });
  furiganaToggle.addEventListener("change", applyFurigana);
  translationToggle.addEventListener("change", () => {
    for (const item of transcript.querySelectorAll(".turn-gemma")) {
      applyTranslation(item);
    }
  });
  retryButton.addEventListener("click", () => {
    if (pending) {
      return;
    }
    // The opening line has no learner text, so it is retried as is; a learner turn is
    // re-read from the input, which the learner may have corrected after the error.
    if (lastBody?.message === null) {
      void runTurn(lastBody);
    } else {
      send();
    }
  });

  return {
    start() {
      title.textContent = scenario.title;
      goal.textContent = `Your goal: ${scenario.goal}`;
      section.hidden = false;
      void runTurn({ scenarioId: scenario.id, history: [], message: null });
    },
  };
}
