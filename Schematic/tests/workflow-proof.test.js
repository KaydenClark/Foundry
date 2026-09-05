import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun, transitionRun } from "../src/domain/engine.js";
import {
  feedbackAuditScenario,
  premadeScenarios,
} from "../src/domain/scenario.js";
import { validateScenarioDefinition } from "../src/domain/scenarioLibrary.js";
import { deriveWorkflowProofPresentation } from "../src/domain/workflowProof.js";
import {
  createInitialScenarioSession,
  selectScenarioSession,
} from "../src/store/scenarioSession.js";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("Workflow ships the flight map and four retained immutable public-safe proof scenarios", () => {
  assert.deepEqual(
    premadeScenarios.map((scenario) => scenario.title),
    [
      "Fly a Job Order",
      "Create & Assign a Job Order",
      "Update a Product from its Producer",
      "Review a Harness",
      "Recover a Release",
    ],
  );
  assert.equal(premadeScenarios[3], feedbackAuditScenario);
  assert.ok(premadeScenarios.every((scenario) => Object.isFrozen(scenario)));
  assert.ok(premadeScenarios.every((scenario) => validateScenarioDefinition(scenario).length === 0));

  const identities = premadeScenarios.flatMap((scenario) => [
    `scenario:${scenario.id}`,
    `short:${scenario.shortId}`,
    `job-order:${scenario.jobOrder.id}`,
  ]);
  assert.equal(new Set(identities).size, identities.length);
  assert.ok(premadeScenarios.every((scenario) => /Simulation only/i.test(scenario.boundary)));
});

test("selecting a premade Workflow creates a distinct internally consistent Run", () => {
  const sourceSession = createInitialScenarioSession(premadeScenarios[0]);
  const sourceSnapshot = structuredClone(sourceSession);
  const selected = selectScenarioSession(sourceSession, premadeScenarios[1]);

  assert.deepEqual(selected.scenario, premadeScenarios[1]);
  assert.equal(selected.run.scenarioId, premadeScenarios[1].id);
  assert.equal(selected.run.jobOrder.id, premadeScenarios[1].jobOrder.id);
  assert.equal(selected.run.stepIndex, 0);
  assert.equal(selected.run.status, "idle");
  assert.notEqual(selected.run.id, sourceSession.run.id);
  assert.deepEqual(sourceSession, sourceSnapshot);
});

test("Workflow proof derives ordered step state, Plane, Clearance bands, and passage receipt", () => {
  const scenario = premadeScenarios[0];
  let run = createRun(scenario, 1);
  run = transitionRun(run, { type: "STEP" }, scenario);
  run = transitionRun(run, { type: "STEP" }, scenario);
  const before = structuredClone(run);
  const presentation = deriveWorkflowProofPresentation(scenario, run);

  assert.deepEqual(presentation.steps.map((step) => step.state), ["complete", "complete", "active", ...scenario.steps.slice(3).map(() => "queued")]);
  assert.equal(presentation.current.step.id, scenario.steps[2].id);
  assert.equal(presentation.current.plane.id, scenario.steps[2].planeId);
  assert.ok(presentation.steps.every((step) => step.clearance.read.length > 0));
  assert.ok(presentation.steps.every((step) => step.clearance.write.length > 0));
  assert.deepEqual(presentation.current.clearance, presentation.steps[2].clearance);
  assert.match(presentation.receipt.id, /^PASSAGE-/);
  assert.equal(presentation.receipt.stepId, scenario.steps[2].id);
  assert.match(presentation.receipt.result, /recorded|not required/i);
  assert.deepEqual(run, before);
});

test("Workflow proof remains synchronized through completion", () => {
  const scenario = premadeScenarios[4];
  let run = createRun(scenario, 1);
  while (run.status !== "completed") run = transitionRun(run, { type: "STEP" }, scenario);

  const presentation = deriveWorkflowProofPresentation(scenario, run);
  assert.ok(presentation.steps.every((step) => step.state === "complete"));
  assert.equal(presentation.progress.completed, scenario.steps.length);
  assert.equal(presentation.progress.total, scenario.steps.length);
  assert.equal(presentation.current.plane.id, "projection");
  assert.equal(presentation.current.step.id, scenario.steps.at(-1).id);
});

test("Socket work resolves to connection infrastructure instead of a room", () => {
  const scenario = premadeScenarios[2];
  const socketStepIndex = scenario.steps.findIndex((step) => (
    step.structuralClasses.includes("sockets") && step.structuralClasses.length < 3
  ));
  let run = createRun(scenario, 1);
  while (run.stepIndex < socketStepIndex) run = transitionRun(run, { type: "STEP" }, scenario);

  const presentation = deriveWorkflowProofPresentation(scenario, run);

  assert.equal(presentation.current.token.target, "socket conduit");
  assert.equal(presentation.current.token.kind, "connection");
});

test("the Workflow route composes the proof console without borrowing Governance FactoryStack", () => {
  const page = source("../src/pages/WorkflowPage.jsx");
  const player = source("../src/pages/RunPlayer.jsx");
  const picker = source("../src/components/WorkflowScenarioPicker.jsx");
  const rail = source("../src/components/WorkflowExecutionRail.jsx");
  const plan = source("../src/components/WorkflowFloorPlan.jsx");

  assert.match(page, /<WorkflowScenarioPicker\s*\/>/);
  assert.match(page, /<RunPlayer\s*\/>/);
  assert.match(player, /<WorkflowExecutionRail/);
  assert.match(player, /<WorkflowFloorPlan/);
  assert.doesNotMatch(page + player + picker + rail + plan, /FactoryStack/);
  assert.match(rail, /JOB ORDER STEPS/);
  assert.match(rail, /GOVERNANCE PLANE/);
  assert.match(rail, /CLEARANCE/);
  assert.match(rail, /READ/);
  assert.match(rail, /WRITE/);
  assert.match(plan, /FOUNDRY FLOOR PLAN/);
  assert.match(plan, /HALLS/);
  assert.match(plan, /MODULES/);
  assert.match(plan, /SOCKETS/);
  assert.match(plan, /WORKSPACE/);
  assert.match(plan, /workflow-socket-network/);
  assert.match(plan, /Sockets connect Halls, Workspace, and Modules/);
  assert.doesNotMatch(plan, /zone-sockets/);
});
