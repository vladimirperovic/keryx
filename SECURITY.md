# Security Policy

## Supported versions

Keryx is pre-1.0. Security fixes are applied to the latest published release and the current `main` branch. Older commits and unsupported runtime versions may not receive patches.

## Reporting a vulnerability

**Do not open a public issue, discussion, or pull request for a suspected vulnerability.**

Use GitHub private vulnerability reporting from the repository Security page when it is enabled. Otherwise email **vladimir.perovic@gmail.com** with:

- a description of the issue and likely impact;
- affected version or commit;
- reproduction steps or a proof of concept;
- relevant deployment details with all secrets removed;
- a suggested fix, when available;
- whether you want public credit.

Please allow time to reproduce, coordinate a fix, and prepare a release before publishing details. Response and remediation times depend on severity and maintainer availability; this open-source project does not provide an SLA.

## Security scope

Reports are especially useful for:

- authentication or authorization bypass;
- token disclosure or forwarding to an unintended destination;
- MCP Origin or transport bypass;
- request, response, or artifact resource exhaustion;
- injection through tool input or Shortcut generation;
- container escape caused by Keryx configuration;
- vulnerable production dependencies with a practical Keryx impact.

Upstream application authorization bugs, reverse-proxy/host misconfiguration, compromised client devices, and vulnerabilities in unrelated services are generally outside this repository's scope unless Keryx materially enables the exploit.

## Production requirements

- Run `NODE_ENV=production`; Keryx then refuses to start without HTTPS `PUBLIC_BASE_URL` and a gateway token of at least 32 characters.
- Terminate TLS at a trusted reverse proxy and set `KERYX_TRUST_PROXY` to the exact number of trusted hops.
- Keep the Compose default loopback bind unless direct network exposure is intentional.
- Use explicit `KERYX_CORS_ORIGIN` and `KERYX_MCP_ALLOWED_ORIGINS` values; never use wildcard CORS in production.
- Do not log Authorization headers, request bodies, generated Shortcut files, or upstream personal data at the proxy or observability layer.
- Keep `SITE_STATS_URL` fixed, HTTPS, and controlled by the operator. Its service remains responsible for identity and per-user authorization.
- Use narrowly scoped, revocable target tokens in generated Shortcuts. Anyone who obtains a downloaded Shortcut can inspect the embedded token.
- Apply repository and dependency updates promptly and review CI, CodeQL, dependency-review, and Dependabot results.

For the complete model, read [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) and [THREAT_MODEL.md](THREAT_MODEL.md).
