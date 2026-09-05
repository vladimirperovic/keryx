import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolRegistry, type ToolDefinition } from "../src/core/registry.ts";
import { bearerFromHeader, safeTokenEqual, checkToolAuth } from "../src/core/auth.ts";
import { registerNextGenModule } from "../src/modules/nextgen/tools.ts";

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
  assert.equal(typeof checkToolAuth(forward, ""), "string");
  assert.equal(checkToolAuth(forward, "some-token"), null);
});

test("RenovationSteps tools are exposed through the shared registry", () => {
  const r = new ToolRegistry();
  registerNextGenModule(r);
  const names = new Set(r.list().map((tool) => tool.name));
  for (const name of [
    "renovation_project_context",
    "renovation_query_quantities",
    "renovation_quantity_change_preview",
    "renovation_quantity_change_apply",
    "renovation_update_task",
    "renovation_create_task",
    "renovation_update_ffe_procurement",
  ]) {
    assert.ok(names.has(name), `${name} should be registered`);
    assert.equal(r.get(name)?.auth, "forward");
  }
});

test("generic task updates cannot bypass the audited quantity-change workflow", () => {
  const r = new ToolRegistry();
  registerNextGenModule(r);
  const tool = r.get("renovation_update_task");
  assert.ok(tool);
  assert.throws(() =>
    tool.input.parse({
      project_id: "project-1",
      task_id: "task-1",
      patch: { status: "in_progress", quantity: 99 },
    }),
  );
});

test("quantity apply schema requires the state that was approved in preview", () => {
  const r = new ToolRegistry();
  registerNextGenModule(r);
  const tool = r.get("renovation_quantity_change_apply");
  assert.ok(tool);
  assert.throws(() =>
    tool.input.parse({
      project_id: "project-1",
      preview_token: "0123456789abcdef0123456789abcdef",
      apply_payload: {
        target_type: "ffe",
        target_id: "ffe-1",
        item_code: "KT-01",
        new_quantity: 10,
        expected_previous_quantity: 8,
        reason: "Client change",
      },
    }),
  );
});
