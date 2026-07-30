import { z } from "zod";
import type { ToolDefinition, ToolRegistry } from "../../core/registry.js";
import { config } from "../../config/env.js";

const gatewayStatusTool: ToolDefinition<z.ZodObject<Record<string, never>>> = {
  name: "gateway_status",
  title: "Status gateway-a",
  description:
    "Vraća osnovne informacije o Keryx gateway-u i listu trenutno registrovanih alata.",
  module: "nextgen",
  input: z.object({}),
  responseExample: {
    name: "keryx",
    version: "0.1.1",
    tools: ["gateway_status", "echo"],
  },
  handler: () => {
    throw new Error("not wired");
  },
};

const echoTool = {
  name: "echo",
  title: "Echo poruke",
  description: "Vraća prosleđenu poruku; koristi se za testiranje konekcije.",
  module: "nextgen",
  input: z.object({
    message: z.string().min(1).max(2000).describe("Tekst koji treba vratiti."),
    uppercase: z.boolean().default(false).describe("Vrati poruku velikim slovima."),
  }),
  responseExample: { message: "ZDRAVO, KERYX", length: 13 },
  handler: (input) => ({
    message: input.uppercase ? input.message.toUpperCase() : input.message,
    length: input.message.length,
  }),
} satisfies ToolDefinition;

const queryKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/, "Parametar sadrži nedozvoljene znakove.");
const queryValue = z.string().max(512);

const siteStatsInput = z
  .object({
    params: z
      .record(queryKey, queryValue)
      .optional()
      .describe("Opcioni query parametri koji se prosleđuju stats endpointu."),
  })
  .superRefine((input, ctx) => {
    if (Object.keys(input.params ?? {}).length > 25) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["params"],
        message: "Dozvoljeno je najviše 25 query parametara.",
      });
    }
  });

const siteStatsTool = {
  name: "site_stats",
  title: "Statistika sajta",
  description:
    "Dohvata JSON sa konfigurisanog SITE_STATS_URL endpointa i prosleđuje caller token. " +
    "Upstream servis sam određuje korisnički scope i prava pristupa.",
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
      url.searchParams.set(key, value);
    }
    // Pozivalac ne može pregaziti format.
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${ctx.callerToken}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Token nije prihvaćen ili nema dovoljan scope.");
    }
    if (!response.ok) {
      throw new Error(`Stats endpoint je vratio HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
      throw new Error("Stats endpoint nije vratio JSON sadržaj.");
    }

    return await readBoundedJson(response, config.KERYX_UPSTREAM_MAX_BYTES);
  },
} satisfies ToolDefinition;

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Odgovor stats endpointa je prevelik.");
  }

  if (!response.body) throw new Error("Stats endpoint je vratio prazno telo.");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Odgovor stats endpointa je prevelik.");
    }
    chunks.push(Buffer.from(value));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Stats endpoint je vratio neispravan JSON.");
  }
}

export function registerNextGenModule(registry: ToolRegistry): void {
  registry.register({
    ...gatewayStatusTool,
    handler: () => ({
      name: "keryx",
      version: "0.1.1",
      tools: registry.list().map((tool) => tool.name),
    }),
  });

  registry.register(echoTool);
  if (config.SITE_STATS_URL) registry.register(siteStatsTool);
}
