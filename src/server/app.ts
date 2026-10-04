import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import type { Config } from "../config.js";
import { SCENARIOS } from "../scenarios.js";

export interface AppOptions {
  config: Config;
  /** Absolute path of the directory holding the built UI (index.html, styles, js/). */
  staticRoot: string;
}

export function createApp({ config, staticRoot }: AppOptions): Hono {
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
    c.json({ backend: config.backend, model: config.model, scenarios: SCENARIOS }),
  );

  app.use("/*", serveStatic({ root: staticRoot }));

  return app;
}
