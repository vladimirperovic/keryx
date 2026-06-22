# Security Policy

## Supported versions

Keryx is pre-1.0; only the latest `main` is supported with security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately to **vladimir.perovic@gmail.com** with:

- a description of the issue and its impact,
- steps to reproduce (proof of concept if possible),
- any suggested fix.

You can expect an initial response within a few days. Once a fix is released, we are happy to credit you (unless you prefer to stay anonymous).

## Scope & hardening notes

- **Tokens** (`KERYX_API_TOKEN` and any tokens you embed in shortcuts) are credentials — treat them like passwords. A token embedded in a generated `.shortcut` is visible to anyone who obtains that file.
- Always run behind **HTTPS** in production and set `PUBLIC_BASE_URL` to your real origin.
- Set `KERYX_CORS_ORIGIN` to your specific origins in production (avoid `*`).
- `forward` tools pass the caller's token to an upstream service — scope/authorization must be enforced **by that upstream**, never by trusting client-supplied parameters.
