// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScenarioView } from "../../src/client/config.js";
import { mountConversation } from "../../src/client/conversation.js";
import type { FetchFn } from "../../src/client/turn-api.js";

const scenario: ScenarioView = {
  id: "izakaya-ramen",
  title: "Ordering ramen at an izakaya",
  goal: "Order a bowl of ramen and a drink, then ask for the bill.",
  role: "Server at a small neighbourhood izakaya",
};

// A path, not a URL: under happy-dom the global URL is happy-dom's, which fs rejects.
const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../public/index.html"),
  "utf8",
);

beforeEach(() => {
  // The real UI shell, so the tests break if index.html loses an element the code needs.
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
});

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`#${id} missing from public/index.html`);
  }
  return found as T;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function reply(jp: string) {
  return { jp, segments: [{ text: jp }], romaji: "", en: "", breakdown: [], suggestions: [] };
}

/** A fetch whose responses the test releases one at a time. */
function controlledFetch() {
  const pending: Array<(response: Response) => void> = [];
  const fetchFn = vi.fn<FetchFn>(
    () =>
      new Promise<Response>((resolve) => {
        pending.push(resolve);
      }),
  );
  const respond = async (response: Response) => {
    pending.shift()?.(response);
    await vi.waitFor(() => expect(element("waiting").hidden).toBe(true));
  };
  const bodyOf = (call: number) =>
    JSON.parse(fetchFn.mock.calls[call]?.[1]?.body as string) as Record<string, unknown>;
  return { fetchFn, respond, bodyOf };
}

async function startedConversation(firstLine = "いらっしゃいませ。") {
  const api = controlledFetch();
  const conversation = mountConversation({ root: document, scenario, fetchFn: api.fetchFn });
  conversation.start();
  await api.respond(jsonResponse(200, reply(firstLine)));
  return { ...api, conversation };
}

function typeAndSend(text: string) {
  element<HTMLTextAreaElement>("message-input").value = text;
  element<HTMLFormElement>("composer").requestSubmit();
}

function transcriptLines(): string[] {
  return [...element("transcript").querySelectorAll(".turn-text")].map(
    (line) => line.textContent ?? "",
  );
}

