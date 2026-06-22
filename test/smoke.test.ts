import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolRegistry, type ToolDefinition } from "../src/core/registry.ts";
import { bearerFromHeader, safeTokenEqual, checkToolAuth } from "../src/core/auth.ts";

const sample: ToolDefinition = {
  name: "sample_tool",
  title: "Sample",
  description: "test tool",
  module: "test",
  input: z.object({}),
  handler: () => ({ ok: true }),
};

test("bearerFromHeader extracts the token", () => {
  assert.equal(bearerFromHeader("Bearer abc123"), "abc123");
  assert.equal(bearerFromHeader("bearer  xyz "), "xyz");
  assert.equal(bearerFromHeader(undefined), "");
  assert.equal(bearerFromHeader("Basic foo"), "");
});

test("safeTokenEqual compares in a length-aware way", () => {
  assert.equal(safeTokenEqual("secret", "secret"), true);
  assert.equal(safeTokenEqual("secret", "secrxt"), false);
  assert.equal(safeTokenEqual("abc", "ab"), false);
});

test("registry registers and lists tools", () => {
  const r = new ToolRegistry();
  r.register(sample);
  assert.equal(r.get("sample_tool")?.name, "sample_tool");
  assert.equal(r.list().length, 1);
});

test("registry rejects duplicate names", () => {
  const r = new ToolRegistry();
  r.register(sample);
  assert.throws(() => r.register(sample));
});

test("registry rejects non snake_case names", () => {
  const r = new ToolRegistry();
  assert.throws(() => r.register({ ...sample, name: "Bad Name" }));
});

test("checkToolAuth: forward tool requires a caller token", () => {
  const forward = { auth: "forward" } as ToolDefinition;
  assert.equal(typeof checkToolAuth(forward, ""), "string"); // missing token -> error
  assert.equal(checkToolAuth(forward, "some-token"), null); // present -> ok
});
