# Contributing to Keryx

Thanks for your interest. Contributions of all sizes are welcome when they keep the gateway focused, secure, and maintainable.

## Getting started

Requirements:

- Node.js 22 or 24;
- npm from the selected Node distribution;
- Docker with Compose for container changes.

```bash
git clone https://github.com/vladimirperovic/keryx.git
cd keryx
cp .env.example .env
npm ci
npm run dev
```

## Before opening a pull request

Run the same primary checks as CI:

```bash
npm run check
docker compose config
docker build -t keryx:local .
```

## Guidelines

- **Keep each PR focused.** Separate unrelated fixes and features.
- **Use the shared registry.** Define one `ToolDefinition`; MCP, OpenAPI, and REST are generated from it.
- **Validate all caller input.** Bound strings, arrays, records, numeric ranges, query keys, and network responses.
- **Choose authentication deliberately.** `gateway` means Keryx authorizes the call; `forward` means a fixed upstream service authorizes the caller token.
- **Do not create a general URL fetcher.** Network destinations should be operator configured and HTTPS in production.
- **Never trust caller-supplied scope.** The upstream must derive identity and permissions from the bearer token.
- **Do not log or commit secrets.** This includes `.env`, private URLs, Authorization headers, downloaded Shortcuts, personal data, and production payloads.
- **Add regression tests.** Cover malformed input, auth boundaries, resource limits, and protocol-specific behavior.
- **Update public docs.** Configuration and trust-boundary changes require updates to README, `.env.example`, architecture/security documents, and the changelog.

Read [docs/ADDING_TOOLS.md](docs/ADDING_TOOLS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [THREAT_MODEL.md](THREAT_MODEL.md) before adding a new integration.

## Security-sensitive changes

Discuss substantial authentication, persistent storage, arbitrary network access, destructive tools, plugin loading, or new production dependencies before investing in a large implementation. Mark the security impact in the pull request template and explain compatibility consequences.

Do not disclose vulnerabilities in public review comments. Follow [SECURITY.md](SECURITY.md).

## Commit messages

Use concise, action-oriented messages. Conventional-style examples are welcome:

- `feat(nextgen): add read-only status tool`
- `fix(mcp): reject untrusted origin`
- `docs: explain reverse proxy deployment`

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
