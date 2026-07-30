import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolRegistry } from "./registry.js";

/** REST path for one registered tool. */
export function toolHttpPath(name: string): string {
  return `/api/tools/${name}`;
}

/** Builds a deterministic OpenAPI document from the shared tool registry. */
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
            description: "Tool executed successfully.",
            headers: {
              "X-Request-Id": {
                description: "Identifier for correlating the request with server logs.",
                schema: { type: "string", format: "uuid" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", const: true },
                    tool: { type: "string", const: tool.name },
                    result: {},
                  },
                  required: ["ok", "tool", "result"],
                  additionalProperties: false,
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
          "400": errorResponse("Input validation failed."),
          "401": errorResponse("Bearer authentication is missing or invalid."),
          "429": errorResponse("Rate limit exceeded."),
          "500": errorResponse("The tool failed without exposing internal details."),
        },
      },
    };
  }

  schemas.ErrorResponse = {
    type: "object",
    properties: {
      ok: { type: "boolean", const: false },
      error: { type: "string" },
      details: {},
      requestId: { type: "string", format: "uuid" },
    },
    required: ["ok", "error"],
    additionalProperties: false,
  };

  return {
    openapi: "3.1.1",
    info: {
      title: "Keryx AI Gateway",
      version: opts.version,
      description:
        "Self-hosted gateway that exposes one validated tool registry through REST, " +
        "OpenAPI and the Model Context Protocol.",
    },
    servers: [{ url: opts.baseUrl }],
    tags: [...tags].map((name) => ({ name })),
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Gateway tools require KERYX_API_TOKEN. Forward tools require a caller bearer " +
            "that the fixed upstream service authorizes.",
        },
      },
    },
  };
}

function errorResponse(description: string): Record<string, unknown> {
  return {
    description,
    headers: {
      "X-Request-Id": {
        description: "Identifier for correlating the request with server logs.",
        schema: { type: "string", format: "uuid" },
      },
    },
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorResponse" },
      },
    },
  };
}

function pascal(snake: string): string {
  return snake
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
