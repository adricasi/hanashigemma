import { describe, expect, it } from "vitest";

import { createRateLimiter } from "../src/server/rate-limit.js";

function clock(start: string) {
  let now = Date.parse(start);
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const MINUTE = 60_000;

describe("rate limiter", () => {
  it("AC-011.1: refuses the 11th turn from one client within a minute", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 10, dailyCap: null, now: time.now });

    const results = Array.from({ length: 11 }, () => limiter.take("client-a"));

    expect(results.slice(0, 10).every((result) => result === "ok")).toBe(true);
    expect(results[10]).toBe("rate_limited");
  });

  it("AC-011.1: lets the client continue in the next minute", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 2, dailyCap: null, now: time.now });
    limiter.take("client-a");
    limiter.take("client-a");
    expect(limiter.take("client-a")).toBe("rate_limited");

    time.advance(MINUTE);

    expect(limiter.take("client-a")).toBe("ok");
  });

  it("AC-011.1: counts each client separately", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 1, dailyCap: null, now: time.now });

    expect(limiter.take("client-a")).toBe("ok");
    expect(limiter.take("client-b")).toBe("ok");
    expect(limiter.take("client-a")).toBe("rate_limited");
  });

  it("AC-011.2: refuses new turns once the daily cap is reached", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 100, dailyCap: 3, now: time.now });

    const results = ["a", "b", "c", "d"].map((client) => limiter.take(client));

    expect(results).toEqual(["ok", "ok", "ok", "demo_busy"]);
  });

  it("AC-011.2: opens again at the next UTC day", () => {
    const time = clock("2026-10-04T23:59:00Z");
    const limiter = createRateLimiter({ perMinute: 100, dailyCap: 1, now: time.now });
    limiter.take("a");
    expect(limiter.take("b")).toBe("demo_busy");

    time.advance(MINUTE);

    expect(limiter.take("b")).toBe("ok");
  });

  it("AC-011.2: a turn refused by the per-minute limit does not use the daily cap", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 1, dailyCap: 2, now: time.now });
    limiter.take("a");
    expect(limiter.take("a")).toBe("rate_limited");

    expect(limiter.take("b")).toBe("ok");
  });

  it("AC-011.4: has no daily cap when none is configured", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 1_000_000, dailyCap: null, now: time.now });

    const refused = Array.from({ length: 2000 }, (_, i) => limiter.take(`c${i}`)).filter(
      (result) => result !== "ok",
    );

    expect(refused).toEqual([]);
  });

  it("forgets clients from earlier minutes, so memory stays bounded", () => {
    const time = clock("2026-10-04T10:00:00Z");
    const limiter = createRateLimiter({ perMinute: 10, dailyCap: null, now: time.now });
    for (let i = 0; i < 1000; i += 1) {
      limiter.take(`old-${i}`);
    }

    time.advance(MINUTE);
    limiter.take("new");

    expect(limiter.trackedClients()).toBe(1);
  });
});
