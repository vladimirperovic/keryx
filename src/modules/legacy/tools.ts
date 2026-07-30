import { z } from "zod";
import type { ToolDefinition, ToolRegistry, ToolContext } from "../../core/registry.js";
import { config } from "../../config/env.js";
import { buildScplSource, compileShortcutBuffer } from "./shortcuts.js";
import { ShortcutStore } from "./store.js";

const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;

const shortcutTargetUrl = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    const url = new URL(value);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    const localDevHttp = !config.isProduction && isLocalhost && url.protocol === "http:";

    if (url.protocol !== "https:" && !localDevHttp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ciljni URL mora koristiti HTTPS (HTTP je dozvoljen samo za localhost u razvoju).",
      });
    }
    if (url.username || url.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ciljni URL ne sme sadržati username ili password.",
      });
    }
  });

const createShortcutInput = z.object({
  url: shortcutTargetUrl.describe("Apsolutni HTTPS URL koji prečica poziva."),
  token: z
    .string()
    .min(1)
    .max(512)
    .regex(TOKEN_PATTERN, "Dozvoljeni znakovi: A-Z a-z 0-9 . _ ~ + / = -")
    .describe("Bearer token ciljnog API-ja koji se ugrađuje u prečicu."),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  name: z.string().min(1).max(80).default("Keryx Prečica"),
});

export const shortcutStore = new ShortcutStore({
  ttlMs: config.KERYX_SHORTCUT_TTL_MS,
  maxEntries: config.KERYX_SHORTCUT_STORE_MAX,
});

function downloadUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/shortcuts/${id}`;
}

const createShortcutTool = {
  name: "create_shortcut",
  title: "Generiši Siri prečicu",
  description:
    "Generiše Apple `.shortcut` fajl koji poziva zadati HTTPS URL sa ciljnim " +
    "Bearer tokenom. Download link je kratak, nasumičan i može se iskoristiti samo jednom.",
  module: "legacy",
  input: createShortcutInput,
  responseExample: {
    downloadUrl: "https://gateway.example.com/api/shortcuts/AbC123_xyz",
    shortcutName: "Keryx Prečica",
    fileName: "keryx-precica.shortcut",
    format: "apple-shortcut-bplist",
    sizeBytes: 1557,
    expiresAt: "2026-06-20T12:10:00.000Z",
    singleUse: true,
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
      singleUse: true,
    };
  },
} satisfies ToolDefinition;

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

export function registerLegacyTools(registry: ToolRegistry): void {
  registry.register(createShortcutTool);
}
