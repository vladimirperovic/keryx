import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors, { type CorsOptions } from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config/env.js";
import { ToolRegistry, type ToolContext } from "./core/registry.js";
import { bearerFromHeader, checkToolAuth } from "./core/auth.js";
import { buildOpenApiDocument, toolHttpPath } from "./core/openapi.js";
import { createMcpRequestHandler, mcpMethodNotAllowed } from "./modules/nextgen/mcp.js";
import { registerNextGenModule } from "./modules/nextgen/tools.js";
import { registerLegacyModule } from "./modules/legacy/index.js";
import { shortcutStore } from "./modules/legacy/tools.js";

const SERVICE = { name: "keryx", version: "0.1.1" } as const;

/** Sastavlja jednu izolovanu Express aplikaciju i njen tool registry. */
export function createApp(): Express {
  const registry = new ToolRegistry();
  registerNextGenModule(registry);
  registerLegacyModule(registry);

  const ctx: ToolContext = { baseUrl: config.PUBLIC_BASE_URL };
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  // Jedinstven request id olakšava dijagnostiku bez logovanja tokena ili tela.
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    next();
  });

  app.use(securityHeaders);

  const corsOrigin: CorsOptions["origin"] =
    config.KERYX_CORS_ORIGIN.trim() === ""
      ? false
      : config.KERYX_CORS_ORIGIN.trim() === "*"
        ? "*"
        : config.KERYX_CORS_ORIGIN.split(",").map((origin) => origin.trim());

  app.use(
    cors({
      origin: corsOrigin,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "Accept",
        "MCP-Protocol-Version",
        "MCP-Session-Id",
      ],
      exposedHeaders: ["MCP-Session-Id", "X-Request-Id"],
      maxAge: 86_400,
    }),
  );

  const limiter = rateLimit({
    windowMs: config.KERYX_RATE_LIMIT_WINDOW_MS,
    limit: config.KERYX_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { ok: false, error: "Previše zahteva. Pokušajte ponovo kasnije." },
  });
  app.use(["/mcp", "/api"], limiter);

  app.use(express.json({ limit: config.KERYX_JSON_LIMIT, strict: true }));

  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (
      err instanceof SyntaxError &&
      "status" in err &&
      (err as Error & { status?: number }).status === 400
    ) {
      res.status(400).json({
        ok: false,
        error: "Neispravan JSON format.",
        requestId: res.locals.requestId,
      });
      return;
    }
    next(err);
  });

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use(
    express.static(path.join(__dirname, "../public"), {
      etag: true,
      maxAge: config.isProduction ? "1h" : 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, service: SERVICE.name, version: SERVICE.version });
  });

  app.get("/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(
      buildOpenApiDocument(registry, {
        baseUrl: config.PUBLIC_BASE_URL,
        version: SERVICE.version,
      }),
    );
  });

  app.get("/api/shortcuts/:id", (req, res) => {
    const entry = shortcutStore.take(req.params.id);
    if (!entry) {
      res.status(404).json({
        ok: false,
        error: "Prečica nije pronađena, već je preuzeta ili je istekla.",
        requestId: res.locals.requestId,
      });
      return;
    }

    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${entry.fileName}"`,
      "Content-Length": String(entry.buffer.length),
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
    });
    res.send(entry.buffer);
  });

  app.post(
    "/mcp",
    (req, res, next) => {
      const origin = req.header("origin");
      if (origin && !isMcpOriginAllowed(origin)) {
        res.status(403).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Origin nije dozvoljen." },
          id: null,
        });
        return;
      }
      next();
    },
    createMcpRequestHandler(registry, ctx, SERVICE),
  );
  app.get("/mcp", mcpMethodNotAllowed);
  app.delete("/mcp", mcpMethodNotAllowed);

  for (const tool of registry.list()) {
    app.post(toolHttpPath(tool.name), async (req, res) => {
      const caller = bearerFromHeader(req.header("authorization"));
      const authError = checkToolAuth(tool, caller);
      if (authError) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="keryx"');
        res.status(401).json({
          ok: false,
          error: authError,
          requestId: res.locals.requestId,
        });
        return;
      }

      const parsed = tool.input.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          error: "Neispravan ulaz.",
          details: parsed.error.format(),
          requestId: res.locals.requestId,
        });
        return;
      }

      try {
        const reqCtx: ToolContext = { ...ctx, callerToken: caller };
        const result = await tool.handler(parsed.data, reqCtx);
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, tool: tool.name, result });
      } catch (err) {
        console.error(
          `[keryx] Greška u alatu "${tool.name}" (requestId=${res.locals.requestId}):`,
          err,
        );
        res.status(500).json({
          ok: false,
          error: "Interna greška alata.",
          requestId: res.locals.requestId,
        });
      }
    });
  }

  app.use((req, res) => {
    if ((req.header("accept") ?? "").includes("text/html")) {
      res.redirect("/");
      return;
    }
    res.status(404).json({
      ok: false,
      error: "Putanja ne postoji. Vidi /, /openapi.json ili /mcp.",
      requestId: res.locals.requestId,
    });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[keryx] Neobrađena HTTP greška (requestId=${res.locals.requestId}):`, err);
    if (res.headersSent) return;
    res.status(500).json({
      ok: false,
      error: "Interna greška servera.",
      requestId: res.locals.requestId,
    });
  });

  return app;
}

/** Validacija MCP Origin header-a prema Streamable HTTP bezbednosnim zahtevima. */
export function isMcpOriginAllowed(origin: string): boolean {
  if (origin === "null") return false;
  try {
    return config.mcpAllowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
  ];
  if (config.isProduction) csp.push("upgrade-insecure-requests");

  res.set({
    "Content-Security-Policy": csp.join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  });

  if (config.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

export function cleanupLegacyStore(): void {
  shortcutStore.close();
}
