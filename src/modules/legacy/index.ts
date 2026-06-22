import type { ToolRegistry } from "../../core/registry.js";
import { registerLegacyTools } from "./tools.js";

/**
 * ============================================================================
 *  LEGACY MODUL (Apple Siri Shortcuts)
 * ============================================================================
 *
 * Modul za generisanje Apple `.shortcut` fajlova. Implementiran po obrascu
 * iz `src/modules/nextgen/tools.ts` — svaki alat se registruje u deljeni
 * registar i automatski se pojavljuje u OpenAPI šemi, MCP-u i kao REST ruta.
 *
 * Fajlovi modula:
 *   - shortcuts.ts  → domenska logika (ScPL kompajliranje)
 *   - store.ts      → in-memory skladište sa TTL/FIFO evikcijom
 *   - tools.ts      → alat definicija + registracija
 */
export function registerLegacyModule(registry: ToolRegistry): void {
  registerLegacyTools(registry);
}
