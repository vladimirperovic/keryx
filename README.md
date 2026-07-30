<p align="center">
  <img src="assets/logo-banner.svg" alt="Keryx" width="440">
</p>

<p align="center">
  <i>From Ancient Greek</i> <b>κῆρυξ</b> <i>(kêryx):</i> “a herald — the messenger who carries the message.”
</p>

<p align="center">
  <b>Keryx AI Gateway</b> — a self-hosted bridge between your web platform and AI assistants.<br>
  MCP + OpenAPI + Apple Siri Shortcuts, from a single tool registry.
</p>

<p align="center">
  <a href="https://github.com/vladimirperovic/keryx/actions/workflows/ci.yml"><img src="https://github.com/vladimirperovic/keryx/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Docker-hardened-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
</p>

<p align="center">
  🔗 <a href="https://keryx.renovationsteps.com/index-en.html">Live demo</a> ·
  📐 <a href="ARCHITECTURE.md">Architecture</a> ·
  🔒 <a href="SECURITY_ARCHITECTURE.md">Security</a> ·
  🗺️ <a href="ROADMAP.md">Roadmap</a> ·
  📖 <a href="CHANGELOG.md">Changelog</a>
</p>

---

## What is Keryx?

Keryx is a lightweight gateway that exposes your tools and data to AI assistants. Define a tool once and Keryx serves it through every supported protocol:

| Module | What it does |
|---|---|
| **Next-Gen** | Stateless MCP Streamable HTTP, generated OpenAPI 3.1, and REST routes for ChatGPT, Claude, and other clients. |
| **Legacy** | Generates temporary Apple `.shortcut` files for Siri and the Shortcuts app. |

Both modules use one typed `ToolRegistry`, so metadata, Zod validation, authentication mode, and handler behavior do not drift between protocols.

## Security model at a glance

- **Production fails closed.** A public HTTPS URL and a gateway token of at least 32 characters are required.
- **MCP Origin validation.** Unknown, malformed, and opaque browser origins are rejected to reduce DNS-rebinding risk.
- **Per-tool authentication.** `gateway` tools use the Keryx token; `forward` tools pass a caller token only to a fixed operator-configured upstream.
- **Bounded network access.** Upstream calls have a timeout, disabled redirects, JSON content checks, and a response-size limit.
- **Short-lived artifacts.** Shortcut URLs are 128-bit random, memory-only, TTL-limited, bounded, and single-use.
- **Hardened container defaults.** Non-root user, dropped capabilities, read-only filesystem, `no-new-privileges`, PID limit, and loopback port binding.

Read [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) and [THREAT_MODEL.md](THREAT_MODEL.md) before exposing Keryx publicly.

---

## Quick start

### Local development

```bash
git clone https://github.com/vladimirperovic/keryx.git
cd keryx
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:3000`.

### Docker Compose

```bash
cp .env.example .env       # optional for a local no-auth evaluation; required for production
# edit .env
docker compose up --build
```

Compose binds to `127.0.0.1:3000` by default. Put a TLS reverse proxy in front for production. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Configuration

All options are environment variables. See [`.env.example`](.env.example) for comments and safe defaults.

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3000` | Internal server port. |
| `HOST` | `0.0.0.0` | Bind address inside the container/process. |
| `NODE_ENV` | `development` | `development`, `production`, or `test`. |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public origin used in OpenAPI and generated links; HTTPS is required in production. |
| `KERYX_API_TOKEN` | empty | Gateway bearer; production requires at least 32 characters. |
| `KERYX_CORS_ORIGIN` | empty | Browser CORS origins, comma-separated. Empty disables cross-origin browser requests. `*` is rejected in production. |
| `KERYX_MCP_ALLOWED_ORIGINS` | empty | Additional trusted MCP browser origins. `PUBLIC_BASE_URL` is always allowed. |
| `KERYX_TRUST_PROXY` | `0` | Number of trusted reverse-proxy hops; normally `1` behind one proxy. |
| `KERYX_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window. |
| `KERYX_RATE_LIMIT_MAX` | `100` | Requests per IP/window for `/mcp` and `/api`. |
| `KERYX_JSON_LIMIT` | `1mb` | Maximum JSON request body accepted by Express. |
| `KERYX_SHORTCUT_TTL_MS` | `600000` | Shortcut download lifetime. |
| `KERYX_SHORTCUT_STORE_MAX` | `1000` | Maximum in-memory Shortcut artifacts. |
| `KERYX_UPSTREAM_MAX_BYTES` | `1000000` | Maximum accepted upstream JSON response. |
| `SITE_STATS_URL` | empty | Fixed optional stats endpoint; HTTPS required in production. |
| `KERYX_BIND_ADDRESS` | `127.0.0.1` | Docker host bind address. |

