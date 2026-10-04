import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

import type { Config } from "../config.js";
import type { ModelAdapter } from "../model/adapter.js";
import { publicScenario, SCENARIOS } from "../scenarios.js";
import { clientKey } from "./client-key.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
import { handleTurn, rejectTurn } from "./turn.js";

/** design.md, Data model: request body ≤ 32 KB. */
const MAX_TURN_BODY_BYTES = 32 * 1024;

/** Names (and HOST values) that mean "this machine only". */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** "localhost:8080" → "localhost", "[::1]:8080" → "[::1]". */
function hostnameOf(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return "";
  }
}

export interface AppOptions {
  config: Config;
  /** Absolute path of the directory holding the built UI (index.html, styles, js/). */
  staticRoot: string;
  adapter: ModelAdapter;
  /** Defaults to limits from the config; tests may pass their own. */
  limiter?: RateLimiter;
}

export function createApp({ config, staticRoot, adapter, limiter }: AppOptions): Hono {
  const app = new Hono();
  const turnContext = {
    config,
    adapter,
    limiter:
      limiter ??
      createRateLimiter({
        perMinute: config.perMinuteLimit,
        // AC-011.4: the daily cap protects the hosted quota only.
        dailyCap: config.backend === "gemini" ? config.dailyTurnCap : null,
      }),
  };

  // NFR-001: no inline scripts, no third-party origins, no framing.
  app.use(
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        // form-action has no default-src fallback; the UI only uses fetch().
        formAction: ["'none'"],
        // Makes the browser reject innerHTML-style sinks, backing up the textContent rule.
        requireTrustedTypesFor: ["'script'"],
      },
    }),
  );

  // DNS rebinding: a page on another site can point its own name at 127.0.0.1 and then call
  // this server as "same origin". A local install therefore only answers to local names.
  if (LOOPBACK_HOSTS.has(config.host)) {
    app.use(async (c, next) => {
      const host = c.req.header("host") ?? new URL(c.req.url).host;
      if (!LOOPBACK_HOSTS.has(hostnameOf(host))) {
        return c.text("Forbidden", 403);
      }
      await next();
    });
  }

  // Errors may carry learner text or upstream URLs, so only the error type is logged (NFR-002).
  app.onError((error, c) => {
    console.error(JSON.stringify({ message: "unhandled_error", errorType: error.name }));
    return c.json({ error: "internal", message: "Something went wrong. Please try again." }, 500);
  });

  app.get("/healthz", (c) => c.text("ok"));

  // Only public settings: the credential must never leave the server.
  app.get("/api/config", (c) =>
    c.json({
      backend: config.backend,
      model: config.model,
      scenarios: SCENARIOS.map(publicScenario),
    }),
  );

  app.post(
    "/api/turn",
    bodyLimit({
      maxSize: MAX_TURN_BODY_BYTES,
      onError: (c) => {
        const result = rejectTurn(config, "The request is too large.");
        return c.json(result.body, result.status);
      },
    }),
    async (c) => {
      // JSON only: a text/plain POST from another site would skip the CORS preflight.
      // Media types are case-insensitive (RFC 9110).
      const contentType = (c.req.header("content-type") ?? "").trim().toLowerCase();
      if (!contentType.startsWith("application/json")) {
        const result = rejectTurn(config, "Requests must be sent as JSON.");
        return c.json(result.body, result.status);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        body = undefined; // Not JSON: rejected as an invalid turn below.
      }
      // The request's signal aborts the model call if the browser goes away.
      const result = await handleTurn(turnContext, body, {
        signal: c.req.raw.signal,
        clientKey: clientKey(c, config.trustProxy),
      });
      return c.json(result.body, result.status);
    },
  );

  app.use("/*", serveStatic({ root: staticRoot }));

  return app;
}
