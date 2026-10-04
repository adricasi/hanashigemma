import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";

import { ConfigError, loadConfig, type Config } from "./config.js";
import { createApp } from "./server/app.js";

function readConfig(): Config | null {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return null;
    }
    throw error;
  }
}

const config = readConfig();
if (config === null) {
  // AC-010.2: refuse to start; the message above names the wrong settings.
  process.exitCode = 1;
} else {
  const staticRoot = fileURLToPath(new URL("./public/", import.meta.url));
  const app = createApp({ config, staticRoot });
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      JSON.stringify({
        message: "server started",
        port: info.port,
        backend: config.backend,
        model: config.model,
      }),
    );
  });
}
