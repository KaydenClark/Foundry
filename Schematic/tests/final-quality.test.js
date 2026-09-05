import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { CAMPUS, validateCampus } from "../src/domain/campus.js";
import { createRun, transitionRun } from "../src/domain/engine.js";
import { GOVERNANCE_GUIDE, validateGovernanceGuide } from "../src/domain/governanceGuide.js";
import { REFERENCE_REGISTRY, validateReferenceRegistry } from "../src/domain/referenceRegistry.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import { routes } from "../src/router.js";
import { replayRunState } from "../src/store/replayRun.js";
import {
  archiveScenarioRun,
  createInitialScenarioSession,
  replayScenarioSession,
} from "../src/store/scenarioSession.js";

const root = new URL("..", import.meta.url);

function runWithStatus(status, runNumber) {
  let run = createRun(feedbackAuditScenario, runNumber);
  switch (status) {
    case "idle":
      return run;
    case "running":
      return transitionRun(run, { type: "RUN" }, feedbackAuditScenario);
    case "paused":
      return transitionRun(run, { type: "PAUSE" }, feedbackAuditScenario);
    case "tripped":
      return transitionRun(run, { type: "INJECT_TRIP" }, feedbackAuditScenario);
    case "completed":
      while (run.status !== "completed") {
        run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
      }
      return run;
    default:
      throw new RangeError(`Unsupported test run status: ${status}`);
  }
}

test("the final product contract joins exact navigation and every validated model", () => {
  assert.deepEqual(routes.map((route) => route.label), ["The Foundry", "Workflow", "Halls", "Sockets", "Modules", "Workbench", "Governance"]);
  assert.deepEqual(validateCampus(CAMPUS), []);
  assert.deepEqual(validateReferenceRegistry(REFERENCE_REGISTRY), []);
  assert.deepEqual(validateGovernanceGuide(GOVERNANCE_GUIDE), []);

  const app = readFileSync(new URL("src/App.jsx", root), "utf8");
  assert.doesNotMatch(app, /ReferenceStubPage|FactoryOverview|WorkflowsPage|HistoryPage/);
});

test("the visible product labels Schematic as Canon-first explanatory Projection", () => {
  const shell = readFileSync(new URL("src/components/AppShell.jsx", root), "utf8");
  const foundryPage = readFileSync(new URL("src/pages/FoundryPage.jsx", root), "utf8");
  const workflowPage = readFileSync(new URL("src/pages/WorkflowPage.jsx", root), "utf8");
  const simulationSurfaces = [
    "src/components/FactoryStack.jsx",
    "src/components/RunInspector.jsx",
    "src/components/WorkflowFloorPlan.jsx",
    "src/components/WorkflowTelemetry.jsx",
    "src/pages/RunPlayer.jsx",
  ].map((path) => readFileSync(new URL(path, root), "utf8")).join("\n");

  assert.match(shell, /FND–CANON/);
  assert.doesNotMatch(shell, /FND–LIVE/);
  assert.match(foundryPage, /visual blueprint[\s\S]{0,160}?Canon[\s\S]{0,160}?intended/i);
  assert.match(workflowPage, /explanatory[\s\S]{0,120}?intended behavior/i);
  assert.doesNotMatch(simulationSurfaces, /LIVE JOB ORDER|RETURN TO LIVE|Viewing live|\? "LIVE"/i);
  assert.match(simulationSurfaces, /ACTIVE SIMULATION/);
});

