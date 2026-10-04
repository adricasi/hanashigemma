// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import type { ConfigView } from "../../src/client/config.js";
import { renderBackend } from "../../src/client/header.js";

const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../public/index.html"),
  "utf8",
);

beforeEach(() => {
  // The real UI shell (trusted, repository file) so the tests track index.html.
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(indexHtml)?.[1] ?? "";
});

function config(backend: ConfigView["backend"]): ConfigView {
  return { backend, model: "gemma", scenarios: [] };
}

describe("renderBackend", () => {
  it("AC-010.5: shows the backend badge", () => {
    renderBackend(document, config("ollama"));

    expect(document.getElementById("backend-badge")?.textContent).toBe(
      "Gemma · local (Ollama) · gemma",
    );
  });

  it("NFR-002: tells hosted-demo users that Google processes their messages", () => {
    renderBackend(document, config("gemini"));

    const notice = document.getElementById("hosted-notice");
    expect(notice?.hidden).toBe(false);
    const text = notice?.textContent?.replace(/\s+/g, " ") ?? "";
    expect(text).toMatch(/Gemini API/);
    expect(text).toMatch(/run HanashiGemma locally/);
  });

  it("NFR-002: shows no notice when everything stays on the learner's computer", () => {
    renderBackend(document, config("ollama"));

    expect(document.getElementById("hosted-notice")?.hidden).toBe(true);
  });
});
