import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { ModelUnavailableError } from "../src/model/adapter.js";
import { createGeminiAdapter } from "../src/model/gemini.js";

interface Received {
  url: string;
  headers: IncomingMessage["headers"];
  body: unknown;
}

type Handler = (received: Received, response: ServerResponse) => void;

let server: Server | undefined;

async function stubGemini(handler: Handler): Promise<string> {
  server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () =>
      handler(
        { url: request.url ?? "", headers: request.headers, body: JSON.parse(raw) as unknown },
        response,
      ),
    );
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1beta`;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

function answer(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const request = {
  messages: [
    { role: "system" as const, content: "You are a ramen shop server." },
    { role: "user" as const, content: "(Start the scene.)" },
    { role: "assistant" as const, content: "いらっしゃいませ。" },
    { role: "user" as const, content: "ラーメンをください。" },
  ],
  jsonSchema: { type: "object" },
};

const SECRET = "test-key-not-real";

function reasonOf(error: unknown): string {
  expect(error).toBeInstanceOf(ModelUnavailableError);
  return (error as ModelUnavailableError).reason;
}

describe("Gemini API adapter", () => {
  it("AC-010.4: calls generateContent with the system instruction and alternating roles", async () => {
    let received: Received | undefined;
    const baseUrl = await stubGemini((incoming, response) => {
      received = incoming;
      answer(response, 200, { candidates: [{ content: { parts: [{ text: '{"jp":"はい"}' }] } }] });
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    const content = await adapter.generate(request);

    expect(content).toBe('{"jp":"はい"}');
    expect(received?.url).toBe("/v1beta/models/gemma-4-26b-a4b-it:generateContent");
    expect(received?.body).toMatchObject({
      systemInstruction: { parts: [{ text: "You are a ramen shop server." }] },
      contents: [
        { role: "user", parts: [{ text: "(Start the scene.)" }] },
        { role: "model", parts: [{ text: "いらっしゃいませ。" }] },
        { role: "user", parts: [{ text: "ラーメンをください。" }] },
      ],
      generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } },
    });
  });

  it("NFR-001: sends the key in a header, never in the URL", async () => {
    let received: Received | undefined;
    const baseUrl = await stubGemini((incoming, response) => {
      received = incoming;
      answer(response, 200, { candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    await adapter.generate(request);

    expect(received?.headers["x-goog-api-key"]).toBe(SECRET);
    expect(received?.url).not.toContain(SECRET);
  });

  it("skips thought parts and joins the answer text", async () => {
    const baseUrl = await stubGemini((_incoming, response) => {
      answer(response, 200, {
        candidates: [
          {
            content: {
              parts: [
                { text: "Let me think…", thought: true },
                { text: '{"jp":' },
                { text: '"はい"}' },
              ],
            },
          },
        ],
      });
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    expect(await adapter.generate(request)).toBe('{"jp":"はい"}');
  });

  it("NFR-001: refuses to follow a redirect, so the key header can't go to another host", async () => {
    const baseUrl = await stubGemini((incoming, response) => {
      if (incoming.url === "/elsewhere") {
        // Would succeed if the adapter followed the redirect.
        answer(response, 200, { candidates: [{ content: { parts: [{ text: "{}" }] } }] });
        return;
      }
      response.writeHead(307, { location: "/elsewhere" });
      response.end();
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("unreachable");
  });

  it("AC-011.3: reports a quota problem on HTTP 429", async () => {
    const baseUrl = await stubGemini((_incoming, response) => {
      answer(response, 429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } });
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("quota");
  });

  it.each([400, 403, 500])("reports an upstream failure on HTTP %i", async (status) => {
    const baseUrl = await stubGemini((_incoming, response) => answer(response, status, {}));
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("upstream");
  });

  it("reports an upstream failure when there is no answer text (e.g. blocked)", async () => {
    const baseUrl = await stubGemini((_incoming, response) => {
      answer(response, 200, { promptFeedback: { blockReason: "SAFETY" } });
    });
    const adapter = createGeminiAdapter({ baseUrl, model: "gemma-4-26b-a4b-it", apiKey: SECRET });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("upstream");
  });

  it("NFR-004: gives up after the timeout", async () => {
    const baseUrl = await stubGemini(() => {
      // Never answers.
    });
    const adapter = createGeminiAdapter({
      baseUrl,
      model: "gemma-4-26b-a4b-it",
      apiKey: SECRET,
      timeoutMs: 50,
    });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("timeout");
  });
});
