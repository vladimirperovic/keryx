# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- Production now fails closed unless `PUBLIC_BASE_URL` uses HTTPS and `KERYX_API_TOKEN` contains at least 32 characters.
- Added MCP `Origin` validation against the public origin and an explicit allow-list to reduce browser DNS-rebinding risk.
- Added Content Security Policy, HSTS in production, frame denial, MIME-sniffing protection, restrictive referrer/permissions policies, and request IDs.
- Hardened bearer parsing and ensured server errors do not expose internal details to clients.
- Disabled upstream redirects when forwarding caller credentials; added timeout, response content-type validation, parameter bounds, and streamed response-size limits.
- Restricted generated Shortcut targets to HTTPS, except localhost HTTP in development.
- Made temporary Shortcut capability links single-use in addition to random, TTL-limited, and size-bounded.
- Hardened Docker Compose with loopback binding, non-root execution, read-only filesystem, dropped capabilities, `no-new-privileges`, PID limit, and tmpfs.
- Added CodeQL, dependency review, Dependabot, production dependency audit, and CODEOWNERS.

### Added

- Architecture, security architecture, threat model, deployment, tool-development, governance, support, roadmap, and design-system documentation.
- Security regression tests covering bearer parsing, MCP Origin rejection, security headers, repeated app construction, and single-use artifacts.
- Structured issue forms and a stronger pull request checklist.
- Configurable proxy hops, CORS/MCP origins, rate limits, JSON body limit, and upstream response-size limit.

### Changed

- Supported runtime moved to maintained Node.js lines, with Node 22 and 24 in CI and Node 24 in the production image.
- Each Express app now creates an isolated tool registry, making repeated app construction deterministic in tests and embedded use.
- Docker Compose no longer requires `.env` for a local evaluation and validates secure defaults.
- README and public project documentation were rewritten around secure deployment and contribution requirements.

## [0.1.1] - 2026-06-23

### Added

- Per-tool authentication model: `gateway` tools require the gateway token, while
  `forward` tools forward the caller's token to an upstream service for per-user scoping.
- `site_stats` tool: a generic proxy to an external JSON stats endpoint
  (`SITE_STATS_URL`); registered only when that variable is set.
- Human-friendly `404`: browsers are redirected to the landing page; API clients
  receive a JSON error that points to the useful routes.
- Brand assets (logo wordmark, mark, banner, favicon) and a brand-styled landing.
- Token console mockup (`/dashboard.html`): admin vs member views, token
  issue/revoke, granular scopes, rate limits, audit log, new-device alerts,
  host/upstream health, multi-site, export/webhooks, chart tooltips, and a landing-page showcase.
- Project infrastructure: GitHub Actions CI, a `node:test` suite, security and contribution policies, issue/PR templates, and `.editorconfig`.

### Changed

- README rewritten in English with configuration, endpoint, and tool tables.

## [0.1.0] - 2026-06-22

### Added

- Initial gateway with a shared tool registry exposed simultaneously via MCP
  (`/mcp`), OpenAPI 3.1 (`/openapi.json`), and REST (`/api/tools/<name>`).
- Legacy module: Apple Siri Shortcuts generator (`create_shortcut`).
- Next-Gen module: `gateway_status` and `echo` tools.
- Docker support with a health check, request rate limiting, and configurable CORS.

[Unreleased]: https://github.com/vladimirperovic/keryx/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/vladimirperovic/keryx/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/vladimirperovic/keryx/releases/tag/v0.1.0
