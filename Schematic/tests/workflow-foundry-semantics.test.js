import assert from "node:assert/strict";
import test from "node:test";

import { createRun, transitionRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import { deriveWorkflowFoundrySemantics } from "../src/domain/workflowFoundrySemantics.js";

function advanceTo(run, stepId) {
  let next = run;
  while (feedbackAuditScenario.steps[next.stepIndex].id !== stepId) {
    next = transitionRun(next, { type: "STEP" }, feedbackAuditScenario);
  }
  return next;
}

test("Workflow presents Gatehouse receipt, read-only Validation, then observe-only Gauge", () => {
  const run = advanceTo(createRun(feedbackAuditScenario, 1), "perform-audit");
  const semantics = deriveWorkflowFoundrySemantics(feedbackAuditScenario, run);

  assert.deepEqual(semantics.passage.map((stage) => stage.hall), ["Gatehouse", "Validation", "Gauge"]);
  assert.equal(semantics.passage[0].receipt, "append-only");
  assert.equal(semantics.passage[1].authority, "read-only finding");
  assert.equal(semantics.passage[2].authority, "observe-only");
  assert.equal(semantics.passage[2].writesActuality, false);
});

test("Workflow distinguishes Forge production, Production delivery, optional passages, and provisional Shipping", () => {
  const forge = deriveWorkflowFoundrySemantics(feedbackAuditScenario, createRun(feedbackAuditScenario, 1));
  const production = deriveWorkflowFoundrySemantics(
    feedbackAuditScenario,
    advanceTo(createRun(feedbackAuditScenario, 1), "perform-audit"),
  );

  assert.deepEqual(forge.producer, { kind: "Foundry producer", hall: "Forge" });
  assert.deepEqual(production.producer, { kind: "Product/project", hall: "Production" });
  assert.deepEqual(production.optionalPassages.map((passage) => passage.hall), ["Design", "Knowledge", "Scheduling"]);
  assert.ok(production.optionalPassages.every((passage) => passage.optional));
  assert.deepEqual(production.shipping, { status: "provisional", declaredProducer: "Production" });
});

test("Assay pass gates one bounded Ward repair and integration never reaches main", () => {
  let run = advanceTo(createRun(feedbackAuditScenario, 1), "ground-results");
  run = transitionRun(run, { type: "INJECT_TRIP" }, feedbackAuditScenario);
  const semantics = deriveWorkflowFoundrySemantics(feedbackAuditScenario, run);

  assert.equal(semantics.assay.status, "passed");
  assert.equal(semantics.ward.maxRepairs, 1);
  assert.equal(semantics.ward.repairsUsed, 1);
  assert.equal(semantics.integration.target, "integration");
  assert.equal(semantics.integration.main, "owner-only; not performed");
});

test("unknown custom steps fail closed and semantic presentation never mutates the Run", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);
  const initial = deriveWorkflowFoundrySemantics(feedbackAuditScenario, run);
  const advanced = deriveWorkflowFoundrySemantics(feedbackAuditScenario, transitionRun(run, { type: "STEP" }, feedbackAuditScenario));
  const customScenario = structuredClone(feedbackAuditScenario);
  customScenario.steps[0].id = "custom-unrecognized-step";

  assert.notDeepEqual(initial, advanced);
  assert.deepEqual(run, before);
  assert.throws(() => deriveWorkflowFoundrySemantics(customScenario, run), /unknown step/i);
});
