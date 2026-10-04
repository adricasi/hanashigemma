import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { loadConfig } from "../src/config.js";
import { createModelAdapter } from "../src/model/factory.js";
import { createApp } from "../src/server/app.js";
import { validReply, validReplyJson } from "./fixtures.js";

const servers: Server[] = [];
let logSpy: MockInstance;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  logSpy.mockRestore();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** A stub that answers every request with `body` (each backend's own response format). */
async function stub(body: unknown): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function turnThrough(env: Record<string, string>, geminiBaseUrl?: string) {
  const config = loadConfig(env);
  const adapter = createModelAdapter(config, geminiBaseUrl ? { geminiBaseUrl } : {});
  const app = createApp({ config, staticRoot: "public", adapter });
  const response = await app.request("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenarioId: "izakaya-ramen", history: [], message: null }),
  });
  const body: unknown = await response.json();
  return { status: response.status, body };
}

describe("both backends", () => {
  it("AC-010.4: produce the same validated reply for the same model output", async () => {
    // Gemini may wrap JSON in a code fence; the shared validator strips it.
    const fenced = "```json\n" + validReplyJson() + "\n```";
    const ollamaUrl = await stub({ message: { role: "assistant", content: validReplyJson() } });
    const geminiUrl = await stub({ candidates: [{ content: { parts: [{ text: fenced }] } }] });

    const local = await turnThrough({ OLLAMA_URL: ollamaUrl });
    const hosted = await turnThrough(
      { GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "test-key" },
      `${geminiUrl}/v1beta`,
    );

    expect(local).toEqual({ status: 200, body: validReply() });
    expect(hosted).toEqual(local);
  });
});
