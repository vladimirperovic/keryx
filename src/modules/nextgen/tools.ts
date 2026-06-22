import { z } from "zod";
import type { ToolDefinition, ToolRegistry } from "../../core/registry.js";
import { config } from "../../config/env.js";

/**
 * "Next-Gen" modul: srz gateway-a koja izlaze funkcije LLM agentima.
 *
 * Ovde definisemo POCETNE (seed) alate. Oni sluze dve svrhe:
 *  1) Daju OpenAPI shemi i MCP serveru stvarne, pozive operacije za MVP.
 *  2) Sluze kao OBRAZAC koji sledeci agenti kopiraju kada dodaju svoje alate
 *     (npr. Legacy modul registruje `create_shortcut` na isti nacin).
 */

const gatewayStatusTool: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "gateway_status",
  title: "Status gateway-a",
  description:
    "Vraca osnovne informacije o Keryx gateway-u i listu svih trenutno " +
    "registrovanih alata. Koristi se za otkrivanje (discovery) dostupnih funkcija.",
  module: "nextgen",
  input: z.object({}),
  responseExample: {
    name: "keryx",
    version: "0.1.0",
    tools: ["gateway_status", "echo"],
  },
  // Hendler se postavlja u `registerNextGenModule` (treba mu pristup registru).
  handler: () => {
    throw new Error("not wired");
  },
};

const echoTool = {
  name: "echo",
  title: "Echo poruke",
  description:
    "Vraca prosledjenu poruku. Demonstrativni alat koji pokazuje validaciju " +
    "ulaza i transformaciju — koristan za testiranje konekcije LLM <-> Keryx.",
  module: "nextgen",
  input: z.object({
    message: z.string().min(1).max(2000).describe("Tekst koji treba vratiti."),
    uppercase: z
      .boolean()
      .default(false)
      .describe("Ako je true, poruka se vraca velikim slovima."),
  }),
  responseExample: { message: "ZDRAVO, KERYX", length: 13 },
  handler: (input) => ({
    message: input.uppercase ? input.message.toUpperCase() : input.message,
    length: input.message.length,
  }),
} satisfies ToolDefinition;

/**
 * `site_stats`: generički most ka eksternom sajtu koji izlaže statistiku kao JSON.
 *
 * Prolaz (proxy): prosleđuje opcione upitne parametre konfigurisanom endpointu
 * (`SITE_STATS_URL`) uz `format=json`, i vraća njegov JSON. Domenska značenja
 * (koja polja, koji parametri) žive u SAMOM endpointu — Keryx ostaje generički.
 *
 * "forward" auth: caller token se prosleđuje endpointu, koji sam određuje scope
 * (npr. admin vidi sve, ograničeni token vidi samo svoj deo). Isti token tako
 * radi i u Siri prečici i u ChatGPT/Claude konektoru.
 *
 * Registruje se SAMO ako je `SITE_STATS_URL` postavljen.
 */
const siteStatsInput = z.object({
  params: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Opcioni query parametri koji se prosleđuju stats endpointu (npr. " +
        '{"q":"...","id":"..."}). Nazivi i značenje zavise od konkretnog sajta.',
    ),
});

const siteStatsTool = {
  name: "site_stats",
  title: "Statistika sajta",
  description:
    "Dohvata aktuelnu statistiku povezanog sajta preko konfigurisanog endpointa " +
    "(SITE_STATS_URL) i vraća JSON. Prosleđuje opcione upitne parametre i caller " +
    "token (pristup/scope određuje sam sajt). Oblik odgovora zavisi od sajta — " +
    "koristi za pitanja o sadržaju i stanju tog sajta.",
  module: "nextgen",
  auth: "forward",
  input: siteStatsInput,
  responseExample: { ok: true, data: { "...": "zavisi od sajta" } },
  handler: async (input, ctx) => {
    if (!config.SITE_STATS_URL) {
      throw new Error("site_stats nije konfigurisan: postavite SITE_STATS_URL.");
    }
    if (!ctx.callerToken) {
      throw new Error("Nedostaje token za pristup podacima sajta.");
    }
    const url = new URL(config.SITE_STATS_URL);
    for (const [key, value] of Object.entries(input.params ?? {})) {
      url.searchParams.set(key, String(value));
    }
    // `format` se postavlja POSLE params-a da ga pozivalac ne može pregaziti.
    url.searchParams.set("format", "json");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${ctx.callerToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) {
      throw new Error("Token nije prihvaćen (proverite da li je važeći/aktivan).");
    }
    if (!res.ok) {
      throw new Error(`Stats endpoint je vratio HTTP ${res.status}.`);
    }
    return await res.json();
  },
} satisfies ToolDefinition;

/**
 * Registruje sve Next-Gen alate u deljeni registar. Poziva se jednom na startu.
 */
export function registerNextGenModule(registry: ToolRegistry): void {
  // `gateway_status` mu treba sam registar da bi izlistao alate — zato ga
  // "ozivimo" ovde gde imamo referencu.
  registry.register({
    ...gatewayStatusTool,
    handler: () => ({
      name: "keryx",
      version: "0.1.0",
      tools: registry.list().map((t) => t.name),
    }),
  });

  registry.register(echoTool);

  // Opcioni alat: registruje se samo ako je endpoint konfigurisan, da javni klon
  // ne prikazuje nepodešen alat.
  if (config.SITE_STATS_URL) {
    registry.register(siteStatsTool);
  }
}
