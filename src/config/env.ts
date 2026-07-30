import "dotenv/config";
import { z } from "zod";

function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isOriginList(value: string, allowWildcard: boolean): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (allowWildcard && trimmed === "*") return true;
  return trimmed
    .split(",")
    .map((origin) => origin.trim())
    .every((origin) => origin.length > 0 && isOrigin(origin));
}

const CorsOriginListSchema = z
  .string()
  .refine((value) => isOriginList(value, true), {
    message: "Navedite `*` ili HTTP(S) origine bez putanje, razdvojene zarezom.",
  });

const McpOriginListSchema = z
  .string()
  .refine((value) => isOriginList(value, false), {
    message: "Navedite HTTP(S) origine bez putanje, razdvojene zarezom.",
  });

/**
 * Centralizovana i validirana konfiguracija okruženja.
 *
 * Niko izvan ovog modula ne čita `process.env` direktno. Time server dobija
 * fail-fast ponašanje, jedan izvor podrazumevanih vrednosti i izvedene vrednosti
 * koje su bezbedne za korišćenje u ostatku aplikacije.
 */
const RawEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((url) => url.replace(/\/+$/, "")),

  // Prazan string je dozvoljen samo van produkcije.
  KERYX_API_TOKEN: z.string().max(4096).optional().default(""),

  // Browser CORS. Prazno = CORS isključen; `*` je dozvoljen samo van produkcije.
  KERYX_CORS_ORIGIN: CorsOriginListSchema.default(""),

  // MCP Origin allow-list. Prazno = dozvoli samo origin iz PUBLIC_BASE_URL.
  KERYX_MCP_ALLOWED_ORIGINS: McpOriginListSchema.default(""),

  // Broj pouzdanih reverse-proxy hopova. 0 = direktna konekcija.
  KERYX_TRUST_PROXY: z.coerce.number().int().min(0).max(3).default(0),

  // Zaštita od preopterećenja.
  KERYX_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  KERYX_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  KERYX_JSON_LIMIT: z.string().min(2).max(16).default("1mb"),

  // Legacy modul (Siri Shortcuts).
  KERYX_SHORTCUT_TTL_MS: z.coerce.number().int().positive().default(600_000),
  KERYX_SHORTCUT_STORE_MAX: z.coerce.number().int().min(1).max(10_000).default(1000),

  // Ograničenje odgovora upstream servisa da se spreči iscrpljivanje memorije.
  KERYX_UPSTREAM_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10_000_000)
    .default(1_000_000),

  // Opciono; prazan string znači da se site_stats alat ne registruje.
  SITE_STATS_URL: z.union([z.literal(""), z.string().url()]).default(""),
});

const EnvSchema = RawEnvSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;

  if (env.KERYX_API_TOKEN.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["KERYX_API_TOKEN"],
      message: "U produkciji je obavezan nasumičan token od najmanje 32 znaka.",
    });
  }

  if (new URL(env.PUBLIC_BASE_URL).protocol !== "https:") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PUBLIC_BASE_URL"],
      message: "U produkciji PUBLIC_BASE_URL mora koristiti HTTPS.",
    });
  }

  if (env.KERYX_CORS_ORIGIN.trim() === "*") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["KERYX_CORS_ORIGIN"],
      message: "Wildcard CORS nije dozvoljen u produkciji; navedite konkretne origine.",
    });
  }

  if (env.SITE_STATS_URL && new URL(env.SITE_STATS_URL).protocol !== "https:") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SITE_STATS_URL"],
      message: "U produkciji SITE_STATS_URL mora koristiti HTTPS.",
    });
  }
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  console.error(
    `[keryx] Neispravna konfiguracija okruženja:\n${issues}\n` +
      "Proverite svoj .env fajl (videti .env.example).",
  );
  process.exit(1);
}

function commaSeparatedOrigins(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
}

const publicOrigin = new URL(parsed.data.PUBLIC_BASE_URL).origin;
const mcpAllowedOrigins = Object.freeze([
  ...new Set([publicOrigin, ...commaSeparatedOrigins(parsed.data.KERYX_MCP_ALLOWED_ORIGINS)]),
]);

export const config = Object.freeze({
  ...parsed.data,
  authEnabled: parsed.data.KERYX_API_TOKEN.length > 0,
  isProduction: parsed.data.NODE_ENV === "production",
  trustProxy: parsed.data.KERYX_TRUST_PROXY === 0 ? false : parsed.data.KERYX_TRUST_PROXY,
  mcpAllowedOrigins,
});

export type AppConfig = typeof config;
