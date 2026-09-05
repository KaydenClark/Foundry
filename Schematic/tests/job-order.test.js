import assert from "node:assert/strict";
import test from "node:test";

import {
  flattenJobOrder,
  resolveCurrentWork,
  resolveLocationRoom,
  validateScenarioJobOrder,
} from "../src/domain/jobOrder.js";
import { createRun, transitionRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";

test("the example Job Order lists every runtime step under one spec and task", () => {
  assert.deepEqual(validateScenarioJobOrder(feedbackAuditScenario), []);

  const ordered = flattenJobOrder(feedbackAuditScenario);
  assert.equal(ordered.length, feedbackAuditScenario.steps.length);
  assert.equal(new Set(ordered.map((entry) => entry.spec.id)).size, feedbackAuditScenario.jobOrder.specs.length);
  assert.deepEqual(
    ordered.map((entry) => entry.step.id),
    feedbackAuditScenario.steps.map((step) => step.id),
  );
});

test("current work resolves spec, task, plane, and Foundry location together", () => {
  const stepIndex = feedbackAuditScenario.steps.findIndex((step) => step.id === "perform-audit");
  const current = resolveCurrentWork(feedbackAuditScenario, stepIndex);

  assert.equal(current.spec.id, "SIM-SPEC-03");
  assert.equal(current.task.id, "SIM-TK-06");
  assert.equal(current.step.id, "perform-audit");
  assert.equal(current.step.planeId, "actuality");
  assert.equal(current.step.location, "Assay workbench");
});

test("runtime state and trace carry the synchronized current spec and task", () => {
  let run = createRun(feedbackAuditScenario, 1);
  assert.equal(run.jobOrder.id, feedbackAuditScenario.jobOrder.id);
  assert.equal(run.jobOrder.specId, "SIM-SPEC-01");
  assert.equal(run.jobOrder.taskId, "SIM-TK-01");

  run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
  assert.equal(run.jobOrder.taskId, "SIM-TK-02");
  assert.equal(run.trace.at(-1).specId, "SIM-SPEC-01");
  assert.equal(run.trace.at(-1).taskId, "SIM-TK-02");
});

test("duplicate and dangling spec/task identities fail visibly", () => {
  const duplicate = structuredClone(feedbackAuditScenario);
  duplicate.jobOrder.specs[0].tasks[1].id = duplicate.jobOrder.specs[0].tasks[0].id;
  assert.match(validateScenarioJobOrder(duplicate).join("\n"), /Duplicate task id/);

  const dangling = structuredClone(feedbackAuditScenario);
  dangling.steps[0].taskId = "SIM-TK-404";
  assert.match(validateScenarioJobOrder(dangling).join("\n"), /does not resolve/);
});

test("Foundry locations resolve to the room highlighted on the current floor", () => {
  assert.equal(resolveLocationRoom("Assay workbench"), "assay");
  assert.equal(resolveLocationRoom("Gatehouse issue desk"), "gatehouse");
  assert.equal(resolveLocationRoom("Main Foundry Workspace"), "workspace");
  assert.equal(resolveLocationRoom("Projection mirror"), "workspace");
});
