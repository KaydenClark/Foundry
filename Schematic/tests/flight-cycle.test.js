import assert from "node:assert/strict";
import test from "node:test";

import { createRun, replayTrace, transitionRun } from "../src/domain/engine.js";
import {
  jobOrderFlightScenario,
  premadeScenarios,
} from "../src/domain/scenario.js";
import { validateScenarioDefinition } from "../src/domain/scenarioLibrary.js";

const STAGES = [
  "Sitrep",
  "Preflight",
  "Launch-flight",
  "In-flight",
  "Landing-check",
  "Land",
  "PostFlight-check",
];

test("the opening Workflow maps the exact seven-stage Job Order flight", () => {
  assert.equal(premadeScenarios[0], jobOrderFlightScenario);
  assert.deepEqual(jobOrderFlightScenario.steps.map((step) => step.title), STAGES);
  const postflight = jobOrderFlightScenario.steps.at(-1);
  assert.equal(postflight.id, "job-order-flight-postflight-check");
  assert.ok(postflight.evidence.includes("postflight-check-receipt"));
  assert.match(postflight.description, /Actuality.*other.*Plane|other.*Plane.*Actuality/i);
  assert.match(postflight.description, /Integration.*fresh chat.*wait/i);
  assert.deepEqual(jobOrderFlightScenario.steps.map((step) => step.planeId), [
    "projection",
    "grounding",
    "canon",
    "actuality",
    "grounding",
    "actuality",
    "projection",
  ]);
  assert.deepEqual(jobOrderFlightScenario.steps.map((step) => step.worker), [
    "Pawn",
    "Pawn",
    "Pawn",
    "Agent",
    "Agent",
    "Agent",
    "Pawn",
  ]);
  assert.deepEqual(validateScenarioDefinition(jobOrderFlightScenario), []);
  assert.ok(Object.isFrozen(jobOrderFlightScenario));
  assert.ok(jobOrderFlightScenario.steps.every((step) => Object.isFrozen(step)));
});

test("the flight keeps one Job Order identity and a receipt at every boundary", () => {
  let run = createRun(jobOrderFlightScenario, 1);
  const jobOrderId = run.jobOrder.id;
  const runId = run.id;
  const visitedStages = [jobOrderFlightScenario.steps[run.stepIndex].title];

  assert.match(jobOrderFlightScenario.boundary, /modeled.*not live/i);
  assert.ok(jobOrderFlightScenario.steps.every((step) => step.evidence.some((item) => /handoff|receipt|verdict|fingerprint|candidate/i.test(item))));

  while (run.status !== "completed") {
    run = transitionRun(run, { type: "STEP" }, jobOrderFlightScenario);
    visitedStages.push(jobOrderFlightScenario.steps[run.stepIndex].title);
    assert.equal(run.id, runId);
    assert.equal(run.jobOrder.id, jobOrderId);
  }

  assert.deepEqual(visitedStages, STAGES);
  assert.equal(run.jobOrder.projectionStatus, "fresh");
  assert.equal(run.jobOrder.result, "closed-complete");
  assert.equal(run.trace.length, STAGES.length);

  const replayed = replayTrace(jobOrderFlightScenario, run.trace, 1);
  assert.deepEqual(replayed.jobOrder, run.jobOrder);
  assert.equal(replayed.stepIndex, STAGES.length - 1);
});

test("the four existing proof scenarios remain selectable after the additive flight map", () => {
  assert.deepEqual(
    premadeScenarios.slice(1).map((scenario) => scenario.title),
    [
      "Create & Assign a Job Order",
      "Update a Product from its Producer",
      "Review a Harness",
      "Recover a Release",
    ],
  );
});
