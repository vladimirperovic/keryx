# Threat Model

## Scope

This model covers the Keryx process, its HTTP/MCP interfaces, the optional fixed upstream integration, generated Apple Shortcuts, the Docker image, and the public source repository.

It does not cover vulnerabilities inside the upstream application, reverse proxy, host OS, Apple Shortcuts application, AI client, or the user's secret-management system.

## Assets

- `KERYX_API_TOKEN`.
- Caller bearer tokens forwarded to an upstream service.
- Target API tokens embedded in generated Shortcuts.
- Tool output that may contain user-scoped information.
- Availability of the gateway and upstream application.
- Integrity of tool definitions and release artifacts.

## Adversaries

- An unauthenticated internet client.
- A browser page attempting DNS rebinding or cross-origin requests.
- A caller with a valid but low-scope upstream token.
- A user who obtains a Shortcut capability link or file.
- A compromised or malicious upstream endpoint.
- A contributor introducing a vulnerable dependency or unsafe tool.

## Key threats and mitigations

| Threat | Mitigation | Residual risk |
|---|---|---|
| Gateway starts publicly without auth | Production fail-closed token validation | Operator can still run development mode publicly; documentation warns against it |
| DNS rebinding against local MCP server | Origin allow-list and loopback Docker bind | Non-browser clients may omit Origin; network exposure still requires firewalling/auth |
| Brute force or request flooding | Per-IP rate limit, body limit, PID limit, bounded stores | In-memory limiting is per instance and is not a full DDoS service |
| Token theft through logs | Keryx never logs auth headers or request bodies; request IDs are used | Reverse proxies or external observability tools may still log sensitive data |
| Caller controls upstream destination | Upstream URL is operator configured, not a tool argument | A compromised configuration can still point to a malicious service |
| Token leaked through redirect | Fetch redirects are disabled | DNS or TLS compromise remains outside Keryx |
| Oversized upstream response exhausts memory | Content-length check and streamed byte limit | Compressed-transfer expansion is limited by bytes read after decompression by fetch behavior |
| Non-JSON upstream response | Content-type and JSON parsing checks | A valid JSON payload can still contain large logical structures within the configured byte limit |
| Shortcut capability link is shared | 128-bit ID, short TTL, single-use download, no-store headers | The downloaded file permanently contains its target token until revoked |
| Arbitrary protocol in Shortcut target | HTTPS-only target; localhost HTTP only in development | A valid HTTPS endpoint may still be malicious if selected by an authorized gateway user |
| Tool-level authorization bypass | Auth mode is declared in the registry and checked in both REST and MCP | Incorrectly choosing `forward` or implementing insecure upstream authorization remains a development risk |
| Supply-chain compromise | Lockfile, Dependabot, dependency review, CodeQL, CI, non-root image | Registry/account compromise and malicious-but-not-yet-detected packages remain possible |

## Abuse cases to test

- Missing, malformed, oversized, and whitespace-containing Authorization headers.
- Production startup without token, with HTTP public URL, or wildcard CORS.
- MCP requests with unknown, opaque, and malformed Origin values.
- More than 25 query parameters, oversized values, redirects, wrong content type, slow responses, and oversized upstream bodies.
- Reuse of a consumed or expired Shortcut download URL.
- Multiple `createApp()` calls in one test process.
- Container startup with read-only filesystem and no capabilities.

## Review triggers

Update this document whenever Keryx adds:

- OAuth or multiple gateway identities;
- write/destructive tools;
- arbitrary user-selected upstreams;
- persistent storage;
- multi-tenant shared hosting;
- a shared Shortcut store;
- plugin loading or remotely supplied code;
- automated release publishing.
