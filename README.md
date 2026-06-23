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
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
</p>

<p align="center">
  🔗 <a href="https://keryx.renovationsteps.com/index-en.html">Live demo</a> · 📖 <a href="CHANGELOG.md">Changelog</a>
</p>

---

## What is Keryx?

**Keryx** is a lightweight gateway that exposes your tools and data to AI assistants. You define a tool once; Keryx serves it through every protocol at the same time:

| Module | What it does |
|---|---|
| **Next-Gen** (MCP / OpenAPI) | A Model Context Protocol endpoint and an auto-generated OpenAPI 3.1 schema — for ChatGPT, Claude, and other LLM clients. |
| **Legacy** (Siri Shortcuts) | A REST API that generates downloadable Apple `.shortcut` files — a bridge to the iOS/macOS world. |

Both modules share **one tool registry**, so any tool you register automatically appears in MCP, in the OpenAPI schema, and as a REST route — no duplication.

---

## In plain words (no code required)

Think of Keryx as a **secure middleman** between your website and a voice or AI assistant (Siri, ChatGPT, Claude).

- 🔒 **Your data stays on your site.** Keryx never copies or stores it — it only carries the question and the answer, over an encrypted, token-protected channel.
- 👤 **Each person gets their own key.** A personal token works like the key to a single mailbox: the holder can *read* exactly what they'd see when logged in — and can't change anything.
- 🎙️ **One key, every assistant.** The same token powers a tap-to-install **Siri Shortcut** and a **ChatGPT / Claude** connector.

The result: someone can simply say *"Hey Siri, building status"* and hear the answer — without opening your site or logging in.

### Try it in one minute

**1. Run Keryx** (or use a hosted instance):

```bash
docker compose up --build      # → http://localhost:3000
```

**2. Point it at your site** — one line, the address of your site's read-only data endpoint:

```env
SITE_STATS_URL=https://your-site.com/api/stats
```

**3. Your people just ask.** From a phone with the installed Shortcut:

> 🗣️ *"Hey Siri, building status"*
> 🔊 *"6 news items, 1 new this week. 2 active polls. Your apartment: May is paid."*

…or from ChatGPT / Claude with the connector added:

> 💬 *"Anything new, and did I pay for May?"*

Behind the scenes Keryx forwards each person's **personal token** to your site, **your site decides what they may see**, and the answer comes back — safe, scoped, and read-only. No passwords are ever shared with the assistant.

---

## Features

- 🔌 **One registry, every protocol** — register a tool once, reach MCP, OpenAPI, and REST.
- 🗣️ **Siri Shortcuts generator** — turn an authenticated URL into an installable `.shortcut`.
- 🔐 **Per-tool auth** — `gateway` tools require the gateway token; `forward` tools pass the caller's token to an upstream service for per-user scoping.
- 📜 **Self-describing** — live OpenAPI schema at `/openapi.json` so LLMs can discover your tools.
- 🐳 **Docker-ready** — single container with a built-in health check.
- 🪶 **Tiny & typed** — TypeScript, Express, Zod; no database required.

---

## Quick start

### Local development

```bash
git clone https://github.com/vladimirperovic/keryx.git
cd keryx
cp .env.example .env      # then edit as needed
npm install
npm run dev               # http://localhost:3000
```

### Docker

```bash
docker compose up --build
```

That's it — the app boots in a container with a built-in health check.

---

## Configuration

All options are set via environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Public URL of the server. Used in the OpenAPI schema and in generated download links — **set this in production** or links will point to localhost. |
| `KERYX_API_TOKEN` | _(empty)_ | Gateway bearer token. Empty = authentication **disabled** (local dev only). |
| `KERYX_CORS_ORIGIN` | `*` | Allowed CORS origin(s), comma-separated |
| `KERYX_SHORTCUT_TTL_MS` | `600000` | How long (ms) a generated shortcut stays downloadable (10 min) |
| `KERYX_SHORTCUT_STORE_MAX` | `1000` | Max shortcuts kept in memory (FIFO eviction) |
| `SITE_STATS_URL` | _(empty)_ | Optional. URL of an external JSON stats endpoint. If unset, the `site_stats` tool is **not registered**. |

