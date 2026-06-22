import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Request, Response } from "express";
import type { ToolContext, ToolRegistry } from "../../core/registry.js";
import { bearerFromHeader, checkToolAuth } from "../../core/auth.js";

/**
 * Gradi MCP server instancu iz registra alata. Svaki gateway alat postaje MCP
 * tool sa istom Zod semom koju koristi i OpenAPI sloj — pa LLM preko MCP-a vidi
 * tacno iste funkcije kao i preko OpenAPI sheme.
 */
export function buildMcpServer(
  registry: ToolRegistry,
  ctx: ToolContext,
  meta: { name: string; version: string },
): McpServer {
  const server = new McpServer({ name: meta.name, version: meta.version });

  for (const tool of registry.list()) {
    // MCP SDK ocekuje "raw shape" (mapu polja), a ne ceo ZodObject.
    const shape =
      tool.input instanceof z.ZodObject
        ? (tool.input.shape as z.ZodRawShape)
        : ({} as z.ZodRawShape);

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shape,
      },
      async (args: unknown) => {
        // Auth po alatu: gateway alati traže Keryx token, forward alati caller token.
        const authError = checkToolAuth(tool, ctx.callerToken ?? "");
        if (authError) {
          return {
            content: [{ type: "text" as const, text: authError }],
            isError: true,
          };
        }
        const result = await tool.handler(args as never, ctx);
        return {
          // Tekstualni sadrzaj za modele koji ne citaju structuredContent.
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
          // Strukturisani rezultat za moderne MCP klijente.
          structuredContent: { ok: true, tool: tool.name, result },
        };
      },
    );
  }

  return server;
}

/**
 * Express hendler za Streamable HTTP transport u STATELESS rezimu: za svaki
 * zahtev pravimo svez server+transport par i zatvaramo ih kada se konekcija
 * zatvori. Stateless je idealan za self-hosted gateway iza load balancer-a —
 * nema sesijskog stanja koje treba lepiti za odredjenu instancu.
 */
export function createMcpRequestHandler(
  registry: ToolRegistry,
  ctx: ToolContext,
  meta: { name: string; version: string },
) {
  return async (req: Request, res: Response): Promise<void> => {
    // Token po-zahtevu: prosleđuje se alatima preko konteksta (per-stan scope).
    const callerToken = bearerFromHeader(req.header("authorization"));
    const reqCtx: ToolContext = { ...ctx, callerToken };
    const server = buildMcpServer(registry, reqCtx, meta);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[keryx] MCP greska pri obradi zahteva:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Interna greska servera." },
          id: null,
        });
      }
    }
  };
}

/**
 * U stateless rezimu GET (SSE stream) i DELETE (kraj sesije) nemaju smisla —
 * vracamo 405 sa JSON-RPC porukom kako nalaze MCP specifikacija.
 */
export function mcpMethodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed (stateless server)." },
    id: null,
  });
}
