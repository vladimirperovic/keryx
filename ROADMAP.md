# Roadmap

Keryx is pre-1.0. Priorities favor a small, secure gateway over rapid feature growth.

## 0.2 — Hardened public foundation

- [x] Production fail-closed configuration.
- [x] MCP Origin validation.
- [x] Supported Node LTS container and CI matrix.
- [x] Bounded upstream responses and redirect blocking.
- [x] Single-use Shortcut capability links.
- [x] Security headers, proxy-aware rate limiting, and hardened Compose defaults.
- [x] CodeQL, dependency review, and Dependabot.
- [ ] Enable repository private vulnerability reporting in GitHub settings.
- [ ] Protect `main` with required CI and dependency-review checks.

## 0.3 — Protocol maturity

- [ ] Track the current MCP authorization specification and evaluate OAuth 2.1 protected-resource support.
- [ ] Add structured MCP tool output schemas and tool behavior annotations where supported by the SDK.
- [ ] Add protocol conformance and malformed JSON-RPC tests.
- [ ] Improve OpenAPI response schemas and error documentation.
- [ ] Add optional health/readiness distinction.

## 0.4 — Operability

- [ ] Structured JSON logging with configurable level and redaction tests.
- [ ] OpenTelemetry traces and metrics behind an opt-in flag.
- [ ] Per-tool rate-limit overrides.
- [ ] Graceful upstream circuit breaker and bounded retry policy for safe/idempotent tools.
- [ ] Container image publishing with provenance, SBOM, and signed releases.

## 0.5 — Extensibility

- [ ] Formal tool module interface and examples package.
- [ ] Storage interface for multi-instance Shortcut delivery.
- [ ] Multiple gateway credentials with scopes and rotation.
- [ ] Policy hooks for tool allow/deny decisions.

## 1.0 criteria

- Stable configuration and tool-definition API.
- Documented compatibility and deprecation policy.
- Supported OAuth path for public multi-user deployments or a clearly documented token-only scope.
- Release automation, provenance, SBOM, and reproducible deployment guidance.
- External security review of the gateway boundary and Shortcut token lifecycle.

## Non-goals

Keryx will not become a general reverse proxy, identity provider, secret vault, arbitrary URL fetcher, or full workflow engine.
