import { describe, expect, it } from "vitest";

import { postTurn } from "../../src/client/turn-api.js";

const body = { scenarioId: "izakaya-ramen", history: [], message: null };
const valid = { jp: "はい", segments: [{ text: "はい" }], romaji: "hai", en: "Yes" };

function respondWith(data: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }),
    );
}

describe("postTurn", () => {
  it("accepts a reply with the fields the view renders", async () => {
    expect(await postTurn(respondWith(valid), body)).toEqual({ ok: true, turn: valid });
  });

  it.each([
    ["segments missing", { ...valid, segments: undefined }],
    ["segments not a list", { ...valid, segments: "はい" }],
    ["segment text not a string", { ...valid, segments: [{ text: 1 }] }],
    ["romaji missing", { ...valid, romaji: undefined }],
    ["English missing", { ...valid, en: undefined }],
  ])("REQ-003: treats a 200 reply with %s as an error, never a turn", async (_name, data) => {
    const result = await postTurn(respondWith(data), body);

    expect(result).toMatchObject({ ok: false, error: "unexpected", canRetry: true });
  });
});
