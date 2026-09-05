import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import {
  PROJECT_UPDATE_ROUTE,
  RuntimeValidationError,
  createSimulationRuntime,
  validateRoute,
  validateRoutes,
} from "./schematic-runtime.mjs";
import { FOUNDRY_SCHEMATIC_WORKFLOWS } from "./schematic-workflows.mjs";

async function loadAtlasRegistry() {
  const source = await readFile(new URL("./schematic-atlas-data.js", import.meta.url), "utf8");
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context, { filename: "schematic-atlas-data.js" });
  return context.globalThis.FoundrySchematicAtlasData.registry;
}

test("the generic project-update fixture validates and reaches a Pawn projection capture", () => {
  assert.deepEqual(validateRoute(PROJECT_UPDATE_ROUTE), { ok: true, errors: [] });

  const runtime = createSimulationRuntime({ routes: [PROJECT_UPDATE_ROUTE] });
  const initial = runtime.snapshot();
  assert.equal(initial.currentStep.kind, "projection-signal");
  assert.equal(initial.panels.taskboard.surface, "canon");
  assert.equal(initial.panels.projection.freshness, "fresh");

  while (!runtime.snapshot().complete) runtime.next();

  const complete = runtime.snapshot();
  assert.equal(complete.currentStep.kind, "projection-capture");
  assert.equal(complete.currentActor.type, "pawn");
  assert.equal(complete.panels.projection.captureAt, "2026-08-04T12:08:00.000Z");
  assert.equal(complete.panels.projection.freshness, "fresh");
  assert.ok(complete.panels.grounding.disposition);
});

test("reset and replay return identical deterministic snapshots", () => {
  const runtime = createSimulationRuntime({ routes: [PROJECT_UPDATE_ROUTE] });
  while (!runtime.snapshot().complete) runtime.next();
  const firstRun = runtime.snapshot();

  runtime.reset();
  while (!runtime.snapshot().complete) runtime.next();
  assert.deepEqual(runtime.snapshot(), firstRun);
});

test("selection persists when changing Atlas and Simulation modes", () => {
  const runtime = createSimulationRuntime({ routes: [PROJECT_UPDATE_ROUTE] });
  runtime.selectAtlas({ nodeId: "canon-taskboard", edgeId: "canon-issues-job-order" });
  runtime.setMode("simulation");

  assert.deepEqual(runtime.snapshot().selection, {
    nodeId: "canon-taskboard",
    edgeId: "canon-issues-job-order",
  });
  assert.equal(runtime.snapshot().mode, "simulation");
});

test("keyboard controls and reduced motion are UI-independent and deterministic", () => {
  const events = [];
  const runtime = createSimulationRuntime({
    routes: [PROJECT_UPDATE_ROUTE],
    reducedMotion: true,
    onEvent: (event) => events.push(event.type),
  });

  runtime.handleKey("ArrowRight");
  runtime.handleKey(" ");
  assert.equal(runtime.snapshot().cursor, 1);
  assert.equal(runtime.snapshot().playing, true);
  assert.equal(runtime.snapshot().reducedMotion, true);
  runtime.handleKey(" ");
  assert.equal(runtime.snapshot().playing, false);
  assert.ok(events.includes("step"));
  assert.ok(events.includes("play"));
});

test("authority violations fail closed before a runtime can be created", () => {
  const preCanonIssue = structuredClone(PROJECT_UPDATE_ROUTE);
  const canonIndex = preCanonIssue.steps.findIndex((step) => step.kind === "canon-issue");
  [preCanonIssue.steps[canonIndex - 1], preCanonIssue.steps[canonIndex]] = [
    preCanonIssue.steps[canonIndex],
    preCanonIssue.steps[canonIndex - 1],
  ];
  assert.equal(validateRoute(preCanonIssue).ok, false);

  const unscopedActuality = structuredClone(PROJECT_UPDATE_ROUTE);
  delete unscopedActuality.steps.find((step) => step.kind === "canon-issue").jobOrder.scope;
  assert.equal(validateRoute(unscopedActuality).ok, false);

  const agentProjection = structuredClone(PROJECT_UPDATE_ROUTE);
  agentProjection.steps.at(-1).actorId = "project-agent";
  assert.equal(validateRoute(agentProjection).ok, false);

  const missingDisposition = structuredClone(PROJECT_UPDATE_ROUTE);
  missingDisposition.steps.find((step) => step.kind === "intent-disposition").panels.grounding.disposition = null;
  assert.equal(validateRoute(missingDisposition).ok, false);

  const taskboardMirror = structuredClone(PROJECT_UPDATE_ROUTE);
  taskboardMirror.steps[0].panels.taskboard.surface = "projection";
  assert.equal(validateRoute(taskboardMirror).ok, false);

  assert.throws(
    () => createSimulationRuntime({ routes: [preCanonIssue] }),
    RuntimeValidationError,
  );
});

test("optional Atlas registry checks reject dangling route references", () => {
  const components = {
    nodes: PROJECT_UPDATE_ROUTE.atlas.nodes.map((key) => ({ key })),
    edges: PROJECT_UPDATE_ROUTE.atlas.edges,
  };
  assert.equal(validateRoute(PROJECT_UPDATE_ROUTE, { components }).ok, true);

  const dangling = structuredClone(PROJECT_UPDATE_ROUTE);
  dangling.steps[0].atlas.nodes.push("missing-atlas-node");
  assert.equal(validateRoute(dangling, { components }).ok, false);
});

test("component checks accept keyed Atlas relationships as the edge source", () => {
  const components = {
    nodes: PROJECT_UPDATE_ROUTE.atlas.nodes.map((key) => ({ key })),
    relationships: PROJECT_UPDATE_ROUTE.atlas.edges.map((key) => ({ key })),
  };
  assert.equal(validateRoute(PROJECT_UPDATE_ROUTE, { components }).ok, true);
});

test("authority panels cannot show a premature Job Order or misattribute a Pawn projection capture", () => {
  const prematureOrder = structuredClone(PROJECT_UPDATE_ROUTE);
  prematureOrder.steps[0].panels.taskboard.jobOrder = "JO-premature";
  assert.equal(validateRoute(prematureOrder).ok, false);

  const agentWrittenCapture = structuredClone(PROJECT_UPDATE_ROUTE);
  agentWrittenCapture.steps.at(-1).panels.projection.writer = "Agent";
  assert.equal(validateRoute(agentWrittenCapture).ok, false);
});

test("actual Atlas registry and workflow library validate through one component seam", async () => {
  const registry = await loadAtlasRegistry();
  assert.ok(registry.relationships.every((relationship) => relationship.key));
  assert.deepEqual(validateRoutes(FOUNDRY_SCHEMATIC_WORKFLOWS.routes, { components: registry }), {
    ok: true,
    errors: [],
  });
});
