import { parse } from "scpl-macos-updated";

/**
 * Legacy modul (Apple Siri Shortcuts) — domenska jezgra.
 *
 * Ovde se ne zna ništa o Expressu, registru ni JSON izlazu — čisto generisanje
 * `.shortcut` (Apple binary property list) iz ulaznih podataka. HTTP/download
 * sloj je u `tools.ts` i `server.ts`.
 *
 * Biblioteka: `scpl-macos-updated` (MIT, aktivan fork `scpl`-a). Kompajlira ScPL
 * tekstualni jezik u binary plist. API: `parse(source, { make: ["shortcutplist"] })`
 * → `{ shortcutplist: Buffer }` (magic "bplist00").
 */

/** HTTP metode koje podržava Apple "Get Contents of URL" akcija. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Ulaz za gradnju jedne precice. Sve je vec validirano (Zod) pre poziva. */
export interface ShortcutInput {
  /** Ciljni URL koji precica poziva. Mora biti apsolutan. */
  readonly url: string;
  /** Bearer token koji se salje kao `Authorization: Bearer <token>` header. */
  readonly token: string;
  /** HTTP metoda zahteva. */
  readonly method: HttpMethod;
  /** Citljivo ime precice (postaje naziv u Shortcuts app-u). */
  readonly name: string;
}

/**
 * Escapuje string za bezbedno ubacivanje u ScPL dvodupli-navodnici literal.
 *
 * ScPL string literal: `"..."` sa backslash escape-om (`\"`, `\\`). Ovo je
 * ODBRAMBENI sloj ispred Zod validacije — token je vec ogranicen na siguran
 * skup znakova, a URL na `z.string().url()`, ali ako se ikada opuste pravila,
 * ovde se ne sme probiti iz string literala u ScPL sintaksu (injection).
 */
export function escapeScplString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    // Kontrolni karakteri koji nemaju posla u ScPL literalu.
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

/**
 * Gradi ScPL source koji: cita `<url>`, izvrsava HTTP zahtev sa
 * `Authorization: Bearer <token>` header-om, i prikazuje odgovor.
 *
 * Verifikovana formula:
 *   @set name "..."       -> postavlja interni naziv prečice (ScPL preprocessor)
 *   Text "<url>"           -> URL postaje INPUT GetContentsOfURL akcije
 *   GetContentsOfURL method=... advanced=true headers={...}
 *   ShowResult             -> prikaz odgovora korisniku
 *
 * `advanced=true` je obavezan: bez njega Shortcuts skriva headers/method
 * parametre (RequiredResources u WFDownloadURLAction definiciji).
 */
export function buildScplSource(input: ShortcutInput): string {
  const url = escapeScplString(input.url);
  const token = escapeScplString(input.token);
  const name = escapeScplString(input.name);
  return [
    `@set name "${name}"`,
    `Text "${url}"`,
    `GetContentsOfURL method="${input.method}" advanced=true headers={"Authorization": "Bearer ${token}"}`,
    `ShowResult`,
    "",
  ].join("\n");
}

/**
 * Kompajlira ScPL source u `.shortcut` binary property list (Buffer).
 * Baca gresku sa citljivom porukom ako ScPL odbije source (npr. bug u builder-u).
 */
export function compileShortcutBuffer(source: string): Buffer {
  let out: Record<string, unknown>;
  try {
    out = parse(source, { make: ["shortcutplist"] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[keryx] Kompajliranje ScPL-a nije uspelo: ${msg}`,
    );
  }
  const buf = out?.shortcutplist;
  if (!Buffer.isBuffer(buf)) {
    throw new Error(
      "[keryx] scpl nije vratio binary plist. Verovatno neslaganje API-ja.",
    );
  }
  return buf;
}
