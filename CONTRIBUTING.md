# Contributing to Keryx

Thanks for your interest! Contributions of all sizes are welcome.

## Getting started

```bash
git clone https://github.com/vladimirperovic/keryx.git
cd keryx
cp .env.example .env
npm install
npm run dev
```

## Before you open a pull request

Run the full local check — CI runs the same:

```bash
npm run typecheck   # no type errors
npm run build       # compiles cleanly
npm test            # tests pass
```

## Guidelines

- **One change per PR.** Keep diffs focused and easy to review.
- **Match the surrounding style.** TypeScript, ESM, Zod for input validation. The codebase favours small, well-commented modules.
- **Add a tool the registry way.** Define a `ToolDefinition` and register it in the relevant module (`src/modules/**`); it will appear in MCP, OpenAPI, and REST automatically. See `src/modules/nextgen/tools.ts`.
- **Validate all input** with Zod. Never trust client-supplied scope on `forward` tools — the upstream enforces it.
- **Don't commit secrets.** `.env` is gitignored; use `.env.example` for new variables (with safe placeholder values).
- **Update docs.** If you add/rename a tool or env var, update `README.md` and `.env.example`.

## Commit messages

Use clear, conventional-style messages where possible, e.g. `feat(nextgen): add weather tool` or `fix(legacy): handle empty shortcut name`.

## Reporting bugs / requesting features

Use the issue templates. For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
