/** REQ-011: in-memory demo limits. Counters reset when the instance restarts (design.md). */

export type LimitResult = "ok" | "rate_limited" | "demo_busy";

export interface RateLimiterOptions {
  /** AC-011.1: turns per client per minute. */
  perMinute: number;
  /** AC-011.2: turns per UTC day; null means no cap (local backend, AC-011.4). */
  dailyCap: number | null;
  now?: () => number;
}

export interface RateLimiter {
  /** Counts one turn for the client if it is allowed. */
  take(clientKey: string): LimitResult;
  /** Number of clients currently tracked (for tests). */
  trackedClients(): number;
}

const MINUTE_MS = 60_000;

export function createRateLimiter({
  perMinute,
  dailyCap,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  // Fixed one-minute windows: simple, and a burst can at most double across a boundary.
  let window = -1;
  let perClient = new Map<string, number>();
  let day = "";
  let turnsToday = 0;

  return {
    take(clientKey) {
      const time = now();

      const currentWindow = Math.floor(time / MINUTE_MS);
      if (currentWindow !== window) {
        // A new minute: earlier counts no longer matter, so drop them (bounded memory).
        window = currentWindow;
        perClient = new Map();
      }
      const used = perClient.get(clientKey) ?? 0;
      if (used >= perMinute) {
        return "rate_limited";
      }

      const today = new Date(time).toISOString().slice(0, 10); // UTC date
      if (today !== day) {
        day = today;
        turnsToday = 0;
      }
      if (dailyCap !== null && turnsToday >= dailyCap) {
        return "demo_busy";
      }

      // Counted when the turn starts, whatever its outcome, and once even if it is retried:
      // conservative for the hosted quota (AC-011.2 says "served").
      perClient.set(clientKey, used + 1);
      turnsToday += 1;
      return "ok";
    },
    trackedClients: () => perClient.size,
  };
}