### Production minimum

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://keryx.example.com
KERYX_API_TOKEN=<strong-random-token-at-least-32-characters>
KERYX_TRUST_PROXY=1
KERYX_CORS_ORIGIN=https://trusted-browser-client.example.com
KERYX_MCP_ALLOWED_ORIGINS=https://trusted-browser-client.example.com
```

Generate a token with a cryptographically secure tool, for example:

```bash
openssl rand -base64 48
```

---

## Authentication model

Authentication is enforced per tool:

- **`gateway`** — requires `Authorization: Bearer <KERYX_API_TOKEN>` when auth is enabled. Production cannot run with auth disabled.
- **`forward`** — requires any syntactically valid bearer and forwards it to the fixed upstream endpoint. The upstream must derive identity and scope from the token and must not trust caller-supplied IDs.

Tokens are never intentionally logged or persisted by Keryx. A token embedded in a generated `.shortcut` is visible to anyone who obtains that file, so use a narrow, revocable target token.

---

## Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/` | public | Static landing page. |
| `GET` | `/healthz` | public | Health check. |
| `GET` | `/openapi.json` | public | Generated OpenAPI document. |
| `POST` | `/mcp` | per tool | Stateless MCP Streamable HTTP endpoint. |
| `POST` | `/api/tools/<name>` | per tool | Invoke one registered tool through REST. |
| `GET` | `/api/shortcuts/:id` | capability URL | Single-use temporary Shortcut download. |

Every response receives an `X-Request-Id`. API responses use `Cache-Control: no-store`.

---

## Built-in tools

| Tool | Auth | Description |
|---|---|---|
| `gateway_status` | gateway | Service info and registered tool names. |
| `echo` | gateway | Connection and validation test. |
| `create_shortcut` | gateway | Builds a temporary single-use Apple Shortcut for an HTTPS target. |
| `site_stats` | forward | Calls the fixed `SITE_STATS_URL` with the caller bearer and bounded JSON handling. Registered only when configured. |

### Examples

```bash
curl http://localhost:3000/healthz
```

```bash
curl -X POST http://localhost:3000/api/tools/echo \
  -H "Authorization: Bearer $KERYX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, Keryx!"}'
```

```bash
curl -X POST http://localhost:3000/api/tools/create_shortcut \
  -H "Authorization: Bearer $KERYX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/api/stats","token":"<target-api-token>","method":"GET","name":"My Shortcut"}'
```

```bash
curl -X POST http://localhost:3000/api/tools/site_stats \
  -H "Authorization: Bearer <upstream-user-token>" \
  -H "Content-Type: application/json" \
  -d '{"params":{"q":"summary"}}'
```

---

## Architecture

```text
src/
├── config/      validated, fail-closed environment configuration
├── core/        registry, auth helpers, OpenAPI generator
├── modules/
│   ├── nextgen/ MCP server and gateway/upstream tools
│   └── legacy/  Siri Shortcut compiler and temporary store
├── index.ts     process startup and graceful shutdown
└── server.ts    HTTP, security, transport, and route wiring
```

The full design and trust boundaries are documented in:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md)
- [THREAT_MODEL.md](THREAT_MODEL.md)
- [docs/ADDING_TOOLS.md](docs/ADDING_TOOLS.md)

---

## Development

Keryx supports maintained Node.js LTS lines (22 and 24 in CI).

```bash
npm run dev
npm run typecheck
npm run build
npm test
npm run check
```

CI also builds the Docker image and audits production dependencies. CodeQL, dependency review, and Dependabot are configured in `.github/`.

## Public project files

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [ROADMAP.md](ROADMAP.md)
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)
- [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE) © Vladimir Perović
