import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { bearerFromHeader } from "../src/core/auth.js";
import { createApp, isMcpOriginAllowed } from "../src/server.js";
import { ShortcutStore } from "../src/modules/legacy/store.js";

test("bearer parser rejects whitespace and control characters", () => {
  assert.equal(bearerFromHeader("Bearer valid-token_123"), "valid-token_123");
  assert.equal(bearerFromHeader("Bearer two tokens"), "");
  assert.equal(bearerFromHeader("Basic abc"), "");
  assert.equal(bearerFromHeader("Bearer bad\nvalue"), "");
});

test("MCP origin validation rejects untrusted and opaque origins", () => {
  assert.equal(isMcpOriginAllowed("https://evil.example"), false);
  assert.equal(isMcpOriginAllowed("null"), false);
  assert.equal(isMcpOriginAllowed("not-a-url"), false);
});

test("shortcut capability URLs are single-use", () => {
  const store = new ShortcutStore({ ttlMs: 60_000, maxEntries: 2 });
  const id = store.put(Buffer.from("shortcut"), "test.shortcut");
  assert.equal(store.take(id)?.buffer.toString(), "shortcut");
  assert.equal(store.take(id), undefined);
  store.close();
});

test("createApp is isolated and can be called more than once", () => {
  assert.doesNotThrow(() => createApp());
  assert.doesNotThrow(() => createApp());
});

test("HTTP responses include security headers and reject an untrusted MCP Origin", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.ok(health.headers.get("content-security-policy")?.includes("default-src 'self'"));
    assert.ok(health.headers.get("x-request-id"));

    const mcp = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(mcp.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