---

## Authentication model

Auth is enforced **per tool**, not globally:

- **`gateway` tools** (e.g. `create_shortcut`) require `Authorization: Bearer <KERYX_API_TOKEN>`. If `KERYX_API_TOKEN` is empty, auth is disabled (local dev).
- **`forward` tools** (e.g. `site_stats`) do **not** check the gateway token. Instead, the caller's bearer token is **forwarded** to the upstream service, which decides scope. This lets the same token power both a Siri Shortcut and an LLM connector, and lets the upstream enforce per-user access.

> Tokens are compared in constant time. The shortcut download route (`/api/shortcuts/:id`) is public — the 128-bit random id is the capability.

---

## API endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/` | public | Landing page |
| `GET` | `/healthz` | public | Health check |
| `GET` | `/openapi.json` | public | OpenAPI 3.1 schema |
| `POST` | `/mcp` | per-tool | MCP endpoint (Streamable HTTP, stateless) |
| `POST` | `/api/tools/<name>` | per-tool | Invoke a tool by name |
| `GET` | `/api/shortcuts/:id` | public | Download a generated shortcut |

---

## Built-in tools

| Tool | Auth | Description |
|---|---|---|
| `gateway_status` | gateway | Service info + list of registered tools (discovery) |
| `echo` | gateway | Returns the given message (connection test) |
| `create_shortcut` | gateway | Builds an Apple `.shortcut` that calls a URL with a `Bearer` token; returns a temporary `downloadUrl` |
| `site_stats` | forward | Proxies a request to `SITE_STATS_URL` (forwarding the caller token + arbitrary params) and returns its JSON. Registered only when `SITE_STATS_URL` is set. |

### Examples

```bash
# Health check
curl http://localhost:3000/healthz

# Echo (gateway tool — needs the gateway token if auth is enabled)
curl -X POST http://localhost:3000/api/tools/echo \
  -H "Authorization: Bearer $KERYX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, Keryx!"}'

# Generate a Siri shortcut that calls an authenticated endpoint
curl -X POST http://localhost:3000/api/tools/create_shortcut \
  -H "Authorization: Bearer $KERYX_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/api/stats", "token": "<target-api-token>", "method": "GET", "name": "My Shortcut"}'

# site_stats (forward tool — the bearer is passed to SITE_STATS_URL)
curl -X POST http://localhost:3000/api/tools/site_stats \
  -H "Authorization: Bearer <upstream-token>" \
  -H "Content-Type: application/json" \
  -d '{"params": {"q": "summary"}}'
```

---

## Architecture

Keryx uses a **shared registry** pattern. Every tool is registered once (`src/core/registry.ts`) and the gateway exposes it through:

- **MCP** — for AI agents that speak the Model Context Protocol (`/mcp`)
- **OpenAPI** — for REST clients and AI platforms such as ChatGPT Actions (`/openapi.json`)
- **Siri Shortcuts** — for Apple devices, via generated `.shortcut` files

```
src/
├── core/        registry, OpenAPI builder, auth helpers
├── config/      validated environment (Zod)
├── modules/
│   ├── nextgen/ MCP server + tools (gateway_status, echo, site_stats)
│   └── legacy/  Siri Shortcuts (create_shortcut, ScPL compiler, store)
└── server.ts    Express wiring
```

### Adding a tool

Define a `ToolDefinition` and register it — it shows up everywhere automatically. See `src/modules/nextgen/tools.ts` for the pattern.

---

## Development

```bash
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit
npm run build      # compile to dist/
npm test           # run the test suite
npm start          # run the compiled server
```

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Vladimir Perović
