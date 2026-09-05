import assert from "node:assert/strict";
import test from "node:test";

import {
  FOUNDRY_PROJECTION,
  validateFoundryProjection,
} from "../src/domain/foundryProjection.js";

test("the local public Projection fixture declares one future model with opaque identities", () => {
  assert.deepEqual(validateFoundryProjection(FOUNDRY_PROJECTION), []);
  assert.deepEqual(FOUNDRY_PROJECTION.halls.map(({ name }) => name), [
    "Intake", "Validation", "Gatehouse", "Orchestration", "Design", "Knowledge",
    "Scheduling", "Forge", "Production", "Assay", "Ward", "Gauge", "Shipping",
  ]);
  assert.equal(FOUNDRY_PROJECTION.modules.length, 4);
  assert.equal(FOUNDRY_PROJECTION.sockets.length, 5);

  const ids = [...FOUNDRY_PROJECTION.halls, ...FOUNDRY_PROJECTION.modules, ...FOUNDRY_PROJECTION.sockets].map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[A-Z0-9]{4}$/.test(id)));
});

test("Hall count comes from the declared future-model fixture rather than a permanent numeric invariant", () => {
  const expanded = structuredClone(FOUNDRY_PROJECTION);
  expanded.halls.push({
    ...structuredClone(expanded.halls.find(({ name }) => name === "Design")),
    id: "0Z9X",
    name: "Example Canon Addition",
  });
  assert.deepEqual(validateFoundryProjection(expanded), []);

  const reduced = structuredClone(FOUNDRY_PROJECTION);
  reduced.halls = reduced.halls.filter(({ name }) => name !== "Design");
  assert.deepEqual(validateFoundryProjection(reduced), []);
});

test("architectural homes can move without changing a permanent identity or admitting a private path", () => {
  const moved = structuredClone(FOUNDRY_PROJECTION);
  moved.halls[0].homeId = "factory-secondary";
  assert.deepEqual(validateFoundryProjection(moved), []);

  moved.homes[0].id = "/private/foundry";
  assert.ok(validateFoundryProjection(moved).some((error) => error.includes("home")));
});

test("the fixture rejects dangling bindings and authority violations", () => {
  const invalid = structuredClone(FOUNDRY_PROJECTION);
  invalid.modules[0].implementsSocketIds = ["MISSING"];
  invalid.halls.find(({ name }) => name === "Gatehouse").forbidden = ["route"];
  invalid.halls.find(({ name }) => name === "Validation").mode = "write";
  invalid.halls.find(({ name }) => name === "Gauge").forbidden = ["write-canon"];
  invalid.halls.find(({ name }) => name === "Shipping").status = "NATIVE HALL";

  const errors = validateFoundryProjection(invalid);
  assert.ok(errors.some((error) => error.includes("MISSING")));
  assert.ok(errors.some((error) => error.includes("Gatehouse")));
  assert.ok(errors.some((error) => error.includes("Validation")));
  assert.ok(errors.some((error) => error.includes("Gauge")));
  assert.ok(errors.some((error) => error.includes("Shipping")));
});
