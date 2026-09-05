import assert from "node:assert/strict";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import { resolveTaskFocus } from "../src/domain/focus.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";

test("task focus selects a governance floor without changing the live run", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const runBeforeFocus = structuredClone(run);

  const focus = resolveTaskFocus(feedbackAuditScenario, run.stepIndex, "perform-audit");

  assert.equal(focus.step.id, "perform-audit");
  assert.equal(focus.plane.id, "actuality");
  assert.equal(focus.index, feedbackAuditScenario.steps.findIndex((step) => step.id === "perform-audit"));
  assert.equal(focus.isLive, false);
  assert.deepEqual(run, runBeforeFocus);
});

test("empty or invalid task focus safely follows the live step", () => {
  const live = resolveTaskFocus(feedbackAuditScenario, 3, null);
  const invalid = resolveTaskFocus(feedbackAuditScenario, 3, "not-a-real-step");

  assert.equal(live.step.id, "ground-candidate");
  assert.equal(live.plane.id, "grounding");
  assert.equal(live.isLive, true);
  assert.deepEqual(invalid, live);
});
