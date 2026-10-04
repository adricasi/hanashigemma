import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { loadConfig } from "../src/config.js";
import { ModelUnavailableError, type ModelAdapter } from "../src/model/adapter.js";
import { createApp } from "../src/server/app.js";
import { fakeAdapter, validReply, validReplyJson } from "./fixtures.js";

let logSpy: MockInstance;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
});

function app(adapter: ModelAdapter, env: Record<string, string> = {}) {
  return createApp({ config: loadConfig(env), staticRoot: "public", adapter });
}

function postTurn(target: ReturnType<typeof app>, body: unknown) {
  return target.request("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const start = { scenarioId: "izakaya-ramen", history: [], message: null };

function loggedRecords(): Array<Record<string, unknown>> {
  return logSpy.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
}

describe("POST /api/turn", () => {
  it("AC-001.2: starts the scene with Gemma speaking first, in a structured reply", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(validReply());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.messages.at(-1)?.role).toBe("user");
    expect(requests[0]?.jsonSchema).toMatchObject({ type: "object" });
  });

  it("AC-002.1: generates the reply with the scenario and all earlier turns", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    await postTurn(app(adapter), {
      scenarioId: "izakaya-ramen",
      history: [{ role: "gemma", text: "いらっしゃいませ。" }],
      message: "ラーメンをください。",
    });

    const messages = requests[0]?.messages ?? [];
    expect(messages[0]?.content).toContain("izakaya");
    expect(messages.slice(-2)).toEqual([
      { role: "assistant", content: "いらっしゃいませ。" },
      { role: "user", content: "ラーメンをください。" },
    ]);
  });

  it("AC-001.3: rejects an unknown scenario with a client error and doesn't call the model", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    const response = await postTurn(app(adapter), { ...start, scenarioId: "tokyo-sushi" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(requests).toHaveLength(0);
  });

  it("AC-002.4: rejects a 201-character message, states the limit and doesn't call the model", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    const response = await postTurn(app(adapter), {
      scenarioId: "izakaya-ramen",
      history: [{ role: "gemma", text: "いらっしゃいませ。" }],
      message: "あ".repeat(201),
    });
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(400);
    expect(body.message).toContain("200");
    expect(requests).toHaveLength(0);
  });

  it("AC-002.3: rejects a whitespace-only message without calling the model", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    const response = await postTurn(app(adapter), { ...start, message: "   " });

    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it("rejects a body that is not JSON", async () => {
    const { adapter } = fakeAdapter([]);

    const response = await postTurn(app(adapter), "{not json");

    expect(response.status).toBe(400);
  });

  it("rejects a body larger than 32 KB as an invalid request, and logs it", async () => {
    const { adapter, requests } = fakeAdapter([]);

    const response = await postTurn(app(adapter), { ...start, padding: "x".repeat(33 * 1024) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
    expect(requests).toHaveLength(0);
    expect(loggedRecords()[0]).toMatchObject({ errorType: "invalid_request" });
  });

  it("rejects a body that isn't sent as JSON (no cross-site simple requests)", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    const response = await app(adapter).request("/api/turn", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(start),
    });

    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it("passes the request's abort signal to the model", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson()]);

    await postTurn(app(adapter), start);

    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-003.2: retries once with the validation error when the output is invalid", async () => {
    const { adapter, requests } = fakeAdapter(["not json at all", validReplyJson()]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-2)).toEqual({
      role: "assistant",
      content: "not json at all",
    });
    expect(requests[1]?.messages.at(-1)?.content).toMatch(/invalid/);
  });

  it("AC-003.4: retries when the segments don't join to the reply", async () => {
    const broken = { ...validReply(), segments: [{ text: "いらっしゃいませ" }] };
    const { adapter, requests } = fakeAdapter([JSON.stringify(broken), validReplyJson()]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("AC-003.3: answers a friendly error after a second invalid output", async () => {
    const { adapter, requests } = fakeAdapter(["nope", "still nope"]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "model_invalid_output",
      message: "Gemma got tongue-tied — try again",
    });
    expect(requests).toHaveLength(2);
  });

  it("AC-010.3: says Gemma is unavailable and hints to start Ollama when it can't be reached", async () => {
    const { adapter } = fakeAdapter([new ModelUnavailableError("unreachable")]);

    const response = await postTurn(app(adapter), start);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("model_unavailable");
    expect(body.message).toMatch(/unavailable/);
    expect(body.message).toMatch(/ollama serve/);
  });

  it("AC-010.3: answers 504 when the model times out", async () => {
    const { adapter, requests } = fakeAdapter([new ModelUnavailableError("timeout")]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ error: "model_unavailable" });
    expect(requests).toHaveLength(1);
  });

  it("AC-010.3: answers 504 when the retry times out, and logs the failed validation", async () => {
    const { adapter } = fakeAdapter(["nope", new ModelUnavailableError("timeout")]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(504);
    expect(loggedRecords()[0]).toMatchObject({
      attempts: 2,
      validation: "failed",
      errorType: "model_unavailable",
    });
  });

  it("AC-010.3: suggests pulling the model when Ollama answers with an error", async () => {
    const { adapter } = fakeAdapter([new ModelUnavailableError("upstream")]);

    const response = await postTurn(app(adapter), start);
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(503);
    expect(body.message).toContain("ollama pull gemma4:e4b");
  });

  it("NFR-007: logs the turn even when an unexpected error escapes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { adapter } = fakeAdapter([new RangeError("boom")]);

    try {
      const response = await postTurn(app(adapter), start);

      expect(response.status).toBe(500);
      expect(loggedRecords()[0]).toMatchObject({ attempts: 1, errorType: "internal" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("AC-010.3: leaves out the Ollama hint on the hosted backend", async () => {
    const { adapter } = fakeAdapter([new ModelUnavailableError("unreachable")]);

    const response = await postTurn(
      app(adapter, { GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "test-key" }),
      start,
    );

    expect(((await response.json()) as { message: string }).message).not.toMatch(/ollama/i);
  });

  it("NFR-007: logs one metadata record per turn and no message content", async () => {
    const { adapter } = fakeAdapter(["nope", validReplyJson()]);

    await postTurn(app(adapter), {
      scenarioId: "izakaya-ramen",
      history: [{ role: "gemma", text: "いらっしゃいませ。" }],
      message: "ラーメンをください。",
    });

    const records = loggedRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      scenarioId: "izakaya-ramen",
      backend: "ollama",
      model: "gemma4:e4b",
      attempts: 2,
      validation: "passed",
      errorType: null,
    });
    expect(records[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(logSpy.mock.calls)).not.toMatch(/ラーメン|いらっしゃいませ/);
  });

  it("NFR-007: logs the error type of a failed turn", async () => {
    const { adapter } = fakeAdapter(["nope", "nope"]);

    await postTurn(app(adapter), start);

    expect(loggedRecords()[0]).toMatchObject({
      attempts: 2,
      validation: "failed",
      errorType: "model_invalid_output",
    });
  });

  it("NFR-002: never logs a scenario id the client made up", async () => {
    const { adapter } = fakeAdapter([]);

    await postTurn(app(adapter), { ...start, scenarioId: "my secret text" });

    expect(loggedRecords()[0]).toMatchObject({
      scenarioId: "unknown",
      errorType: "invalid_request",
    });
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain("my secret text");
  });
});
