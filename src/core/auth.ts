import { timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import type { ToolDefinition } from "./registry.js";

/**
 * Pomoćne funkcije za autentikaciju gateway-a.
 *
 * Model (vidi `server.ts` / `mcp.ts`):
 *   - "gateway" alati (npr. create_shortcut) traže Keryx gateway token.
 *   - "forward" alati (building_stats) NE traže gateway token — token koji je
 *     pozivalac poslao se prosleđuje ciljnom servisu, koji sam odlučuje o scope-u.
 */

/** Izvuci bearer token iz `Authorization` header-a (prazno ako ga nema). */
export function bearerFromHeader(header: string | undefined): string {
  if (!header) return "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : "";
}

/** Konstantno-vremensko poređenje tokena (otporno na timing napade). */
export function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Provera autentikacije za jedan poziv alata. Vraća poruku greške ili `null` ako
 * je pristup dozvoljen. Deli je REST sloj (server.ts) i MCP sloj (mcp.ts).
 *
 *   - "forward" alat: traži DA postoji bilo kakav bearer (prosleđuje se dalje).
 *   - "gateway" alat: traži tačan KERYX_API_TOKEN (osim ako je auth isključen).
 */
export function checkToolAuth(tool: ToolDefinition, callerToken: string): string | null {
  if (tool.auth === "forward") {
    return callerToken ? null : "Nedostaje token (potreban za ovaj alat).";
  }
  if (!config.authEnabled) return null;
  return safeTokenEqual(callerToken, config.KERYX_API_TOKEN)
    ? null
    : "Nedostaje ili neispravan gateway token.";
}