describe("conversation view", () => {
  it("AC-001.2: starts the scene and shows Gemma's opening line", async () => {
    const { fetchFn, bodyOf } = await startedConversation("いらっしゃいませ。");

    expect(fetchFn).toHaveBeenCalledWith("/api/turn", expect.objectContaining({ method: "POST" }));
    expect(bodyOf(0)).toEqual({ scenarioId: "izakaya-ramen", history: [], message: null });
    expect(element("conversation").hidden).toBe(false);
    expect(element("scene-title").textContent).toBe(scenario.title);
    expect(transcriptLines()).toEqual(["いらっしゃいませ。"]);
  });

  it("AC-002.2: shows a waiting indicator and blocks a second message while Gemma replies", async () => {
    const { respond, fetchFn } = await startedConversation();

    typeAndSend("ラーメンをください。");
    element<HTMLFormElement>("composer").requestSubmit();

    expect(fetchFn).toHaveBeenCalledTimes(2); // the opening line and one send, not two
    expect(element("waiting").hidden).toBe(false);
    expect(element<HTMLButtonElement>("send-button").disabled).toBe(true);
    await respond(jsonResponse(200, reply("はい、かしこまりました。")));
    expect(element("waiting").hidden).toBe(true);
    expect(element<HTMLButtonElement>("send-button").disabled).toBe(false);
  });

  it("AC-002.1: sends every earlier turn with the new message", async () => {
    const { respond, bodyOf } = await startedConversation("いらっしゃいませ。");

    typeAndSend("ラーメンをください。");
    await respond(jsonResponse(200, reply("はい。")));
    typeAndSend("みずもください。");

    expect(bodyOf(2)).toEqual({
      scenarioId: "izakaya-ramen",
      history: [
        { role: "gemma", text: "いらっしゃいませ。" },
        { role: "learner", text: "ラーメンをください。" },
        { role: "gemma", text: "はい。" },
      ],
      message: "みずもください。",
    });
    expect(transcriptLines()).toEqual(["いらっしゃいませ。", "ラーメンをください。", "はい。"]);
  });

  it("AC-002.3: does not send an empty or whitespace-only message", async () => {
    const { fetchFn } = await startedConversation();

    typeAndSend("   ");

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("AC-002.4: rejects a message over 200 characters, states the limit and keeps it", async () => {
    const { fetchFn } = await startedConversation();
    const long = "あ".repeat(201);

    typeAndSend(long);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(element("turn-error").hidden).toBe(false);
    expect(element("turn-error-text").textContent).toContain("200");
    expect(element<HTMLTextAreaElement>("message-input").value).toBe(long);
  });

  it("AC-003.3: shows the friendly error with a retry button, keeps the input and adds no turn", async () => {
    const { respond, fetchFn, bodyOf } = await startedConversation();

    typeAndSend("ラーメンをください。");
    await respond(
      jsonResponse(502, {
        error: "model_invalid_output",
        message: "Gemma got tongue-tied — try again",
      }),
    );

    expect(element("turn-error-text").textContent).toBe("Gemma got tongue-tied — try again");
    expect(element("retry-button").hidden).toBe(false);
    expect(element<HTMLTextAreaElement>("message-input").value).toBe("ラーメンをください。");
    expect(transcriptLines()).toEqual(["いらっしゃいませ。"]);

    element("retry-button").click();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(bodyOf(2)).toEqual(bodyOf(1));
    await respond(jsonResponse(200, reply("はい。")));
    expect(element("turn-error").hidden).toBe(true);
    expect(transcriptLines()).toEqual(["いらっしゃいませ。", "ラーメンをください。", "はい。"]);
    expect(element<HTMLTextAreaElement>("message-input").value).toBe("");
  });

  it("AC-003.3: Retry sends the message as the learner corrected it", async () => {
    const { respond, bodyOf } = await startedConversation();
    typeAndSend("ラーメンがください。");
    await respond(
      jsonResponse(502, { error: "model_invalid_output", message: "Gemma got tongue-tied" }),
    );

    element<HTMLTextAreaElement>("message-input").value = "ラーメンをください。";
    element("retry-button").click();

    expect(bodyOf(2)).toMatchObject({ message: "ラーメンをください。" });
  });

  it("AC-010.3: shows the unavailable message and keeps the learner's message", async () => {
    const { respond } = await startedConversation();

    typeAndSend("ラーメンをください。");
    await respond(
      jsonResponse(503, {
        error: "model_unavailable",
        message: "Gemma is unavailable. Is Ollama running? Start it with “ollama serve”.",
      }),
    );

    expect(element("turn-error-text").textContent).toMatch(/ollama serve/);
    expect(element<HTMLTextAreaElement>("message-input").value).toBe("ラーメンをください。");
  });

  it("keeps the message when the server can't be reached", async () => {
    const api = controlledFetch();
    const conversation = mountConversation({ root: document, scenario, fetchFn: api.fetchFn });
    conversation.start();
    await api.respond(jsonResponse(200, reply("いらっしゃいませ。")));
    api.fetchFn.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    typeAndSend("ラーメンをください。");

    await vi.waitFor(() => expect(element("turn-error").hidden).toBe(false));
    expect(element<HTMLTextAreaElement>("message-input").value).toBe("ラーメンをください。");
  });

  it("AC-001.2: blocks sending until Gemma's opening line arrives; Retry restarts the scene", async () => {
    const api = controlledFetch();
    const conversation = mountConversation({ root: document, scenario, fetchFn: api.fetchFn });
    conversation.start();
    await api.respond(
      jsonResponse(503, { error: "model_unavailable", message: "Gemma is unavailable." }),
    );

    expect(element<HTMLButtonElement>("send-button").disabled).toBe(true);
    typeAndSend("ラーメンをください。");
    expect(api.fetchFn).toHaveBeenCalledTimes(1);

    element("retry-button").click();
    expect(api.bodyOf(1)).toEqual({ scenarioId: "izakaya-ramen", history: [], message: null });
    await api.respond(jsonResponse(200, reply("いらっしゃいませ。")));
    typeAndSend("ラーメンをください。");
    expect(api.fetchFn).toHaveBeenCalledTimes(3);
  });

  it("locks the input while Gemma replies, so the sent text can't be edited mid-turn", async () => {
    const { respond } = await startedConversation();

    typeAndSend("ラーメンをください。");
    expect(element<HTMLTextAreaElement>("message-input").readOnly).toBe(true);
    await respond(jsonResponse(200, reply("はい。")));

    expect(element<HTMLTextAreaElement>("message-input").readOnly).toBe(false);
    expect(element<HTMLTextAreaElement>("message-input").value).toBe("");
  });

  it("does not offer Retry for a request the server rejected", async () => {
    const { respond } = await startedConversation();

    typeAndSend("ラーメンをください。");
    await respond(jsonResponse(400, { error: "invalid_request", message: "Not valid." }));

    expect(element("turn-error-text").textContent).toBe("Not valid.");
    expect(element("retry-button").hidden).toBe(true);
  });

  describe("Enter key", () => {
    function pressEnter(init: KeyboardEventInit) {
      element("message-input").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
      );
    }

    it("sends on Enter", async () => {
      const { fetchFn } = await startedConversation();
      element<HTMLTextAreaElement>("message-input").value = "はい";

      pressEnter({});

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["Shift+Enter (new line)", { shiftKey: true }],
      ["Enter that confirms IME input", { isComposing: true }],
      ["Safari's IME confirmation (keyCode 229)", { keyCode: 229 }],
    ])("does not send on %s", async (_name, init) => {
      const { fetchFn } = await startedConversation();
      element<HTMLTextAreaElement>("message-input").value = "はい";

      pressEnter(init);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  it("NFR-001: shows markup in model output as literal text", async () => {
    await startedConversation('<img src="x" onerror="alert(1)">');

    expect(transcriptLines()).toEqual(['<img src="x" onerror="alert(1)">']);
    expect(element("transcript").querySelector("img")).toBeNull();
  });
});
