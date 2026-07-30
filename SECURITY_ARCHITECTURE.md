# Security Architecture

## Security goals

Keryx is designed to expose a small, explicit tool surface without becoming a general-purpose proxy. Its primary goals are:

- authenticate access to gateway-owned tools;
- preserve per-user authorization at the upstream service;
- prevent browser and DNS-rebinding access to an MCP endpoint;
- bound CPU, memory, request, response, and artifact usage;
- avoid persistent storage of caller tokens and generated Shortcuts;
- fail closed when production security configuration is incomplete.

## Trust boundaries

```text
Untrusted client
  │ bearer + JSON
  ▼
Keryx HTTP boundary
  │ validated request / scoped token forwarding
  ▼
Tool handler
  │ fixed operator-configured destination
  ▼
Upstream application authorization boundary
```

The upstream application remains authoritative for user identity, resource ownership, and business permissions. Keryx must never infer authorization from caller-supplied query fields.

## Authentication models

### Gateway authentication

Tools with `auth: "gateway"` compare the caller bearer with `KERYX_API_TOKEN` using a timing-safe comparison. Production refuses to start unless this token contains at least 32 characters.

### Forward authentication

Tools with `auth: "forward"` require a bearer but do not compare it with the gateway token. The bearer is sent only to the fixed `SITE_STATS_URL`. Redirect following is disabled so a configured service cannot redirect the credential to another origin.

## MCP transport protection

The Streamable HTTP endpoint validates every supplied `Origin` against `PUBLIC_BASE_URL` and `KERYX_MCP_ALLOWED_ORIGINS`. Opaque (`null`), malformed, and unknown origins are rejected before the MCP SDK handles the request.

For local-only installations, keep Docker bound to `127.0.0.1`. For public installations, place Keryx behind HTTPS and set the correct reverse-proxy hop count.

## Browser and HTTP controls

Keryx sets:

- Content Security Policy;
- HSTS in production;
- frame denial;
- MIME sniffing protection;
- restrictive referrer and permissions policies;
- request identifiers;
- explicit CORS behavior;
- request-body and rate limits;
- no-store headers on API and artifact responses.

## Shortcut capability model

A generated Shortcut contains the target API bearer by design. The temporary download route therefore uses:

- a 128-bit random URL identifier;
- a configurable short TTL;
- bounded in-memory storage;
- FIFO eviction;
- single-use retrieval;
- no-store/private response headers.

Anyone who obtains the `.shortcut` file can inspect its embedded token. Use narrowly scoped, revocable target tokens.

## Container boundary

The supported Compose deployment runs:

- as the non-root Node user;
- with all Linux capabilities dropped;
- with `no-new-privileges`;
- on a read-only root filesystem;
- with a small writable `/tmp` tmpfs;
- with an init process and PID limit;
- bound to loopback by default.

These are defense-in-depth controls, not a replacement for host patching, firewalling, HTTPS, backups, and secret management.

## Supply-chain controls

The repository includes:

- locked npm dependencies;
- CI on supported Node LTS lines;
- production dependency audit;
- Docker build validation;
- Dependabot for npm, Actions, and Docker;
- dependency review on pull requests;
- CodeQL analysis.

## Secrets

Never commit `.env`, production tokens, private endpoint URLs, downloaded Shortcuts, or sanitized-looking examples copied from production. Use deployment secrets or a restricted environment file.
