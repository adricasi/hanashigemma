import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config.js";

function configError(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected loadConfig to throw a ConfigError");
}

describe("loadConfig", () => {
  it("AC-010.1: defaults to the local Ollama backend with gemma4:e4b", () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      backend: "ollama",
      model: "gemma4:e4b",
      ollamaUrl: "http://127.0.0.1:11434",
      geminiApiKey: null,
      port: 8080,
      dailyTurnCap: 500,
      perMinuteLimit: 10,
    });
  });

  it("AC-010.1: reads the backend and model name from configuration", () => {
    const config = loadConfig({
      GEMMA_BACKEND: "gemini",
      GEMMA_MODEL: "gemma-4-31b-it",
      GEMINI_API_KEY: "test-key",
    });

    expect(config.backend).toBe("gemini");
    expect(config.model).toBe("gemma-4-31b-it");
    expect(config.geminiApiKey).toBe("test-key");
  });

  it("AC-010.1: uses the hosted default model for the gemini backend", () => {
    const config = loadConfig({ GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "test-key" });

    expect(config.model).toBe("gemma-4-26b-a4b-it");
  });

  it("NFR-001: listens on localhost only unless HOST says otherwise", () => {
    expect(loadConfig({}).host).toBe("127.0.0.1");
    expect(loadConfig({ HOST: "0.0.0.0" }).host).toBe("0.0.0.0");
    expect(loadConfig({ HOST: "::" }).host).toBe("::");
  });

  it("AC-010.2: refuses a HOST that is not an address or host name", () => {
    expect(configError({ HOST: "localhost; rm -rf /" }).message).toContain("HOST");
  });

  it("AC-010.1: reads the port and limits from configuration", () => {
    const config = loadConfig({ PORT: "3000", DAILY_TURN_CAP: "200", PER_MINUTE_LIMIT: "5" });

    expect(config).toMatchObject({ port: 3000, dailyTurnCap: 200, perMinuteLimit: 5 });
  });

  it("AC-010.2: refuses an unknown backend and names the setting", () => {
    const error = configError({ GEMMA_BACKEND: "openai" });

    expect(error.message).toContain("GEMMA_BACKEND");
  });

  it("AC-010.1: treats blank settings as unset and uses the defaults", () => {
    const config = loadConfig({ GEMMA_MODEL: "   ", GEMINI_API_KEY: "", PORT: "" });

    expect(config).toMatchObject({ model: "gemma4:e4b", geminiApiKey: null, port: 8080 });
  });

  it.each(["localhost:11434", "file:///tmp/x"])(
    "AC-010.2: refuses an OLLAMA_URL that is not http(s) (%s)",
    (url) => {
      expect(configError({ OLLAMA_URL: url }).message).toContain("OLLAMA_URL");
    },
  );

  it("AC-010.2: refuses the hosted backend with a blank credential", () => {
    expect(configError({ GEMMA_BACKEND: "gemini", GEMINI_API_KEY: "  " }).message).toContain(
      "GEMINI_API_KEY",
    );
  });

  it("AC-010.2: refuses the hosted backend without a credential", () => {
    const error = configError({ GEMMA_BACKEND: "gemini" });

    expect(error.message).toContain("GEMINI_API_KEY");
  });

  it("AC-010.2: reports every wrong setting at once", () => {
    const error = configError({ GEMMA_BACKEND: "openai", PORT: "not-a-port" });

    expect(error.problems).toHaveLength(2);
    expect(error.message).toContain("GEMMA_BACKEND");
    expect(error.message).toContain("PORT");
  });

  it("AC-010.2: never prints secret values", () => {
    const secret = "AIza-super-secret-value";
    const error = configError({
      GEMMA_BACKEND: "gemini",
      GEMINI_API_KEY: secret,
      PORT: "not-a-port",
    });

    expect(error.message).toContain("PORT");
    expect(error.message).not.toContain(secret);
  });
});
