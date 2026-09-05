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
      url.searchParams.set(key, String(value));
    }
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

const projectIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Neispravan project_id.");
const entityIdSchema = z.string().min(1).max(100);
const itemCodeSchema = z.string().min(1).max(120);
const nullableText = (max: number) => z.string().max(max).nullable().optional();
const nullableNonNegative = z.number().finite().nonnegative().nullable();

const renovationContextInput = z.object({
  project_id: projectIdSchema,
  history_limit: z.number().int().min(1).max(1000).default(100),
  days: z.number().int().min(1).max(90).default(14),
});

const renovationQuantitiesInput = z.object({
  project_id: projectIdSchema,
  q: z.string().max(200).optional(),
  target_type: z.enum(["task", "material", "ffe"]).optional(),
  item_code: z.string().max(120).optional(),
  room_id: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(1000).default(500),
});

const quantityPreviewInput = z
  .object({
    project_id: projectIdSchema,
    target_type: z.enum(["task", "material", "ffe"]).optional(),
    target_id: entityIdSchema.optional(),
    item_code: itemCodeSchema.optional(),
    room_id: entityIdSchema.optional(),
    new_quantity: z.number().finite().nonnegative(),
    reason: z.string().min(1).max(2000),
    comment: z.string().max(4000).optional(),
    requested_by: z.string().max(200).optional(),
    approved_by: z.string().max(200).optional(),
    author_name: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    source: z.string().max(120).default("ai_api"),
  })
  .refine((input) => Boolean(input.target_id || input.item_code), {
    message: "target_id ili item_code je obavezan.",
    path: ["target_id"],
  });

const quantityApplyPayloadSchema = z.object({
  target_type: z.enum(["task", "material", "ffe"]),
  target_id: entityIdSchema,
  item_code: z.string().max(120).nullable(),
  new_quantity: z.number().finite().nonnegative(),
  expected_previous_quantity: z.number().finite().nonnegative(),
  expected_baseline_quantity: nullableNonNegative,
  expected_unit_cost: z.number().finite().nullable(),
  expected_ordered_quantity: nullableNonNegative,
  expected_unit: z.string().max(60).nullable(),
  reason: z.string().min(1).max(2000),
  comment: nullableText(4000),
  requested_by: nullableText(200),
  approved_by: nullableText(200),
  author_name: nullableText(200),
  description: nullableText(2000),
  source: z.string().max(120).nullable().optional(),
});

const quantityApplyInput = z.object({
  project_id: projectIdSchema,
  preview_token: z.string().min(16).max(4096),
  apply_payload: quantityApplyPayloadSchema,
});

const taskPatchSchema = z
  .object({
    title: z.string().max(200).optional(),
    status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    done: z.boolean().optional(),
    worker_id: nullableText(100),
    room_id: nullableText(100),
    phase_id: nullableText(100),
    actual_cost: z.number().finite().nonnegative().nullable().optional(),
    start_date: nullableText(10),
    end_date: nullableText(10),
    actual_start: nullableText(10),
    actual_end: nullableText(10),
    priority: z.enum(["low", "normal", "high"]).optional(),
    notes: nullableText(2000),
    change_reason: nullableText(2000),
    source: z.string().max(120).default("ai_api"),
  })
  .strict();

const renovationUpdateTaskInput = z.object({
  project_id: projectIdSchema,
  task_id: entityIdSchema,
  patch: taskPatchSchema,
});

const renovationCreateTaskInput = z.object({
  project_id: projectIdSchema,
  title: z.string().min(1).max(200),
  budget_code: z.string().max(80).optional(),
  category: z.string().max(200).optional(),
  room_id: z.string().max(100).optional(),
  phase_id: z.string().max(100).optional(),
  worker_id: z.string().max(100).optional(),
  quantity: z.number().finite().nonnegative().optional(),
  unit: z.string().max(24).optional(),
  cost: z.number().finite().nonnegative().optional(),
  start_date: z.string().max(10).optional(),
  end_date: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
  source: z.string().max(120).default("ai_api"),
});

