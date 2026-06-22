import { config } from "./config/env.js";
import { createApp, cleanupLegacyStore } from "./server.js";

/**
 * Ulazna tacka procesa. Sastavlja app i pokrece HTTP server.
 */
function main(): void {
  const app = createApp();

  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(
      `[keryx] sluša na http://${config.HOST}:${config.PORT} ` +
        `(env=${config.NODE_ENV}, auth=${config.authEnabled ? "on" : "off"})`,
    );
    console.log(`[keryx] OpenAPI šema:  ${config.PUBLIC_BASE_URL}/openapi.json`);
    console.log(`[keryx] MCP endpoint:  ${config.PUBLIC_BASE_URL}/mcp`);
  });

  // Uredno gasenje (vazno za Docker SIGTERM).
  const shutdown = (signal: string) => {
    console.log(`[keryx] primljen ${signal}, gasim server...`);
    cleanupLegacyStore(); // BUG-007: čisti ShortcutStore timer i memoriju.
    server.close(() => process.exit(0));
    // Tvrdi prekid ako se ne ugasi za 10s.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
