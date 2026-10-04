import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

import type { Config } from "../config.js";
import type { ModelAdapter } from "../model/adapter.js";
import { publicScenario, SCENARIOS } from "../scenarios.js";
import { handleTurn, rejectTurn } from "./turn.js";

/** design.md, Data model: request body ≤ 32 KB. */
const MAX_TURN_BODY_BYTES = 32 * 1024;

export interface AppOptions {
  config: Config;
  /** Absolute path of the directory holding the built UI (index.html, styles, js/). */
  staticRoot: string;
  adapter: ModelAdapter;
}

export function createApp({ config, staticRoot, adapter }: AppOptions): Hono {
  const app = new Hono();

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
        const result = rejectTurn({ config, adapter }, "The request is too large.");
        return c.json(result.body, result.status);
      },
    }),
    async (c) => {
      // JSON only: a text/plain POST from another site would skip the CORS preflight.
      if (!(c.req.header("content-type") ?? "").startsWith("application/json")) {
        const result = rejectTurn({ config, adapter }, "Requests must be sent as JSON.");
        return c.json(result.body, result.status);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        body = undefined; // Not JSON: rejected as an invalid turn below.
      }
      // The request's signal aborts the model call if the browser goes away.
      const result = await handleTurn({ config, adapter }, body, c.req.raw.signal);
      return c.json(result.body, result.status);
    },
  );

  app.use("/*", serveStatic({ root: staticRoot }));

  return app;
}
