import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { clientKey } from "../src/server/client-key.js";

async function keyFor(trustProxy: boolean, headers: Record<string, string>) {
  const app = new Hono();
  app.get("/", (c) => c.text(clientKey(c, trustProxy)));
  const response = await app.request("/", { headers });
  return response.text();
}

describe("clientKey", () => {
  it("AC-011.1: behind Cloud Run, uses the right-most X-Forwarded-For entry", async () => {
    // Entries on the left are whatever the client sent; the proxy appends the real address.
    const key = await keyFor(true, { "x-forwarded-for": "1.2.3.4, 203.0.113.7" });

    expect(key).toBe("203.0.113.7");
  });

  it("AC-011.1: ignores X-Forwarded-For unless the proxy is trusted", async () => {
    const key = await keyFor(false, { "x-forwarded-for": "203.0.113.7" });

    expect(key).not.toBe("203.0.113.7");
  });

  it("AC-011.1: groups IPv6 clients by their /64, so rotating addresses doesn't reset the limit", async () => {
    const first = await keyFor(true, { "x-forwarded-for": "2001:db8:aa:bb:1:2:3:4" });
    const rotated = await keyFor(true, { "x-forwarded-for": "2001:db8:aa:bb:ffff::9" });
    const otherNetwork = await keyFor(true, { "x-forwarded-for": "2001:db8:aa:cc::1" });

    expect(first).toBe(rotated);
    expect(first).toBe("2001:db8:aa:bb::/64");
    expect(otherNetwork).not.toBe(first);
  });

  it("expands :: before taking the /64 prefix", async () => {
    expect(await keyFor(true, { "x-forwarded-for": "2001:db8::1" })).toBe("2001:db8:0:0::/64");
  });

  it("falls back to a shared key when no address is known", async () => {
    expect(await keyFor(false, {})).toBe("unknown");
    expect(await keyFor(true, { "x-forwarded-for": " , " })).toBe("unknown");
  });
});