const renovationUpdateFfeInput = z.object({
  project_id: projectIdSchema,
  record_id: entityIdSchema,
  status: z
    .enum([
      "identified",
      "specified",
      "sample_pending",
      "approval_pending",
      "approved",
      "ordered",
      "in_production",
      "shipped",
      "delivered",
      "installed",
      "handed_over",
      "cancelled",
    ])
    .optional(),
  data: z
    .object({
      ordered_quantity: z.number().finite().nonnegative().optional(),
      received_quantity: z.number().finite().nonnegative().optional(),
      installed_quantity: z.number().finite().nonnegative().optional(),
      supplier: z.string().max(300).optional(),
      po_number: z.string().max(120).optional(),
      order_date: z.string().max(10).optional(),
      production_due: z.string().max(10).optional(),
      delivery_due: z.string().max(10).optional(),
      lead_time_days: z.number().int().min(0).max(3650).optional(),
      notes: z.string().max(8000).optional(),
    })
    .strict(),
});

function requireRenovationToken(callerToken: string | undefined): string {
  if (!config.RENOVATIONSTEPS_BASE_URL) {
    throw new Error("RenovationSteps integracija nije uključena.");
  }
  if (!callerToken) {
    throw new Error("Nedostaje RenovationSteps project API token.");
  }
  return callerToken;
}

