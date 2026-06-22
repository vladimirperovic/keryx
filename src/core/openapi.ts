import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolRegistry } from "./registry.js";

/** Putanja pod kojom se REST poziva jedan alat. */
export function toolHttpPath(name: string): string {
  return `/api/tools/${name}`;
}

/**
 * Gradi OpenAPI 3.1 dokument iz registra alata.
 *
 * Zasto rucno (a ne neka teska biblioteka): registar je mali i pod nasom
 * kontrolom, pa je deterministicki generator citljiviji, bez build magije, i
 * daje tacno onu semu kakvu Claude/ChatGPT "tool use" ocekuju — svaki alat je
 * jedan `POST` sa JSON telom validiranim Zod semom.
 */
export function buildOpenApiDocument(
  registry: ToolRegistry,
  opts: { baseUrl: string; version: string },
): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  const schemas: Record<string, unknown> = {};
  const tags = new Set<string>();

  for (const tool of registry.list()) {
    tags.add(tool.module);

    const requestSchemaName = `${pascal(tool.name)}Request`;
    // `target: "openApi3"` proizvodi semu kompatibilnu sa OpenAPI (nullable, itd.)
    schemas[requestSchemaName] = zodToJsonSchema(tool.input, {
      target: "openApi3",
      $refStrategy: "none",
    });

    paths[toolHttpPath(tool.name)] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        tags: [tool.module],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${requestSchemaName}` },
            },
          },
        },
        responses: {
          "200": {
            description: "Uspesno izvrsenje alata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", enum: [true] },
                    tool: { type: "string" },
                    result: {},
                  },
                  required: ["ok", "tool", "result"],
                },
                ...(tool.responseExample !== undefined
                  ? {
                      example: {
                        ok: true,
                        tool: tool.name,
                        result: tool.responseExample,
                      },
                    }
                  : {}),
              },
            },
          },
          "400": {
            description: "Neispravan ulaz (greska validacije).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Nedostaje ili je neispravan API token.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    };
  }

  // Zajednicka sema greske.
  schemas.ErrorResponse = {
    type: "object",
    properties: {
      ok: { type: "boolean", enum: [false] },
      error: { type: "string" },
      details: {},
    },
    required: ["ok", "error"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Keryx AI Gateway",
      version: opts.version,
      description:
        "Self-hosted most koji izlaze funkcije web platforme LLM agentima " +
        "(Claude, ChatGPT) preko OpenAPI sheme i Model Context Protocol-a.",
    },
    servers: [{ url: opts.baseUrl }],
    tags: [...tags].map((t) => ({ name: t })),
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Opcioni Keryx API token (Authorization: Bearer <token>).",
        },
      },
    },
  };
}

function pascal(snake: string): string {
  return snake
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
