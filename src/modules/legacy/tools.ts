import { z } from "zod";
import type { ToolDefinition, ToolRegistry, ToolContext } from "../../core/registry.js";
import { config } from "../../config/env.js";
import { buildScplSource, compileShortcutBuffer } from "./shortcuts.js";
import { ShortcutStore } from "./store.js";

/**
 * Legacy modul: `create_shortcut` alat.
 *
 * Prima URL + token i generiše Apple `.shortcut` (binary plist) koji izvršava
 * HTTP zahtev sa `Authorization: Bearer <token>` header-om. Fajl se snima u
 * `ShortcutStore` i vraća se `downloadUrl` (posebna javna GET ruta ga servira).
 *
 * PAŽNJA — RAZLIKA TOKENA (zbog 3. agenta / Antigravity):
 *   - `KERYX_API_TOKEN`  = auth ZA PRISTUP Keryx gateway-u (server.ts middleware).
 *   - `token` (ovde)     = KORISNIČKI bearer ZA CILJNI API koji precica zove.
 *     Ovaj token se ugrađuje U sam .shortcut i vidljiv je svakome ko ga preuzme
 *     (to je poenta precice — da radi autonomno). Ne mešati ih.
 *
 * Format izlaza je JSON (da se uklopi u registar); binarni deo ide kroz
 * download rutu, ne kroz `result`.
 */

/**
 * Skup znakova dozvoljenih u bearer tokenu. Ograničenje je DVOJAKO:
 *  1) Bezbednost: sprečava ScPL/meta-karakter injection (uz escapeScplString).
 *  2) Realistično: pokriva JWT (base64url: `A-Za-z0-9-_.~`) i klasične API
 *     ključeve (`+/=`). Ostali znakovi se retko sreću u bearer tokenima.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;

const createShortcutInput = z.object({
  url: z
    .string()
    .url()
    .describe("Apsolutni URL koji precica poziva (npr. https://api.example.com/data)."),
  token: z
    .string()
    .min(1)
    .max(512)
    .regex(TOKEN_PATTERN, "Dozvoljeni znakovi: A-Z a-z 0-9 . _ ~ + / = -")
    .describe(
      "Bearer token za ciljni API (šalje se kao Authorization: Bearer <token>). " +
        "Ovo je token CILJNOG servisa, NE Keryx gateway token.",
    ),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .default("GET")
    .describe("HTTP metoda zahteva."),
  name: z
    .string()
    .min(1)
    .max(80)
    .default("Keryx Precica")
    .describe("Ime precice kako se prikazuje u Shortcuts aplikaciji."),
});

/** Singleton store — deli se između tool handler-a i download rute (server.ts). */
export const shortcutStore = new ShortcutStore({
  ttlMs: config.KERYX_SHORTCUT_TTL_MS,
  maxEntries: config.KERYX_SHORTCUT_STORE_MAX,
});

/** Konstruiše apsolutni download URL iz ctx.baseUrl i id-ja. */
function downloadUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/shortcuts/${id}`;
}

const createShortcutTool = {
  name: "create_shortcut",
  title: "Generiši Siri prečicu",
  description:
    "Prima URL i Bearer token, generiše Apple `.shortcut` fajl koji izvršava " +
    "HTTP zahtev ka tom URL-u sa `Authorization: Bearer <token>` header-om. " +
    "Vraća JSON sa `downloadUrl` sa kog iOS korisnik preuzima/dodaje prečicu. " +
    "Token je CILJNI API token (ugrađuje se u prečicu), ne Keryx gateway token.",
  module: "legacy",
  input: createShortcutInput,
  responseExample: {
    downloadUrl: "https://gateway.example.com/api/shortcuts/AbC123_xyz",
    shortcutName: "Keryx Precica",
    fileName: "keryx-precica.shortcut",
    format: "apple-shortcut-bplist",
    sizeBytes: 1557,
    expiresAt: "2026-06-20T12:10:00.000Z",
  },
  handler: (input, ctx: ToolContext) => {
    const source = buildScplSource({
      url: input.url,
      token: input.token,
      method: input.method,
      name: input.name,
    });
    const buffer = compileShortcutBuffer(source);
    const fileName = `${sanitizeFileName(input.name)}.shortcut`;
    const id = shortcutStore.put(buffer, fileName);
    const stored = shortcutStore.get(id);
    return {
      downloadUrl: downloadUrl(ctx.baseUrl, id),
      shortcutName: input.name,
      fileName,
      format: "apple-shortcut-bplist",
      sizeBytes: buffer.length,
      expiresAt: stored ? new Date(stored.expiresAt).toISOString() : undefined,
    };
  },
} satisfies ToolDefinition;

/**
 * Ime precice -> bezbedno ime fajla (ASCII, bez path/upload opasnih znakova).
 * Cuva citljivost koliko je moguce, ali garantuje da ne moze probiti u
 * Content-Disposition filename.
 */
function sanitizeFileName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w .-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60) || "keryx-precica"
  );
}

/**
 * Registruje Legacy alate u deljeni registar. Poziva se jednom na startu
 * (iz server.ts, istovremeno sa nextgen modulom).
 */
export function registerLegacyTools(registry: ToolRegistry): void {
  registry.register(createShortcutTool);
}
