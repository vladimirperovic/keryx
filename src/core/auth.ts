import { timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import type { ToolDefinition } from "./registry.js";

/** Najveća prihvatljiva dužina Authorization header-a. */
const MAX_AUTH_HEADER_LENGTH = 8192;

/**
 * Izvlači bearer token iz Authorization header-a.
 *
 * Odbacuje kontrolne znakove, whitespace unutar tokena i predugačke headere pre
 * nego što vrednost dođe do autentikacione logike ili upstream servisa.
 */
export function bearerFromHeader(header: string | undefined): string {
  if (!header || header.length > MAX_AUTH_HEADER_LENGTH) return "";
  const match = /^Bearer[ \t]+([^\s\u0000-\u001F\u007F]+)$/i.exec(header);
  return match ? match[1] : "";
}

/** Konstantno-vremensko poređenje tokena iste dužine. */
export function safeTokenEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Provera autentikacije po alatu.
 *
 * - `forward` alat zahteva bearer koji se prosleđuje ciljnom servisu.
 * - `gateway` alat zahteva KERYX_API_TOKEN; auth bez tokena postoji samo van
 *   produkcije, jer konfiguracija u produkciji radi fail-closed.
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
