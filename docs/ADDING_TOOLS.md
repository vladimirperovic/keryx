# Adding Tools

Every Keryx tool is defined once and exposed through MCP, OpenAPI, and REST.

## Minimal example

```ts
import { z } from "zod";
import type { ToolDefinition } from "../../core/registry.js";

export const exampleTool = {
  name: "example_status",
  title: "Example status",
  description: "Returns a small read-only status object.",
  module: "example",
  auth: "gateway",
  input: z.object({
    id: z.string().min(1).max(64),
  }),
  responseExample: { id: "demo", status: "ok" },
  handler: async (input) => ({ id: input.id, status: "ok" }),
} satisfies ToolDefinition;
```

Register the tool from the module entry point. Do not manually add separate MCP and REST implementations.

## Choose the auth model

### `gateway`

Use for tools owned and authorized by Keryx. The caller must provide `KERYX_API_TOKEN` in production.

### `forward`

Use only when a fixed upstream application is the authorization authority. Keryx requires a bearer and passes it to that upstream. The upstream must derive identity and scope from the token, never from caller-supplied IDs or query parameters.

## Input rules

- Bound every string, array, record, and numeric range.
- Use allow-lists for enums, methods, protocols, and key names.
- Do not accept arbitrary URLs for network tools.
- Reject credentials embedded in URLs.
- Protect reserved query parameters from caller override.
- Prefer explicit objects over free-form JSON.

## Network rules

For any outbound request:

- use an operator-configured HTTPS endpoint;
- set a timeout;
- disable or tightly control redirects when forwarding credentials;
- validate response status and content type;
- bound response bytes before parsing;
- do not log credentials, full bodies, or personal data;
- retry only idempotent operations and only with a documented bound.

## Error rules

Handlers may throw internal errors. The protocol layers return generic client messages and log a request-correlated server error. Do not include tokens, upstream bodies, or sensitive configuration in thrown messages.

## Tests

Add tests for:

- valid input and expected output;
- boundary and malformed input;
- missing/wrong authentication;
- upstream timeout, redirect, wrong content type, and oversized response when applicable;
- both REST and MCP exposure when protocol-specific behavior changed.

Run:

```bash
npm run check
```

Update `README.md`, `.env.example`, `ARCHITECTURE.md`, and `THREAT_MODEL.md` when the tool changes trust boundaries or configuration.
