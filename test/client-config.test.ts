import { describe, expect, it } from "vitest";

import { backendLabel, parseConfigView } from "../src/client/config.js";

describe("backendLabel", () => {
  it("AC-010.5: names the local backend and the model", () => {
    expect(backendLabel("ollama", "gemma4:e4b")).toBe("Gemma · local (Ollama) · gemma4:e4b");
  });

  it("AC-010.5: names the hosted backend and the model", () => {
    expect(backendLabel("gemini", "gemma-4-26b-a4b-it")).toBe(
      "Gemma · hosted (Gemini API) · gemma-4-26b-a4b-it",
    );
  });
});

describe("parseConfigView", () => {
  const valid = {
    backend: "ollama",
    model: "gemma4:e4b",
    scenarios: [{ id: "izakaya-ramen", title: "Ordering ramen", goal: "Order", role: "Server" }],
  };

  it("accepts the /api/config response", () => {
    expect(parseConfigView(valid)).toEqual(valid);
  });

  it.each([
    ["null", null],
    ["unknown backend", { ...valid, backend: "openai" }],
    ["missing model", { ...valid, model: undefined }],
    ["scenarios not a list", { ...valid, scenarios: "nope" }],
    ["scenario missing title", { ...valid, scenarios: [{ id: "x", goal: "g", role: "r" }] }],
  ])("rejects a malformed response (%s)", (_name, input) => {
    expect(() => parseConfigView(input)).toThrow("Unexpected /api/config response");
  });
});
