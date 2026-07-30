import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Request, Response } from "express";
import type { ToolContext, ToolRegistry } from "../../core/registry.js";
import { bearerFromHeader, checkToolAuth } from "../../core/auth.js";

/** Gradi MCP server iz istog registra koji koristi REST/OpenAPI sloj. */
export function buildMcpServer(
  registry: ToolRegistry,
  ctx: ToolContext,
  meta: { name: string; version: string },
): McpServer {
  const server = new McpServer({ name: meta.name, version: meta.version });

  for (const tool of registry.list()) {
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
        const authError = checkToolAuth(tool, ctx.callerToken ?? "");
        if (authError) {
          return {
            content: [{ type: "text" as const, text: authError }],
            isError: true,
          };
        }

        const parsed = tool.input.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            content: [{ type: "text" as const, text: "Neispravan ulaz za alat." }],
            isError: true,
          };
        }

        try {
          const result = await tool.handler(parsed.data, ctx);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: { ok: true, tool: tool.name, result },
          };
        } catch (err) {
          console.error(`[keryx] MCP alat "${tool.name}" nije uspeo:`, err);
          return {
            content: [{ type: "text" as const, text: "Interna greška alata." }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

/** Stateless Streamable HTTP handler: sve stanje postoji samo tokom request-a. */
export function createMcpRequestHandler(
  registry: ToolRegistry,
  ctx: ToolContext,
  meta: { name: string; version: string },
) {
  return async (req: Request, res: Response): Promise<void> => {
    const callerToken = bearerFromHeader(req.header("authorization"));
    const reqCtx: ToolContext = { ...ctx, callerToken };
    const server = buildMcpServer(registry, reqCtx, meta);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[keryx] MCP greška pri obradi zahteva:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Interna greška servera." },
          id: null,
        });
      }
    }
  };
}

export function mcpMethodNotAllowed(_req: Request, res: Response): void {
  res.setHeader("Allow", "POST");
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method Not Allowed (stateless server)." },
    id: null,
  });
}