test("the final QA ledger preserves desktop receipts and concept comparison", () => {
  const ledgerUrl = new URL("docs/qa/final-seven-view-ledger.md", root);
  const receiptPaths = [
    "docs/qa/final-foundry-campus.png",
    "docs/qa/final-workflow.png",
    "docs/qa/final-governance.png",
  ];

  assert.ok(existsSync(ledgerUrl), "final QA ledger is missing");
  const ledger = readFileSync(ledgerUrl, "utf8");
  for (const receipt of receiptPaths) {
    const receiptUrl = new URL(receipt, root);
    assert.ok(existsSync(receiptUrl), `${receipt} is missing`);
    assert.deepEqual(
      Array.from(readFileSync(receiptUrl).subarray(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
      `${receipt} must contain PNG bytes rather than a mislabeled browser capture`,
    );
    assert.match(ledger, new RegExp(receipt.split("/").at(-1).replace(".", "\\.")));
  }
  assert.match(ledger, /foundry-end-state-campus-concept-2026-08-10\.png/);
  assert.match(ledger, /keyboard/i);
  assert.match(ledger, /reduced motion/i);
  assert.match(ledger, /sub-minute/i);
});

test("the Runbook owns one repeatable final verification and demo path", () => {
  const runbook = readFileSync(new URL("RUNBOOK.md", root), "utf8");
  assert.match(runbook, /## Final seven-view demo/);
  assert.match(runbook, /npm run test:quality/);
  assert.match(runbook, /The Foundry.*Workflow.*Halls.*Sockets.*Modules.*Workbench.*Governance/s);
});

test("Workflow Replay restores frozen provider state instead of resetting to Projection", () => {
  let frozen = createRun(feedbackAuditScenario, 3);
  frozen = transitionRun(frozen, { type: "SET_SPEED", speed: 4 }, feedbackAuditScenario);
  for (let index = 0; index < 5; index += 1) {
    frozen = transitionRun(frozen, { type: "STEP" }, feedbackAuditScenario);
  }
  frozen = transitionRun(frozen, { type: "INJECT_TRIP" }, feedbackAuditScenario);
  const historyEntry = {
    id: frozen.id,
    scenarioId: frozen.scenarioId,
    status: frozen.status,
    stepIndex: frozen.stepIndex,
    tripCount: frozen.tripCount,
    replayOf: frozen.replayOf,
    jobOrder: frozen.jobOrder,
    trace: frozen.trace,
  };
  const currentRun = createRun(feedbackAuditScenario, 9);
  const historyBefore = structuredClone(historyEntry);
  const currentBefore = structuredClone(currentRun);

  const replayed = replayRunState({
    scenario: feedbackAuditScenario,
    currentRun,
    entry: historyEntry,
  });

  assert.ok(historyEntry.stepIndex > 0);
  assert.equal(replayed.stepIndex, historyEntry.stepIndex);
  assert.deepEqual(replayed.jobOrder, historyEntry.jobOrder);
  assert.deepEqual(replayed.trace, historyEntry.trace);
  assert.equal(replayed.speed, frozen.speed);
  assert.equal(replayed.tripCount, historyEntry.tripCount);
  assert.equal(replayed.status, "paused");
  assert.equal(replayed.replayOf, historyEntry.id);
  assert.equal(replayed.runNumber, currentRun.runNumber + 1);
  assert.notEqual(replayed.id, historyEntry.id);
  assert.equal("replayTarget" in replayed, false);
  assert.deepEqual(historyEntry, historyBefore);
  assert.deepEqual(currentRun, currentBefore);
});

test("completed Replay supports immediate Transport Replay and archived Workflow Replay", () => {
  const source = runWithStatus("completed", 3);
  const sourceEntry = archiveScenarioRun(feedbackAuditScenario, source);
  const current = createInitialScenarioSession(feedbackAuditScenario, [sourceEntry.id]);

  const replayed = replayScenarioSession(current, sourceEntry, [sourceEntry.id]);
  assert.equal(replayed.run.status, "paused");
  assert.equal(replayed.run.replayOf, sourceEntry.id);
  assert.deepEqual(replayed.run.trace, sourceEntry.trace);

  const transportReplay = replayScenarioSession(
    replayed,
    replayed.run,
    [sourceEntry.id, replayed.run.id],
  );
  assert.equal(transportReplay.run.status, "paused");
  assert.equal(transportReplay.run.replayOf, replayed.run.id);
  assert.deepEqual(transportReplay.run.trace, sourceEntry.trace);
  assert.deepEqual(transportReplay.run.jobOrder, sourceEntry.jobOrder);

  const archivedReplay = archiveScenarioRun(replayed.scenario, replayed.run);
  const workflowReplay = replayScenarioSession(
    transportReplay,
    archivedReplay,
    [sourceEntry.id, replayed.run.id, transportReplay.run.id],
    [archivedReplay, sourceEntry],
  );
  assert.equal(workflowReplay.run.status, "paused");
  assert.equal(workflowReplay.run.replayOf, archivedReplay.id);
  assert.deepEqual(workflowReplay.run.trace, sourceEntry.trace);
  assert.deepEqual(workflowReplay.run.jobOrder, sourceEntry.jobOrder);
});

test("Replay separates its paused overlay from every trusted source terminal status", () => {
  const statuses = ["idle", "running", "paused", "tripped", "completed"];

  for (const [index, status] of statuses.entries()) {
    const source = runWithStatus(status, index + 10);
    const sourceEntry = archiveScenarioRun(feedbackAuditScenario, source);
    const current = createInitialScenarioSession(feedbackAuditScenario, [sourceEntry.id]);
    const firstReplay = replayScenarioSession(current, sourceEntry, [sourceEntry.id]);
    const archivedReplay = archiveScenarioRun(firstReplay.scenario, firstReplay.run);
    const transportReplay = replayScenarioSession(
      firstReplay,
      firstReplay.run,
      [sourceEntry.id, firstReplay.run.id],
    );
    const workflowReplay = replayScenarioSession(
      transportReplay,
      archivedReplay,
      [sourceEntry.id, firstReplay.run.id, transportReplay.run.id],
      [archivedReplay, sourceEntry],
    );

    assert.equal(sourceEntry.status, status, `${status} source status`);
    assert.equal(sourceEntry.trace.at(-1).snapshot.status, status, `${status} trusted trace status`);
    assert.equal(archivedReplay.status, "paused", `${status} archived Replay overlay`);
    assert.equal(archivedReplay.replayOf, sourceEntry.id, `${status} Replay source identity`);
    assert.equal(transportReplay.run.status, "paused", `${status} Transport Replay status`);
    assert.equal(workflowReplay.run.status, "paused", `${status} Workflow Replay status`);
    assert.equal(transportReplay.run.scenarioId, source.scenarioId, `${status} Transport scenario`);
    assert.equal(workflowReplay.run.scenarioId, source.scenarioId, `${status} Workflow scenario`);
    assert.equal(transportReplay.run.jobOrder.id, source.jobOrder.id, `${status} Transport Job Order identity`);
    assert.equal(workflowReplay.run.jobOrder.id, source.jobOrder.id, `${status} Workflow Job Order identity`);
    assert.equal(transportReplay.run.tripCount, source.tripCount, `${status} Transport trip count`);
    assert.equal(workflowReplay.run.tripCount, source.tripCount, `${status} Workflow trip count`);
    assert.deepEqual(transportReplay.run.trace, source.trace, `${status} Transport trace`);
    assert.deepEqual(workflowReplay.run.trace, source.trace, `${status} Workflow trace`);
    assert.deepEqual(transportReplay.run.jobOrder, source.jobOrder, `${status} Transport Job Order`);
    assert.deepEqual(workflowReplay.run.jobOrder, source.jobOrder, `${status} Workflow Job Order`);
  }
});

test("persisted non-Replay status contradiction is still refused atomically", () => {
  const sourceEntry = structuredClone(
    archiveScenarioRun(feedbackAuditScenario, runWithStatus("idle", 3)),
  );
  sourceEntry.status = "paused";
  const current = createInitialScenarioSession(feedbackAuditScenario, [sourceEntry.id]);
  const currentBefore = structuredClone(current);
  const entryBefore = structuredClone(sourceEntry);

  assert.throws(
    () => replayScenarioSession(current, sourceEntry, [sourceEntry.id]),
    /Archived run final state contradicts its source scenario trace/,
  );
  assert.deepEqual(current, currentBefore);
  assert.deepEqual(sourceEntry, entryBefore);

  const validSource = archiveScenarioRun(feedbackAuditScenario, runWithStatus("tripped", 4));
  const firstReplay = replayScenarioSession(current, validSource, [sourceEntry.id, validSource.id]);
  const invalidOverlay = structuredClone(archiveScenarioRun(firstReplay.scenario, firstReplay.run));
  invalidOverlay.status = "completed";
  const overlayBefore = structuredClone(invalidOverlay);

  assert.throws(
    () => replayScenarioSession(
      firstReplay,
      invalidOverlay,
      [invalidOverlay.id, validSource.id],
      [invalidOverlay, validSource],
    ),
    /Archived run final state contradicts its source scenario trace/,
  );
  assert.deepEqual(invalidOverlay, overlayBefore);
});

test("provider Replay refuses Projection Agent actuality write authority without mutating session state", () => {
  const archivedSession = createInitialScenarioSession(feedbackAuditScenario);
  const invalidEntry = structuredClone(archiveScenarioRun(archivedSession.scenario, archivedSession.run));
  invalidEntry.jobOrder.worker = "Agent";
  invalidEntry.jobOrder.earnedAccess = ["actuality:write"];
  invalidEntry.trace[0].worker = "Agent";
  invalidEntry.trace[0].snapshot.jobOrder.worker = "Agent";
  invalidEntry.trace[0].snapshot.jobOrder.earnedAccess = ["actuality:write"];

  const current = createInitialScenarioSession(feedbackAuditScenario, [invalidEntry.id]);
  const currentBefore = structuredClone(current);
  const entryBefore = structuredClone(invalidEntry);
  const history = [invalidEntry];
  const historyBefore = structuredClone(history);

  assert.throws(
    () => replayScenarioSession(current, invalidEntry, history.map((entry) => entry.id)),
    /Archived run trace event 1 contradicts its source scenario authority/,
  );
  assert.deepEqual(current, currentBefore);
  assert.strictEqual(history[0], invalidEntry);
  assert.deepEqual(history, historyBefore);
  assert.deepEqual(invalidEntry, entryBefore);

  const providerSource = readFileSync(new URL("src/store/RunContext.jsx", root), "utf8");
  const replaySource = providerSource.slice(
    providerSource.indexOf("const replay ="),
    providerSource.indexOf("const clearHistory ="),
  );
  const validateAt = replaySource.indexOf("const replayed = replayScenarioSession(");
  const lineageAt = replaySource.indexOf("historyRef.current", validateAt);
  const archiveAt = replaySource.indexOf("if (!archive(run, scenario)) return;");
  const installAt = replaySource.indexOf("setSession(replayed);");
  assert.ok(
    validateAt >= 0
      && validateAt < lineageAt
      && lineageAt < archiveAt
      && archiveAt < installAt,
  );
});
