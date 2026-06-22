import { z } from "zod";

/**
 * Kontekst koji se prosledjuje svakom hendleru pri izvrsavanju.
 * Drzimo ga minimalnim za sada; kasnije se moze prosiriti (npr. autentifikovani
 * korisnik, request id, logger po-zahtevu).
 */
export interface ToolContext {
  /** Bazni javni URL gateway-a (npr. za sastavljanje apsolutnih linkova). */
  readonly baseUrl: string;
  /**
   * Bearer token koji je pozivalac poslao (po-zahtevu). "forward" alati ga
   * prosleđuju ciljnom servisu radi scope-a (npr. per-stan pristup). Prazno ako
   * nije poslat.
   */
  readonly callerToken?: string;
}

/**
 * Definicija jedne "gateway operacije". Ovo je JEDINI izvor istine — i OpenAPI
 * sema i MCP server se grade iz ovih definicija, pa nikada ne mogu da se raziđu.
 *
 * @typeParam TInput - Zod sema ulaza; tip hendlera se izvodi iz nje.
 */
export interface ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Masinski naziv (snake_case). Sluzi kao MCP tool name i deo REST putanje. */
  readonly name: string;
  /** Citljiv naslov za ljude / LLM UI. */
  readonly title: string;
  /** Opis sta operacija radi — LLM ga koristi da odluci kada da je pozove. */
  readonly description: string;
  /**
   * Modul koji je registrovao alat ("nextgen", "legacy", ...). Koristi se za
   * OpenAPI tagove i preglednost ko je sta dodao u multi-agent radu.
   */
  readonly module: string;
  /**
   * Model autentikacije:
   *   - "gateway" (podrazumevano): traži Keryx gateway token (KERYX_API_TOKEN).
   *   - "forward": ne traži gateway token; `ctx.callerToken` se prosleđuje
   *     ciljnom servisu koji odlučuje o pristupu (per-korisnik scope).
   */
  readonly auth?: "gateway" | "forward";
  /** Zod sema ulaznih parametara. */
  readonly input: TInput;
  /**
   * Primer uspesnog odgovora — ulazi u OpenAPI kao `example` da bi sema bila
   * razumljivija LLM-u i korisnicima. Opciono.
   */
  readonly responseExample?: unknown;
  /** Stvarna logika operacije. */
  readonly handler: (
    input: z.infer<TInput>,
    ctx: ToolContext,
  ) => Promise<unknown> | unknown;
}

/**
 * In-memory registar svih gateway operacija. Moduli pozivaju `register()` pri
 * inicijalizaciji; server zatim cita `list()` da izgradi REST/OpenAPI/MCP sloj.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * Registruje alat. Imena moraju biti jedinstvena — duplikat je programerska
   * greska (npr. dva agenta su slucajno upotrebila isto ime) i prijavljuje se.
   */
  register<TInput extends z.ZodTypeAny>(tool: ToolDefinition<TInput>): void {
    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
      throw new Error(
        `[keryx] Neispravno ime alata "${tool.name}". Dozvoljeno: snake_case ([a-z0-9_], pocinje slovom).`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(
        `[keryx] Alat "${tool.name}" je vec registrovan. Imena moraju biti jedinstvena.`,
      );
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition);
  }

  /** Vraca alat po imenu ili undefined. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Sve registrovane alate (redosled registracije). */
  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}

/**
 * Deljena singleton instanca. Svi moduli importuju OVU instancu i u nju
 * registruju svoje alate.
 */
export const registry = new ToolRegistry();
