import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { createApp } from "../src/server/app.js";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
];

let staticRoot: string;

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), "hanashigemma-public-"));
  writeFileSync(join(staticRoot, "index.html"), "<!doctype html><title>test</title>");
});

afterAll(() => {
  rmSync(staticRoot, { recursive: true, force: true });
});

function app(env: Record<string, string> = {}) {
  return createApp({ config: loadConfig(env), staticRoot });
}

describe("GET /healthz", () => {
  it("NFR-003: reports that the server is up", async () => {
    const response = await app().request("/healthz");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});

describe("GET /api/config", () => {
  it("AC-001.1: lists exactly the three scenarios with title, goal and Gemma's role", async () => {
    const response = await app().request("/api/config");
    const body = (await response.json()) as {
      scenarios: Array<{ id: string; title: string; goal: string; role: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.scenarios.map((scenario) => scenario.title)).toEqual([
      "Buying a train ticket at Shinjuku",
      "Ordering ramen at an izakaya",
      "Asking for directions in Kyoto",
    ]);
    for (const scenario of body.scenarios) {
      expect(scenario.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(scenario.goal.trim()).not.toBe("");
      expect(scenario.role.trim()).not.toBe("");
    }
  });

  it("AC-010.5: reports the backend and model name in use", async () => {
    const response = await app({ GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "secret-key" }).request(
      "/api/config",
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toMatchObject({ backend: "gemini", model: "gemma-4-26b-a4b-it" });
  });

  it("NFR-001: never exposes the credential", async () => {
    const response = await app({ GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "secret-key" }).request(
      "/api/config",
    );

    expect(await response.text()).not.toContain("secret-key");
  });
});

describe("security headers", () => {
  it.each(["/", "/healthz", "/api/config", "/does-not-exist"])(
    "NFR-001: %s carries a CSP that forbids inline and third-party scripts",
    async (path) => {
      const response = await app().request(path);
      const csp = response.headers.get("content-security-policy") ?? "";

      for (const directive of CSP_DIRECTIVES) {
        expect(csp).toContain(directive);
      }
      expect(csp).not.toContain("unsafe-inline");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );
});

describe("unexpected errors", () => {
  it("NFR-002: answer a generic 500 and log only the error type, never its message", async () => {
    const marker = "ラーメンをください key=AIza-secret";
    const testApp = app();
    testApp.get("/boom", () => {
      throw new TypeError(marker);
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await testApp.request("/boom");
      const logged = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String).join("\n");

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "internal",
        message: "Something went wrong. Please try again.",
      });
      expect(logged).toContain("TypeError");
      expect(logged).not.toContain("ラーメン");
      expect(logged).not.toContain("AIza-secret");
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe("static UI", () => {
  it("serves the UI shell at /", async () => {
    const response = await app().request("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("returns 404 for unknown paths", async () => {
    const response = await app().request("/does-not-exist");

    expect(response.status).toBe(404);
  });
});
