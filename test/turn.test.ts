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

  it("accepts the JSON media type in any letter case", async () => {
    const { adapter } = fakeAdapter([validReplyJson()]);

    const response = await app(adapter).request("/api/turn", {
      method: "POST",
      headers: { "content-type": "Application/JSON; charset=utf-8" },
      body: JSON.stringify(start),
    });

    expect(response.status).toBe(200);
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

  it("AC-003.5: shows the retry without furigana where readings are still missing", async () => {
    const missing = JSON.stringify({
      ...validReply(),
      segments: validReply().segments.map(({ text }) => ({ text })),
    });
    const { adapter, requests } = fakeAdapter([missing, missing]);

    const response = await postTurn(app(adapter), start);
    const body = (await response.json()) as { segments: Array<{ reading?: string }> };

    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(body.segments.every((segment) => segment.reading === undefined)).toBe(true);
  });

  it("AC-003.5: still asks for the readings on the first attempt", async () => {
    const missing = JSON.stringify({
      ...validReply(),
      segments: validReply().segments.map(({ text }) => ({ text })),
    });
    const { adapter, requests } = fakeAdapter([missing, validReplyJson()]);

    const response = await postTurn(app(adapter), start);

    expect(await response.json()).toEqual(validReply());
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toMatch(/reading/);
  });

  it("AC-008.3: never shows a Gentle Fix on the opening line (the learner hasn't written yet)", async () => {
    const withFix = JSON.stringify({
      ...validReply(),
      fix: { original: "x", natural: "y", issue: "other", explanation: "z" },
    });
    const { adapter } = fakeAdapter([withFix]);

    const response = await postTurn(app(adapter), start);

    expect(((await response.json()) as { fix: unknown }).fix).toBeNull();
  });

  it("AC-003.5: still rejects a retry with other problems besides missing readings", async () => {
    const broken = JSON.stringify({
      ...validReply(),
      segments: validReply().segments.map(({ text }) => ({ text })),
      breakdown: [{ phrase: "ありがとう", explanation: "Not in the reply." }],
    });
    const { adapter } = fakeAdapter([broken, broken]);

    const response = await postTurn(app(adapter), start);

    expect(response.status).toBe(502);
  });

  describe("Gentle Fix is about the message just sent", () => {
    const earlier = [
      { role: "gemma", text: "いらっしゃいませ。" },
      { role: "learner", text: "おいしいです！" },
      { role: "gemma", text: "ありがとうございます。" },
    ];
    const withFix = (original: string, natural: string) =>
      JSON.stringify({
        ...validReply(),
        fix: { original, natural, issue: "particle", explanation: "A note." },
      });
    async function fixFor(message: string, original: string, natural: string) {
      const { adapter } = fakeAdapter([withFix(original, natural)]);
      const response = await postTurn(app(adapter), {
        scenarioId: "izakaya-ramen",
        history: earlier,
        message,
      });
      return ((await response.json()) as { fix: unknown }).fix;
    }

    it("AC-008.1: drops a fix that corrects an earlier message", async () => {
      expect(
        await fixFor("おかいけいをおねがいします。", "おいしいです！", "おいしいです。"),
      ).toBeNull();
    });

    it("AC-008.3: drops a fix that only changes punctuation or spacing", async () => {
      expect(await fixFor("おいしいです！", "おいしいです！", "おいしいです。")).toBeNull();
    });

    it("AC-008.1: keeps a real fix of the current message, ignoring punctuation differences", async () => {
      expect(
        await fixFor("ラーメンがください", "ラーメンがください。", "ラーメンをください。"),
      ).toMatchObject({
        natural: "ラーメンをください。",
      });
    });

    it("AC-008.6: keeps the Japanese version of an English message", async () => {
      expect(
        await fixFor(
          "I'd like a ramen, please.",
          "I'd like a ramen, please",
          "ラーメンをください。",
        ),
      ).toMatchObject({ natural: "ラーメンをください。" });
    });
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

  it("AC-011.1: refuses turns over the per-minute limit with a 'slow down' message", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson(), validReplyJson()]);
    const target = app(adapter, { PER_MINUTE_LIMIT: "2" });

    await postTurn(target, start);
    await postTurn(target, start);
    const response = await postTurn(target, start);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(429);
    expect(body.error).toBe("rate_limited");
    expect(body.message).toMatch(/slow down/i);
    expect(requests).toHaveLength(2);
    expect(loggedRecords().at(-1)).toMatchObject({ attempts: 0, errorType: "rate_limited" });
  });

  it("AC-011.1: counts a retried turn once", async () => {
    const { adapter, requests } = fakeAdapter(["nope", validReplyJson(), validReplyJson()]);
    const target = app(adapter, { PER_MINUTE_LIMIT: "1" });

    const first = await postTurn(target, start);
    const second = await postTurn(target, start);

    expect(first.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(second.status).toBe(429);
  });

  it("AC-011.3: answers demo_busy when the quota runs out on the retry", async () => {
    const { adapter } = fakeAdapter(["nope", new ModelUnavailableError("quota")]);
    const target = app(adapter, { GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "test-key" });

    const response = await postTurn(target, start);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "demo_busy" });
    expect(loggedRecords().at(-1)).toMatchObject({ attempts: 2, validation: "failed" });
  });

  it("AC-011.1: does not count rejected requests against the limit", async () => {
    const { adapter } = fakeAdapter([validReplyJson()]);
    const target = app(adapter, { PER_MINUTE_LIMIT: "1" });

    await postTurn(target, { ...start, scenarioId: "nope" });
    const response = await postTurn(target, start);

    expect(response.status).toBe(200);
  });

  it("AC-011.2: refuses turns over the daily cap on the hosted backend, pointing to the README", async () => {
    const { adapter, requests } = fakeAdapter([validReplyJson(), validReplyJson()]);
    const target = app(adapter, {
      GEMMA_BACKEND: "gemini",
      GEMINI_API_KEY: "test-key",
      DAILY_TURN_CAP: "1",
    });

    await postTurn(target, start);
    const response = await postTurn(target, start);
    const body = (await response.json()) as { error: string; message: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("demo_busy");
    expect(body.message).toMatch(/README/);
    expect(requests).toHaveLength(1);
  });

  it("AC-011.4: applies no daily cap on the local backend", async () => {
    const { adapter } = fakeAdapter([validReplyJson(), validReplyJson()]);
    const target = app(adapter, { DAILY_TURN_CAP: "1" });

    await postTurn(target, start);
    const response = await postTurn(target, start);

    expect(response.status).toBe(200);
  });

  it("AC-011.3: shows the same 'demo is busy' message when the hosted model hits its quota", async () => {
    const { adapter } = fakeAdapter([new ModelUnavailableError("quota")]);
    const target = app(adapter, { GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "test-key" });

    const response = await postTurn(target, start);
    const capped = app(fakeAdapter([validReplyJson()]).adapter, {
      GEMMA_BACKEND: "gemini",
      GEMINI_API_KEY: "test-key",
      DAILY_TURN_CAP: "1",
    });
    await postTurn(capped, start);
    const dailyCap = (await (await postTurn(capped, start)).json()) as { message: string };

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "demo_busy", message: dailyCap.message });
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
