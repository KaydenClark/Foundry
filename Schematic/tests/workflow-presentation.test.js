import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun, transitionRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import { deriveWorkflowPresentation, formatSimulationTime } from "../src/domain/workflowPresentation.js";

function step(run, count) {
  let next = run;
  for (let index = 0; index < count; index += 1) {
    next = transitionRun(next, { type: "STEP" }, feedbackAuditScenario);
  }
  return next;
}

test("workflow timing is derived from deterministic trace time", () => {
  let run = createRun(feedbackAuditScenario, 1);
  let presentation = deriveWorkflowPresentation(feedbackAuditScenario, run);

  assert.equal(presentation.elapsedMs, 0);
  assert.equal(presentation.activeDurationMs, 0);
  assert.equal(formatSimulationTime(16800), "T+16.8s");

  run = transitionRun(run, { type: "PAUSE" }, feedbackAuditScenario);
  presentation = deriveWorkflowPresentation(feedbackAuditScenario, run);
  assert.equal(presentation.elapsedMs, 800);
  assert.equal(presentation.activeDurationMs, 800);
});

test("a Plane change is described as a Gatehouse-checked elevator crossing", () => {
  const run = step(createRun(feedbackAuditScenario, 1), 1);
  const presentation = deriveWorkflowPresentation(feedbackAuditScenario, run);

  assert.equal(presentation.transition.usesElevator, true);
  assert.match(presentation.transition.message, /Gatehouse checked Job Order and Clearance/i);
  assert.match(presentation.transition.message, /elevator/i);
  assert.equal(presentation.plane.id, "intent");
});

test("same-floor movement is distinct from a Governance elevator crossing", () => {
  const actualityStaging = step(createRun(feedbackAuditScenario, 1), 6);
  const presentation = deriveWorkflowPresentation(feedbackAuditScenario, actualityStaging);

  assert.equal(feedbackAuditScenario.steps[5].planeId, "actuality");
  assert.equal(feedbackAuditScenario.steps[6].planeId, "actuality");
  assert.equal(presentation.transition.usesElevator, false);
  assert.match(presentation.transition.message, /within the identical floor plan/i);
});

test("Workflow summarizes structural classes without turning them into named rooms", () => {
  assert.ok(feedbackAuditScenario.steps.every((step) => Array.isArray(step.structuralClasses)));
  const initial = deriveWorkflowPresentation(feedbackAuditScenario, createRun(feedbackAuditScenario, 1));
  assert.deepEqual(initial.activations.map((activation) => activation.label), ["Halls", "Modules", "Sockets"]);
  assert.ok(initial.activations.every((activation) => typeof activation.durationMs === "number"));

  const actuality = deriveWorkflowPresentation(feedbackAuditScenario, step(createRun(feedbackAuditScenario, 1), 7));
  assert.deepEqual(
    actuality.activations.filter((activation) => activation.active).map((activation) => activation.label),
    ["Halls"],
  );
});

test("presentation derivation leaves the shared Run and trace untouched", () => {
  const run = step(createRun(feedbackAuditScenario, 1), 4);
  const before = structuredClone(run);

  deriveWorkflowPresentation(feedbackAuditScenario, run);

  assert.deepEqual(run, before);
});

test("a focused Workflow plan derives its stage, Plane, categories, and gate from one selected step", () => {
  const run = step(createRun(feedbackAuditScenario, 1), 7);
  const before = structuredClone(run);
  const focusedIndex = 1;
  const focusedStep = feedbackAuditScenario.steps[focusedIndex];
  const presentation = deriveWorkflowPresentation(feedbackAuditScenario, run, focusedIndex);

  assert.equal(presentation.step.id, focusedStep.id);
  assert.equal(presentation.plane.id, focusedStep.planeId);
  assert.equal(presentation.gate, focusedStep.gateResult);
  assert.deepEqual(
    presentation.activations.filter((activation) => activation.active).map((activation) => activation.id),
    focusedStep.structuralClasses,
  );
  assert.equal(presentation.stageDurationMs, 800);
  assert.deepEqual(run, before);
});

test("the singular Workflow route composes presets, proof console, category-only plan, and history", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/WorkflowPage.jsx", import.meta.url), "utf8");
  const player = readFileSync(new URL("../src/pages/RunPlayer.jsx", import.meta.url), "utf8");
  const plan = readFileSync(new URL("../src/components/WorkflowFloorPlan.jsx", import.meta.url), "utf8");
  const rail = readFileSync(new URL("../src/components/WorkflowExecutionRail.jsx", import.meta.url), "utf8");

  assert.match(app, /"\/workflow": WorkflowPage/);
  assert.match(page, /<WorkflowScenarioPicker \/>/);
  assert.match(page, /<RunPlayer \/>/);
  assert.match(player, /<WorkflowExecutionRail/);
  assert.match(player, /<WorkflowFloorPlan/);
  assert.match(player, /focusedStepIndex=\{focus\.index\}/);
  assert.doesNotMatch(player, /FactoryStack/);
  assert.match(plan, /HALLS/);
  assert.match(plan, /MODULES/);
  assert.match(plan, /SOCKETS/);
  assert.match(plan, /workflow-socket-network/);
  assert.doesNotMatch(plan, /zone-sockets/);
  assert.match(rail, /GOVERNANCE PLANE/);
  assert.match(rail, /CLEARANCE/);
  assert.match(page, /<WorkflowHistory history=\{history\} replay=\{replay\} clearHistory=\{clearHistory\} \/>/);
});
