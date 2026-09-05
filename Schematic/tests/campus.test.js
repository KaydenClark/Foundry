import assert from "node:assert/strict";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import {
  CAMPUS,
  CAMPUS_VIEW_DEFAULTS,
  createCampusView,
  resolveCampusEntity,
  rotateCampus,
  selectCampusEntity,
  validateCampus,
} from "../src/domain/campus.js";
import { FOUNDRY_PROJECTION } from "../src/domain/foundryProjection.js";

test("the end-state campus models two equivalent six-floor Factory deployments and every Canon-projected Hall", () => {
  assert.deepEqual(validateCampus(CAMPUS), []);
  assert.equal(CAMPUS.factories.length, 2);
  assert.ok(CAMPUS.factories.every((factory) => factory.floors === 6));
  assert.deepEqual(
    CAMPUS.factories.map((factory) => factory.modelId),
    ["portable-foundry", "portable-foundry"],
  );
  assert.deepEqual(
    CAMPUS.halls.map(({ id, name }) => ({ id, name })),
    FOUNDRY_PROJECTION.halls.map(({ id, name }) => ({ id, name })),
  );
  assert.equal(CAMPUS.halls.length, FOUNDRY_PROJECTION.halls.length);
});

test("Modules are buildings, Sockets are typed links, and every relation resolves", () => {
  assert.ok(CAMPUS.modules.length >= 3);
  assert.ok(CAMPUS.sockets.length >= CAMPUS.modules.length);
  assert.ok(CAMPUS.sockets.every((socket) => socket.contract && socket.factoryId && socket.moduleId));

  for (const socket of CAMPUS.sockets) {
    assert.equal(resolveCampusEntity(CAMPUS, "factory", socket.factoryId).kind, "factory");
    assert.equal(resolveCampusEntity(CAMPUS, "module", socket.moduleId).kind, "module");
  }
});

test("invalid or dangling campus data fails validation visibly", () => {
  const invalid = structuredClone(CAMPUS);
  invalid.halls[0].factoryId = "missing-factory";
  invalid.factories[1].floors = 5;

  assert.deepEqual(validateCampus(invalid), [
    "Factory factory-west must repeat the six-floor Foundry model.",
    `Hall ${CAMPUS.halls[0].id} points to missing Factory missing-factory.`,
  ]);
});

test("campus selection resolves typed explanatory details", () => {
  let view = createCampusView();
  assert.deepEqual(view, CAMPUS_VIEW_DEFAULTS);

  view = selectCampusEntity(view, CAMPUS, "hall", "2K7P");
  assert.equal(view.selection.kind, "hall");
  assert.match(resolveCampusEntity(CAMPUS, view.selection.kind, view.selection.id).detail, /candidate/i);

  view = selectCampusEntity(view, CAMPUS, "module", "module-memory");
  assert.equal(view.selection.kind, "module");
  assert.match(resolveCampusEntity(CAMPUS, view.selection.kind, view.selection.id).detail, /replaceable/i);

  view = selectCampusEntity(view, CAMPUS, "socket", "socket-memory-east");
  assert.equal(view.selection.kind, "socket");
  assert.match(resolveCampusEntity(CAMPUS, view.selection.kind, view.selection.id).detail, /contract/i);

  assert.throws(
    () => selectCampusEntity(view, CAMPUS, "building", "module-memory"),
    /Unsupported campus entity kind/,
  );
});

test("orbit and selection are local view state and leave a Run untouched", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);
  const rotated = rotateCampus(createCampusView(), { yaw: 90, pitch: 12 });
  const selected = selectCampusEntity(rotated, CAMPUS, "factory", "factory-west");

  assert.deepEqual(run, before);
  assert.equal(selected.yaw, 90);
  assert.equal(selected.pitch, 12);
  assert.deepEqual(selected.selection, { kind: "factory", id: "factory-west" });
});
