import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { ModelUnavailableError } from "../src/model/adapter.js";
import { createOllamaAdapter, MODEL_TIMEOUT_MS } from "../src/model/ollama.js";

type Handler = (body: unknown, response: ServerResponse) => void;

let server: Server | undefined;

/** Starts a stub Ollama on a random local port and returns its base URL. */
async function stubOllama(handler: Handler): Promise<string> {
  server = createServer((request: IncomingMessage, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => handler(JSON.parse(raw) as unknown, response));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const request = {
  messages: [
    { role: "system" as const, content: "You are a ramen shop server." },
    { role: "user" as const, content: "ラーメンをください。" },
  ],
  jsonSchema: { type: "object" },
};

function reasonOf(error: unknown): string {
  expect(error).toBeInstanceOf(ModelUnavailableError);
  return (error as ModelUnavailableError).reason;
}

describe("Ollama adapter", () => {
  it("AC-010.4: sends the model, messages and JSON schema, and returns the content", async () => {
    let received: unknown;
    const baseUrl = await stubOllama((body, response) => {
      received = body;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: { role: "assistant", content: '{"jp":"はい"}' } }));
    });
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b" });

    const content = await adapter.generate(request);

    expect(content).toBe('{"jp":"はい"}');
    expect(received).toMatchObject({
      model: "gemma4:e4b",
      messages: request.messages,
      format: { type: "object" },
      stream: false,
      think: false,
      options: { num_predict: expect.any(Number) as unknown },
    });
  });

  it("NFR-004: waits 45 s per attempt by default", () => {
    expect(MODEL_TIMEOUT_MS).toBe(45_000);
  });

  it("keeps a path prefix in OLLAMA_URL", async () => {
    let path = "";
    server = createServer((incoming, response) => {
      path = incoming.url ?? "";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: { content: "{}" } }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const adapter = createOllamaAdapter({
      baseUrl: `http://127.0.0.1:${port}/ollama`,
      model: "gemma4:e4b",
    });

    await adapter.generate(request);

    expect(path).toBe("/ollama/api/chat");
  });

  it("stops waiting when the caller cancels (client went away)", async () => {
    const baseUrl = await stubOllama(() => {
      // Never answers.
    });
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b" });
    const controller = new AbortController();

    const pending = adapter.generate({ ...request, signal: controller.signal });
    controller.abort();
    const error = await pending.catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("cancelled");
  });

  it("NFR-004: gives up after the timeout", async () => {
    const baseUrl = await stubOllama(() => {
      // Never answers.
    });
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b", timeoutMs: 50 });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("timeout");
  });

  it("AC-010.3: reports Ollama as unreachable when nothing listens", async () => {
    const baseUrl = await stubOllama(() => undefined);
    server!.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b" });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("unreachable");
  });

  it("AC-010.3: reports an upstream failure on an error status", async () => {
    const baseUrl = await stubOllama((_body, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: 'model "gemma4:e4b" not found, try pulling it first' }));
    });
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b" });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("upstream");
  });

  it("reports an upstream failure on an unexpected response body", async () => {
    const baseUrl = await stubOllama((_body, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ unexpected: true }));
    });
    const adapter = createOllamaAdapter({ baseUrl, model: "gemma4:e4b" });

    const error = await adapter.generate(request).catch((caught: unknown) => caught);

    expect(reasonOf(error)).toBe("upstream");
  });
});
