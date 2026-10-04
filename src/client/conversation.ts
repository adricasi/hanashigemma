import type { ScenarioView } from "./config.js";
import {
  checkDraft,
  MAX_MESSAGE_LENGTH,
  postTurn,
  type FetchFn,
  type HistoryEntry,
  type TurnBody,
} from "./turn-api.js";

// NFR-001: every piece of text goes through textContent, never innerHTML.

export interface ConversationOptions {
  root: Document;
  scenario: ScenarioView;
  fetchFn: FetchFn;
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

export function mountConversation({ root, scenario, fetchFn }: ConversationOptions): Conversation {
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

  const history: HistoryEntry[] = [];
  let pending = false;
  /** AC-001.2: the learner can only reply once Gemma's opening line has arrived. */
  let started = false;
  let lastBody: TurnBody | null = null;

  function appendLine(speaker: "learner" | "gemma", text: string): void {
    const item = root.createElement("li");
    item.className = `turn turn-${speaker}`;
    const label = root.createElement("span");
    label.className = "turn-speaker";
    label.textContent = speaker === "gemma" ? "Gemma" : "You";
    const line = root.createElement("p");
    line.className = "turn-text";
    line.lang = "ja";
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
    sendButton.disabled = value;
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
      appendLine("learner", body.message);
      // Only clear what was sent: the learner may have typed ahead while waiting.
      if (input.value.trim() === body.message) {
        input.value = "";
      }
    }
    started = true;
    history.push({ role: "gemma", text: result.turn.jp });
    appendLine("gemma", result.turn.jp);
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
  retryButton.addEventListener("click", () => {
    if (lastBody !== null && !pending) {
      void runTurn(lastBody);
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
