# Deployment Guide

## Recommended topology

```text
Internet or private network
        │ HTTPS
        ▼
Caddy / Nginx / Traefik
        │ http://127.0.0.1:3000
        ▼
Keryx container
```

Docker Compose binds Keryx to `127.0.0.1` by default. Keep that default when the reverse proxy is on the same host.

## Production configuration

Create `.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
PUBLIC_BASE_URL=https://keryx.example.com
KERYX_API_TOKEN=<at-least-32-random-characters>
KERYX_CORS_ORIGIN=https://trusted-browser-client.example.com
KERYX_MCP_ALLOWED_ORIGINS=https://trusted-browser-client.example.com
KERYX_TRUST_PROXY=1
SITE_STATS_URL=https://application.example.com/api/stats
```

Generate a token with a cryptographically secure tool, for example:

```bash
openssl rand -base64 48
```

## Start

```bash
cp .env.example .env
# edit .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 keryx
```

## Reverse proxy requirements

- Terminate TLS with a valid certificate.
- Preserve the original `Host` header.
- Set `X-Forwarded-For` and `X-Forwarded-Proto` once.
- Do not log Authorization headers or request bodies.
- Apply reasonable connection/body limits at the proxy as an additional layer.
- Keep `KERYX_TRUST_PROXY` equal to the number of trusted proxy hops, not `true` for all proxies.

### Caddy example

```caddyfile
keryx.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Nginx example

```nginx
server {
    listen 443 ssl http2;
    server_name keryx.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Verification

```bash
curl -i https://keryx.example.com/healthz
curl -s https://keryx.example.com/openapi.json | jq .info
```

Verify that:

- HSTS and other security headers are present;
- the OpenAPI `servers` URL matches the public origin;
- unauthenticated gateway-tool calls return 401;
- an unknown MCP Origin returns 403;
- the container runs as a non-root user and remains healthy with a read-only filesystem.

## Updating

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker image prune
```

Review `CHANGELOG.md`, configuration changes, and the dependency/security checks before updating production.

## Backup and recovery

Keryx has no database. Back up only deployment configuration and reverse-proxy configuration. Do not back up temporary Shortcut files; they exist only in memory and contain embedded target credentials.
