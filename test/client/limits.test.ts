import { describe, expect, it } from "vitest";

import { MAX_MESSAGE_LENGTH as CLIENT_LIMIT } from "../../src/client/turn-api.js";
import { MAX_MESSAGE_LENGTH as SERVER_LIMIT } from "../../src/turn-request.js";

describe("message length limit", () => {
  it("AC-002.4: the browser and the server agree on the limit", () => {
    expect(CLIENT_LIMIT).toBe(SERVER_LIMIT);
  });
});
