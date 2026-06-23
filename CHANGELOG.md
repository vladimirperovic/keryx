# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-06-23

### Added
- Per-tool authentication model: `gateway` tools require the gateway token, while
  `forward` tools forward the caller's token to an upstream service for per-user scoping.
- `site_stats` tool: a generic proxy to an external JSON stats endpoint
  (`SITE_STATS_URL`); registered only when that variable is set.
- Human-friendly `404`: browsers are redirected to the landing page; API clients
  receive a JSON error that points to the useful routes.
- Brand assets (logo wordmark, mark, banner, favicon) and a brand-styled landing.
- **Token console mockup** (`/dashboard.html`): admin vs member views, token
  issue/revoke, granular scopes, rate limits, audit log, new-device alerts,
  host & upstream health, multi-site, export/webhooks — with chart tooltips and a
  showcase section on the landing page.
- Project infrastructure: GitHub Actions CI (typecheck + build + test on Node 20 & 22),
  a `node:test` suite (`npm test`), `SECURITY.md`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, issue/PR templates, and `.editorconfig`.

### Changed
- README rewritten in English with accurate examples and full configuration,
  endpoint, and tool tables.

## [0.1.0] - 2026-06-22

### Added
- Initial gateway with a shared tool registry exposed simultaneously via MCP
  (`/mcp`), OpenAPI 3.1 (`/openapi.json`), and REST (`/api/tools/<name>`).
- Legacy module: Apple Siri Shortcuts generator (`create_shortcut`).
- Next-Gen module: `gateway_status` and `echo` tools.
- Docker support with a health check, request rate limiting, and configurable CORS.