async function renovationRequest(
  path: string,
  callerToken: string | undefined,
  options: { method?: "GET" | "POST" | "PUT"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const token = requireRenovationToken(callerToken);
  const base = new URL(config.RENOVATIONSTEPS_BASE_URL);
  const url = new URL(path, `${base.origin}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("RenovationSteps token nije prihvaćen ili nema potreban project scope.");
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new Error(`RenovationSteps je vratio neočekivan sadržaj (HTTP ${response.status}).`);
  }

  const body = await readBoundedJson(response, config.KERYX_UPSTREAM_MAX_BYTES);
  if (!response.ok) {
    // Validation/ambiguity/stale-preview payloads are intentionally returned to
    // the model: they contain safe candidate IDs or a request for a new preview.
    if (response.status >= 400 && response.status < 500) {
      return { upstream_http_status: response.status, ...(isRecord(body) ? body : { error: "RenovationSteps request rejected" }) };
    }
    throw new Error(`RenovationSteps je vratio HTTP ${response.status}.`);
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const renovationContextTool = {
  name: "renovation_project_context",
  title: "RenovationSteps project context",
  description:
    "Čita kompletno trenutno stanje jednog RenovationSteps projekta, uključujući taskove, budžet, nabavku, FF&E, rokove, promene i audit. Koristi project-scoped caller token.",
  module: "renovationsteps",
  auth: "forward",
  input: renovationContextInput,
  responseExample: { ok: true, source_of_truth: "RenovationSteps", project_id: "..." },
  handler: (input, ctx) =>
    renovationRequest(`/api/project/${encodeURIComponent(input.project_id)}/ai/context`, ctx.callerToken, {
      query: { history_limit: input.history_limit, days: input.days },
    }),
} satisfies ToolDefinition;

const renovationQuantitiesTool = {
  name: "renovation_query_quantities",
  title: "RenovationSteps quantities",
  description:
    "Najbrži alat za pitanja koliko je nečega potrebno, naručeno, primljeno, montirano ili još treba naručiti. Pretražuje taskove, materijale i FF&E bez učitavanja celog projekta.",
  module: "renovationsteps",
  auth: "forward",
  input: renovationQuantitiesInput,
  responseExample: {
    ok: true,
    summary_by_unit: [{ unit: "kom", current_quantity: 87, ordered_quantity: 50, remaining_to_order: 37 }],
    items: [],
  },
  handler: (input, ctx) =>
    renovationRequest(`/api/project/${encodeURIComponent(input.project_id)}/ai/quantities`, ctx.callerToken, {
      query: {
        q: input.q,
        target_type: input.target_type,
        item_code: input.item_code,
        room_id: input.room_id,
        limit: input.limit,
      },
    }),
} satisfies ToolDefinition;

const renovationPreviewQuantityTool = {
  name: "renovation_quantity_change_preview",
  title: "Preview quantity change",
  description:
    "Priprema NEIZMENJIV preview promene količine sa cost/procurement uticajem. Ovaj alat ništa ne menja. Uvek pokaži rezultat korisniku i traži eksplicitnu potvrdu pre apply alata.",
  module: "renovationsteps",
  auth: "forward",
  input: quantityPreviewInput,
  responseExample: { ok: true, preview: { requires_confirmation: true }, preview_token: "...", apply_payload: {} },
  handler: (input, ctx) => {
    const { project_id, ...body } = input;
    return renovationRequest(`/api/project/${encodeURIComponent(project_id)}/ai/quantity-change/preview`, ctx.callerToken, {
      method: "POST",
      body,
    });
  },
} satisfies ToolDefinition;

const renovationApplyQuantityTool = {
  name: "renovation_quantity_change_apply",
  title: "Apply confirmed quantity change",
  description:
    "Primjenjuje TAČNO signed quantity preview. POZOVI SAMO nakon eksplicitne potvrde korisnika u aktuelnom razgovoru. Ako se quantity, cijena, jedinica, baseline ili naručena količina promijenila poslije previewa, RenovationSteps odbija apply i traži novi preview.",
  module: "renovationsteps",
  auth: "forward",
  input: quantityApplyInput,
  responseExample: { ok: true, applied: true, change: { type: "quantity" } },
  handler: (input, ctx) =>
    renovationRequest(`/api/project/${encodeURIComponent(input.project_id)}/ai/quantity-change/apply`, ctx.callerToken, {
      method: "POST",
      body: { preview_token: input.preview_token, apply_payload: input.apply_payload },
    }),
} satisfies ToolDefinition;

const renovationUpdateTaskTool = {
  name: "renovation_update_task",
  title: "Update RenovationSteps task",
  description:
    "Mijenja status, odgovornost, progres, stvarni trošak, datume ili bilješku taska kroz isti audited workflow koji koristi frontend. Namjerno NE prihvata quantity; quantity promjene moraju kroz preview/apply alate.",
  module: "renovationsteps",
  auth: "forward",
  input: renovationUpdateTaskInput,
  responseExample: { ok: true, task: { id: "...", status: "in_progress" } },
  handler: (input, ctx) =>
    renovationRequest(
      `/api/project/${encodeURIComponent(input.project_id)}/tasks/${encodeURIComponent(input.task_id)}`,
      ctx.callerToken,
      { method: "PUT", body: input.patch },
    ),
} satisfies ToolDefinition;

const renovationCreateTaskTool = {
  name: "renovation_create_task",
  title: "Create RenovationSteps task",
  description:
    "Dodaje novi task u projekat kroz isti backend koji koristi RenovationSteps frontend. Početna quantity postaje baseline; naknadne promjene količine idu kroz preview/apply.",
  module: "renovationsteps",
  auth: "forward",
  input: renovationCreateTaskInput,
  responseExample: { ok: true, task: { id: "...", title: "..." } },
  handler: (input, ctx) => {
    const { project_id, ...task } = input;
    return renovationRequest(`/api/project/${encodeURIComponent(project_id)}`, ctx.callerToken, {
      method: "POST",
      body: { action: "add_task", ...task },
    });
  },
} satisfies ToolDefinition;

const renovationUpdateFfeTool = {
  name: "renovation_update_ffe_procurement",
  title: "Update FF&E procurement",
  description:
    "Ažurira naručenu, primljenu ili montiranu količinu, dobavljača, PO i rokove na postojećoj FF&E stavci. Koristi isti PM record endpoint kao frontend, pa je promjena odmah vidljiva korisniku i klijentu.",
  module: "renovationsteps",
  auth: "forward",
  input: renovationUpdateFfeInput,
  responseExample: { ok: true, data: { ordered_quantity: 50, received_quantity: 20 } },
  handler: (input, ctx) =>
    renovationRequest(
      `/api/project/${encodeURIComponent(input.project_id)}/pm/records/${encodeURIComponent(input.record_id)}`,
      ctx.callerToken,
      { method: "PUT", body: { module: "ffe", status: input.status, data: input.data } },
    ),
} satisfies ToolDefinition;

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Odgovor upstream endpointa je prevelik.");
  }

  if (!response.body) throw new Error("Upstream endpoint je vratio prazno telo.");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Odgovor upstream endpointa je prevelik.");
    }
    chunks.push(Buffer.from(value));
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Upstream endpoint je vratio neispravan JSON.");
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
  if (config.RENOVATIONSTEPS_BASE_URL) {
    registry.register(renovationContextTool);
    registry.register(renovationQuantitiesTool);
    registry.register(renovationPreviewQuantityTool);
    registry.register(renovationApplyQuantityTool);
    registry.register(renovationUpdateTaskTool);
    registry.register(renovationCreateTaskTool);
    registry.register(renovationUpdateFfeTool);
  }
}
