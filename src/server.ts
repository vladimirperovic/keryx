import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { config } from "./config/env.js";
import { registry, type ToolContext } from "./core/registry.js";
import { bearerFromHeader, checkToolAuth } from "./core/auth.js";
import { buildOpenApiDocument, toolHttpPath } from "./core/openapi.js";
import {
  createMcpRequestHandler,
  mcpMethodNotAllowed,
} from "./modules/nextgen/mcp.js";
import { registerNextGenModule } from "./modules/nextgen/tools.js";
import { registerLegacyModule } from "./modules/legacy/index.js";
import { shortcutStore } from "./modules/legacy/tools.js";

const SERVICE = { name: "keryx", version: "0.1.1" } as const;

/**
 * Sastavlja kompletnu Express aplikaciju. Izdvojeno od `index.ts` (pokretanje)
 * da bi se app mogao instancirati i u testovima bez `listen()`.
 */
export function createApp(): Express {
  // 1) Moduli registruju svoje alate u deljeni registar.
  registerNextGenModule(registry);
  registerLegacyModule(registry);

  const ctx: ToolContext = { baseUrl: config.PUBLIC_BASE_URL };
  const app = express();

  // --- CORS politika (BUG-004) ---
  const corsOrigin = config.KERYX_CORS_ORIGIN === "*"
    ? "*"
    : config.KERYX_CORS_ORIGIN.split(",").map((o) => o.trim());
  app.use(cors({ origin: corsOrigin }));

  // --- Serve static files (Landing page) ---
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use(express.static(path.join(__dirname, "../public")));

  // --- Rate limiting (BUG-005) ---
  const limiter = rateLimit({
    windowMs: 60_000,              // 1 minut
    max: 100,                      // max 100 req/min po IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Previše zahteva. Pokušajte ponovo kasnije." },
  });
  app.use(limiter);

  // MCP transportu treba sirovo telo koje on sam parsira preko express.json();
  // limit je zastita od preteranih payload-a.
  app.use(express.json({ limit: "1mb" }));

  // --- JSON parse error handler (BUG-010) ---
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "status" in err && (err as NodeJS.ErrnoException & { status?: number }).status === 400) {
      res.status(400).json({ ok: false, error: "Neispravan JSON format." });
      return;
    }
    next(err);
  });

  // --- Javne rute (bez autentifikacije) ---

  // Health check za Docker / orchestrator.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: SERVICE.name, version: SERVICE.version });
  });

  // OpenAPI shema — namerno javna da je LLM/klijent moze procitati.
  app.get("/openapi.json", (_req, res) => {
    res.json(
      buildOpenApiDocument(registry, {
        baseUrl: config.PUBLIC_BASE_URL,
        version: SERVICE.version,
      }),
    );
  });

  // --- Download ruta za generisane .shortcut fajlove (BUG-002) ---
  // Javna: sam ID (128-bit crypto-random) je "capability URL" = autorizacija.
  app.get("/api/shortcuts/:id", (req, res) => {
    const entry = shortcutStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({
        ok: false,
        error: "Prečica nije pronađena ili je istekla.",
      });
      return;
    }
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${entry.fileName}"`,
      "Content-Length": String(entry.buffer.length),
      "Cache-Control": "no-store",
    });
    res.send(entry.buffer);
  });

  // --- Zaštićene rute: autentikacija PO ALATU (vidi core/auth.ts) ---
  // Nema globalnog gejta: "gateway" alati traže Keryx token, a "forward" alati
  // (building_stats) prosleđuju caller token ciljnom servisu radi per-stan scope-a.

  // MCP endpoint (Streamable HTTP, stateless). Pošto jedan endpoint nosi sve
  // alate, auth se proverava po pozivu alata UNUTAR MCP handler-a (mcp.ts).
  app.post("/mcp", createMcpRequestHandler(registry, ctx, SERVICE));
  app.get("/mcp", mcpMethodNotAllowed);
  app.delete("/mcp", mcpMethodNotAllowed);

  // REST izlaganje svakog alata: POST /api/tools/<name>.
  for (const tool of registry.list()) {
    app.post(toolHttpPath(tool.name), async (req, res) => {
      const caller = bearerFromHeader(req.header("authorization"));
      const authError = checkToolAuth(tool, caller);
      if (authError) {
        res.status(401).json({ ok: false, error: authError });
        return;
      }
      const parsed = tool.input.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          ok: false,
          error: "Neispravan ulaz.",
          details: parsed.error.format(),
        });
        return;
      }
      try {
        const reqCtx: ToolContext = { ...ctx, callerToken: caller };
        const result = await tool.handler(parsed.data, reqCtx);
        res.json({ ok: true, tool: tool.name, result });
      } catch (err) {
        console.error(`[keryx] Greska u alatu "${tool.name}":`, err);
        res.status(500).json({ ok: false, error: "Interna greska alata." });
      }
    });
  }

  // 404 za sve ostalo. Čoveka u browseru vodimo na landing; API klijent dobija
  // jasan JSON sa pokazivačima na korisne rute.
  app.use((req, res) => {
    if ((req.header("accept") ?? "").includes("text/html")) {
      res.redirect("/");
      return;
    }
    res.status(404).json({
      ok: false,
      error: "Putanja ne postoji. Vidi / (početna), /openapi.json (šema) ili /mcp (MCP).",
    });
  });

  return app;
}

/**
 * Čisti resurse Legacy modula (zaustavlja timer, briše entry-je).
 * Poziva se iz `index.ts` na graceful shutdown (BUG-007).
 */
export function cleanupLegacyStore(): void {
  shortcutStore.close();
}
