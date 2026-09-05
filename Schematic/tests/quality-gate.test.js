import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import { feedbackAuditScenario, governancePlanes } from "../src/domain/scenario.js";
import {
  assertSimulatorContract,
  evaluateSimulatorContract,
} from "../src/quality/simulatorContract.js";
import { createAtlasView } from "../src/view/atlasView.js";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("the integrated simulator contract joins six floors, Job Order, view, and run state", () => {
  const scenario = structuredClone(feedbackAuditScenario);
  const report = assertSimulatorContract({
    planes: structuredClone(governancePlanes),
    scenario,
    view: createAtlasView(),
    run: createRun(scenario, 1),
  });

  assert.deepEqual(report, {
    planeCount: 6,
    specCount: 5,
    taskCount: 13,
    stepCount: 13,
  });
});

test("integrated drift fails with actionable floor, Job Order, view, and run errors", () => {
  const scenario = structuredClone(feedbackAuditScenario);
  scenario.jobOrder.specs[0].tasks[0].stepId = "missing-step";
  const run = createRun(feedbackAuditScenario, 1);
  run.jobOrder.taskId = "SIM-TK-99";

  const errors = evaluateSimulatorContract({
    planes: governancePlanes.slice(1),
    scenario,
    view: { ...createAtlasView(), separation: 0 },
    run,
  });

  assert.ok(errors.some((error) => error.includes("six governance floors")));
  assert.ok(errors.some((error) => error.includes("missing step")));
  assert.ok(errors.some((error) => error.includes("Atlas separation")));
  assert.ok(errors.some((error) => error.includes("current task")));
});

test("domain, view, and shared-state seams remain independently changeable", () => {
  const domainSource = [
    source("../src/domain/engine.js"),
    source("../src/domain/jobOrder.js"),
    source("../src/domain/scenario.js"),
    source("../src/view/atlasView.js"),
  ].join("\n");
  const viewContextSource = source("../src/store/ViewContext.jsx");
  const factorySource = source("../src/components/FactoryStack.jsx");
  const railSource = source("../src/components/JourneyRail.jsx");

  assert.doesNotMatch(domainSource, /from ["']react|\bwindow\b|\bdocument\b/);
  assert.doesNotMatch(viewContextSource, /RunContext/);
  assert.match(factorySource, /useView/);
  assert.match(factorySource, /SchematicControls/);
  assert.match(railSource, /scenario\.jobOrder\.specs/);
  assert.match(railSource, /run\.jobOrder\.specId/);
});
