import { describe, expect, it } from "vitest";

import { formatTurnLog, type TurnLogRecord } from "../src/server/logger.js";

const record: TurnLogRecord = {
  requestId: "3f2b8c1e-0000-4000-8000-000000000000",
  scenarioId: "izakaya-ramen",
  backend: "ollama",
  model: "gemma4:e4b",
  latencyMs: 1234,
  attempts: 2,
  validation: "passed",
  errorType: null,
};

describe("formatTurnLog", () => {
  it("NFR-007: writes one JSON line with exactly the turn metadata fields", () => {
    const line = formatTurnLog(record);

    expect(line).not.toContain("\n");
    expect(Object.keys(JSON.parse(line) as object).sort()).toEqual(
      [
        "attempts",
        "backend",
        "errorType",
        "latencyMs",
        "model",
        "requestId",
        "scenarioId",
        "validation",
      ].sort(),
    );
    expect(JSON.parse(line)).toEqual(record);
  });

  it("NFR-002: drops any field that is not turn metadata, such as message content", () => {
    const withContent = {
      ...record,
      message: "ラーメンをください",
      reply: "はい、かしこまりました",
    };

    const line = formatTurnLog(withContent);

    expect(line).not.toContain("ラーメン");
    expect(line).not.toContain("かしこまりました");
    expect(JSON.parse(line)).toEqual(record);
  });
});
