import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import {
  REFERENCE_REGISTRY,
  relatedReferences,
  resolveReference,
  selectReference,
  validateReferenceRegistry,
} from "../src/domain/referenceRegistry.js";

test("one public registry consumes the thirteen-Hall Projection while keeping every reference type distinct", () => {
  assert.deepEqual(validateReferenceRegistry(REFERENCE_REGISTRY), []);
  assert.deepEqual(Object.keys(REFERENCE_REGISTRY.collections), ["hall", "socket", "module", "workshop", "workbench"]);
  assert.deepEqual(REFERENCE_REGISTRY.collections.hall.map((hall) => hall.name), [
    "Intake", "Validation", "Gatehouse", "Orchestration", "Design", "Knowledge",
    "Scheduling", "Forge", "Production", "Assay", "Ward", "Gauge", "Shipping",
  ]);
  assert.equal(REFERENCE_REGISTRY.collections.socket.length, 5);
  assert.equal(REFERENCE_REGISTRY.collections.module.length, 4);
  assert.equal(REFERENCE_REGISTRY.provenance.liveInventory, false);
});

test("typed relations resolve in both directions", () => {
  const recall = resolveReference(REFERENCE_REGISTRY, "socket", "5R1K");
  const related = relatedReferences(REFERENCE_REGISTRY, recall.type, recall.id);

  assert.equal(recall.homeHallId, "1R6F");
  assert.ok(related.some((record) => record.type === "hall" && record.id === "1R6F"));
  assert.ok(related.some((record) => record.type === "module" && record.id === "4Q7B"));
});

test("dangling and mismatched connections fail visibly", () => {
  const invalid = structuredClone(REFERENCE_REGISTRY);
  invalid.collections.module[0].implementsSocketIds = ["MISSING"];
  invalid.collections.socket[1].moduleIds = [];

  const errors = validateReferenceRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("MISSING")));
  assert.ok(errors.some((error) => error.includes("must declare the same binding")));
});

test("Workbench anatomy covers the full harness and its Workshop application", () => {
  const workbench = resolveReference(REFERENCE_REGISTRY, "workbench", "workbench-project");
  assert.deepEqual(workbench.anatomy.map((part) => part.name), [
    "Contract",
    "Canon",
    "Wiki / Brain",
    "Specifications",
    "Procedures",
    "Skills + Tools",
    "Tests",
    "Workshop Application",
  ]);
});

test("reference selection is explanatory state and does not mutate the active Run", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);
  const selection = selectReference(REFERENCE_REGISTRY, { type: "module", id: "4Q7B" });

  assert.deepEqual(selection, { type: "module", id: "4Q7B" });
  assert.deepEqual(run, before);
  assert.throws(() => selectReference(REFERENCE_REGISTRY, { type: "building", id: "4Q7B" }), /Unsupported reference type/);
});

test("all four dedicated routes render the shared reference explorer", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/ReferencePages.jsx", import.meta.url), "utf8");

  for (const route of ["/halls", "/sockets", "/modules", "/workbench"]) assert.match(app, new RegExp(`"${route}"`));
  assert.match(page, /ReferenceExplorer/g);
  assert.match(page, /REFERENCE_REGISTRY/);
});
