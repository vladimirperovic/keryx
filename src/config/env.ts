import "dotenv/config";
import { z } from "zod";

/**
 * Centralizovana, validirana konfiguracija okruzenja.
 *
 * Pravilo arhitekture: niko u kodu ne cita `process.env` direktno — svi koriste
 * `config`. Tako imamo jedno mesto za validaciju, podrazumevane vrednosti i tipove.
 * Ako neka obavezna varijabla nedostaje ili je neispravna, server pada ODMAH na
 * startu (fail-fast), a ne tek kada stigne prvi request.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    // bez trailing slash-a da bismo cisto sastavljali URL-ove
    .transform((url) => url.replace(/\/+$/, "")),
  // Prazan string => autentifikacija iskljucena (samo lokalni razvoj).
  KERYX_API_TOKEN: z.string().optional().default(""),

  // --- Legacy modul (Siri Shortcuts) ---
  /** Koliko dugo (ms) generisana prečica ostaje dostupna za preuzimanje. */
  KERYX_SHORTCUT_TTL_MS: z.coerce.number().int().positive().default(600_000),
  /** Maksimalan broj prečica u memoriji (FIFO evikcija). */
  KERYX_SHORTCUT_STORE_MAX: z.coerce.number().int().positive().default(1000),

  // --- CORS ---
  /** Dozvoljeni CORS origin(i). `*` = svi. Višestruki razdvojeni zarezom. */
  KERYX_CORS_ORIGIN: z.string().default("*"),

  // --- site_stats alat (opciona integracija sa eksternim sajtom) ---
  /**
   * URL endpointa koji vraća statistiku sajta (kao JSON). Ako je prazno, alat
   * `site_stats` se NE registruje (tako javni klon ne prikazuje nepodešen alat).
   * Token se ne čuva ovde — `site_stats` je "forward" alat i prosleđuje caller
   * token tom endpointu, koji sam određuje scope.
   */
  SITE_STATS_URL: z.string().default(""),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Citljiva poruka umesto sirovog stack trace-a.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  console.error(
    `[keryx] Neispravna konfiguracija okruzenja:\n${issues}\n` +
      `Proverite svoj .env fajl (videti .env.example).`,
  );
  process.exit(1);
}

export const config = Object.freeze({
  ...parsed.data,
  /** Da li je autentifikacija aktivna (token postavljen). */
  authEnabled: parsed.data.KERYX_API_TOKEN.length > 0,
  isProduction: parsed.data.NODE_ENV === "production",
});

export type AppConfig = typeof config;
