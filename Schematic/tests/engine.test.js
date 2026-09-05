import assert from "node:assert/strict";
import test from "node:test";

import {
  createRun,
  replayTrace,
  transitionRun,
} from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";

function step(run, count = 1) {
  let next = run;
  for (let index = 0; index < count; index += 1) {
    next = transitionRun(next, { type: "STEP" }, feedbackAuditScenario);
  }
  return next;
}

test("a new run starts on the Projection mirror as a Pawn", () => {
  const run = createRun(feedbackAuditScenario, 1);

  assert.equal(run.id, "FEEDBACK-AUDIT-0001");
  assert.equal(run.status, "idle");
  assert.equal(run.stepIndex, 0);
  assert.equal(run.jobOrder.planeId, "projection");
  assert.equal(run.jobOrder.worker, "Pawn");
  assert.deepEqual(run.jobOrder.earnedAccess, []);
  assert.equal(run.trace.length, 1);
});

test("Agent activation happens only after the Canon issue", () => {
  let run = createRun(feedbackAuditScenario, 1);
  run = step(run, 4);

  assert.equal(run.jobOrder.planeId, "canon");
  assert.equal(run.jobOrder.worker, "Pawn");
  assert.deepEqual(run.jobOrder.earnedAccess, ["canon:read", "actuality:audit"]);

  run = step(run);
  assert.equal(run.jobOrder.planeId, "actuality");
  assert.equal(run.jobOrder.worker, "Agent");
});

test("the seed run completes the exact down-and-back floor circuit", () => {
  let run = createRun(feedbackAuditScenario, 1);
  const visited = [run.jobOrder.planeId];

  while (run.status !== "completed") {
    run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
    if (visited.at(-1) !== run.jobOrder.planeId) visited.push(run.jobOrder.planeId);
  }

  assert.deepEqual(visited, [
    "projection",
    "intent",
    "enduring-context",
    "grounding",
    "canon",
    "actuality",
    "grounding",
    "canon",
    "enduring-context",
    "intent",
    "projection",
  ]);
  assert.equal(run.jobOrder.worker, "Pawn");
  assert.equal(run.jobOrder.projectionStatus, "fresh");
});

test("trip injection holds the floor and records Gatehouse, Assay, then Ward", () => {
  let run = step(createRun(feedbackAuditScenario, 1), 3);
  const heldIndex = run.stepIndex;

  run = transitionRun(run, { type: "INJECT_TRIP" }, feedbackAuditScenario);

  assert.equal(run.status, "tripped");
  assert.equal(run.stepIndex, heldIndex);
  assert.equal(run.jobOrder.gateResult, "held");
  assert.deepEqual(
    run.trace.slice(-3).map((event) => event.kind),
    ["gatehouse-signal", "assay-check", "ward-report"],
  );

  run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
  assert.equal(run.status, "paused");
  assert.equal(run.stepIndex, heldIndex);
  assert.equal(run.jobOrder.gateResult, "clear");
  assert.equal(run.trace.at(-1).kind, "trip-disposition");
});

test("run, pause, speed, reset, and replay are deterministic controls", () => {
  let run = createRun(feedbackAuditScenario, 1);
  run = transitionRun(run, { type: "RUN" }, feedbackAuditScenario);
  assert.equal(run.status, "running");

  run = transitionRun(run, { type: "SET_SPEED", speed: 4 }, feedbackAuditScenario);
  assert.equal(run.speed, 4);

  run = transitionRun(run, { type: "PAUSE" }, feedbackAuditScenario);
  assert.equal(run.status, "paused");

  run = step(run, 5);
  const sourceTrace = run.trace;
  const replayed = replayTrace(feedbackAuditScenario, sourceTrace, 1);
  assert.equal(replayed.stepIndex, run.stepIndex);
  assert.deepEqual(replayed.jobOrder, run.jobOrder);

  const reset = transitionRun(run, { type: "RESET", runNumber: 2 }, feedbackAuditScenario);
  assert.equal(reset.id, "FEEDBACK-AUDIT-0002");
  assert.equal(reset.stepIndex, 0);
  assert.equal(reset.trace.length, 1);
});

test("advancement remains paused after a manual step and running after a tick", () => {
  let manual = createRun(feedbackAuditScenario, 1);
  manual = transitionRun(manual, { type: "STEP" }, feedbackAuditScenario);
  assert.equal(manual.status, "paused");

  let automatic = transitionRun(createRun(feedbackAuditScenario, 1), { type: "RUN" }, feedbackAuditScenario);
  automatic = transitionRun(automatic, { type: "TICK" }, feedbackAuditScenario);
  assert.equal(automatic.status, "running");
});
