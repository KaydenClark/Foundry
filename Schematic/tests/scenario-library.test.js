import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun, transitionRun } from "../src/domain/engine.js";
import {
  duplicateSeedScenario,
  updateScenarioDraftContent,
  validateScenarioDefinition,
} from "../src/domain/scenarioLibrary.js";
import { exportScenarioDocument } from "../src/domain/scenarioPortability.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import {
  LOCAL_SCENARIO_STORAGE_KEY,
  loadLocalScenarioLibrary,
  saveLocalScenario,
} from "../src/store/scenarioLibraryStorage.js";
import * as scenarioSession from "../src/store/scenarioSession.js";

const {
  appendScenarioHistory,
  archiveScenarioRun,
  createInitialScenarioSession,
  importScenarioLibrarySession,
  replayScenarioSession,
  resetScenarioSession,
  saveScenarioLibrarySession,
  selectScenarioSession,
} = scenarioSession;

function memoryStorage({ failWrites = false } = {}) {
  const values = new Map();
  let failNextWrite = false;
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failWrites || failNextWrite) {
        failNextWrite = false;
        throw new Error("quota denied");
      }
      values.set(key, value);
    },
    failNextWrite() {
      failNextWrite = true;
    },
  };
}

function complete(scenario) {
  let run = createRun(scenario, 1);
  while (run.status !== "completed") {
    run = transitionRun(run, { type: "STEP" }, scenario);
  }
  return run;
}

test("duplicate creates deterministic isolated identities and cannot mutate the seed or another copy", () => {
  const seedSnapshot = structuredClone(feedbackAuditScenario);
  const first = duplicateSeedScenario(feedbackAuditScenario, []);
  const second = duplicateSeedScenario(feedbackAuditScenario, [first]);

  assert.equal(first.id, "feedback-audit-local-1");
  assert.equal(first.shortId, "FEEDBACK-AUDIT-LOCAL-1");
  assert.equal(first.jobOrder.id, "FEEDBACK-AUDIT-JO-01-LOCAL-1");
  assert.equal(second.id, "feedback-audit-local-2");
  assert.notEqual(first.steps, feedbackAuditScenario.steps);
  assert.notEqual(first.steps[0].evidence, feedbackAuditScenario.steps[0].evidence);
  assert.ok(Object.isFrozen(feedbackAuditScenario.steps[0].evidence));

  first.title = "Edited local scenario";
  first.steps[0].evidence.push("local-only");
  first.jobOrder.specs[0].tasks[0].title = "Edited local task";

  assert.deepEqual(feedbackAuditScenario, seedSnapshot);
  assert.notEqual(second.title, first.title);
  assert.doesNotMatch(second.steps[0].evidence.join(" "), /local-only/);
  assert.notEqual(second.jobOrder.specs[0].tasks[0].title, first.jobOrder.specs[0].tasks[0].title);
});

test("duplicate skips mixed imported identities, then saves, selects, starts, and completes locally", () => {
  const storage = memoryStorage();
  const seedSnapshot = structuredClone(feedbackAuditScenario);
  const importedCandidate = structuredClone(feedbackAuditScenario);
  importedCandidate.id = "feedback-audit-local-2";
  importedCandidate.shortId = "FEEDBACK-AUDIT-LOCAL-1";
  importedCandidate.title = "Imported mixed identity scenario";
  importedCandidate.jobOrder.id = "FEEDBACK-AUDIT-JO-01-LOCAL-3";
  const encoded = exportScenarioDocument(importedCandidate);
  assert.equal(encoded.ok, true);

  const initialSession = createInitialScenarioSession(feedbackAuditScenario);
  const imported = importScenarioLibrarySession({
    storage,
    scenarios: [],
    documentText: encoded.text,
    reservedScenarios: [feedbackAuditScenario],
    session: initialSession,
    history: [],
  });
  assert.equal(imported.ok, true);
  const importedSnapshot = structuredClone(imported.scenarios[0]);
  const persistedImport = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);

  const collidingLegacyCandidate = duplicateSeedScenario(feedbackAuditScenario, []);
  const refused = saveScenarioLibrarySession({
    storage,
    scenarios: imported.scenarios,
    candidate: collidingLegacyCandidate,
    session: imported.session,
    reservedScenarios: [feedbackAuditScenario],
  });
  assert.equal(refused.ok, false);
  assert.match(refused.errors.join("\n"), /Duplicate scenario shortId: FEEDBACK-AUDIT-LOCAL-1/);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedImport);
  assert.strictEqual(refused.session, initialSession);

  const draft = duplicateSeedScenario(feedbackAuditScenario, imported.scenarios);
  assert.equal(draft.id, "feedback-audit-local-4");
  assert.equal(draft.shortId, "FEEDBACK-AUDIT-LOCAL-4");
  assert.equal(draft.jobOrder.id, "FEEDBACK-AUDIT-JO-01-LOCAL-4");

  const saved = saveScenarioLibrarySession({
    storage,
    scenarios: imported.scenarios,
    candidate: draft,
    session: imported.session,
    reservedScenarios: [feedbackAuditScenario],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.scenarios.length, 2);
  const savedDraft = saved.scenarios.find((scenario) => scenario.id === draft.id);

  let selected = selectScenarioSession(saved.session, savedDraft);
  assert.equal(selected.run.status, "idle");
  assert.equal(selected.run.scenarioId, draft.id);
  selected = {
    ...selected,
    run: transitionRun(selected.run, { type: "RUN" }, selected.scenario),
  };
  assert.equal(selected.run.status, "running");
  assert.equal(selected.run.trace.at(-1).message, "Run started.");
  while (selected.run.status !== "completed") {
    selected = {
      ...selected,
      run: transitionRun(selected.run, { type: "TICK" }, selected.scenario),
    };
  }
  assert.equal(selected.run.id, "FEEDBACK-AUDIT-LOCAL-4-0002");
  assert.equal(selected.run.jobOrder.id, draft.jobOrder.id);
  assert.equal(selected.run.trace.length, feedbackAuditScenario.steps.length + 1);
  assert.equal(selected.run.trace.at(-1).message, draft.steps.at(-1).title);
  assert.deepEqual(feedbackAuditScenario, seedSnapshot);
  assert.deepEqual(imported.scenarios[0], importedSnapshot);
});

test("duplicate refuses a malformed existing Job Order with an actionable validation error", () => {
  const malformed = structuredClone(feedbackAuditScenario);
  malformed.id = "feedback-audit-local-2";
  malformed.jobOrder = null;

  assert.throws(
    () => duplicateSeedScenario(feedbackAuditScenario, [malformed]),
    /Scenario Job Order specs must be an array/,
  );
});

test("editing one stage title keeps its Job Order task title synchronized", () => {
  const draft = duplicateSeedScenario(feedbackAuditScenario, []);
  const updated = updateScenarioDraftContent(draft, {
    title: "Local Feedback Walkthrough",
    stepId: "mirror-route",
    stepTitle: "Inspect the local mirror",
  });

  assert.equal(updated.title, "Local Feedback Walkthrough");
  assert.equal(updated.steps[0].title, "Inspect the local mirror");
  assert.equal(updated.jobOrder.specs[0].tasks[0].title, "Inspect the local mirror");
  assert.equal(draft.steps[0].title, "Read the mirror to route");
});

test("complete validation refuses malformed identities, graph links, planes, and types", () => {
  assert.deepEqual(validateScenarioDefinition(structuredClone(feedbackAuditScenario)), []);

  const invalid = structuredClone(feedbackAuditScenario);
  invalid.title = "";
  invalid.steps[1].id = invalid.steps[0].id;
  invalid.steps[2].planeId = "hidden-floor";
  invalid.steps[3].earnedAccess = "not-an-array";
  invalid.jobOrder.specs[1].id = invalid.jobOrder.specs[0].id;
  invalid.jobOrder.specs[2].tasks[1].id = invalid.jobOrder.specs[2].tasks[0].id;
  invalid.jobOrder.specs[3].tasks[0].stepId = "missing-step";
  invalid.steps[4].taskId = "SIM-TK-404";

  const errors = validateScenarioDefinition(invalid).join("\n");
  assert.match(errors, /Scenario title is required/);
  assert.match(errors, /Duplicate step id: mirror-route/);
  assert.match(errors, /undeclared governance floor hidden-floor/);
  assert.match(errors, /earnedAccess must be an array of strings/);
  assert.match(errors, /Duplicate spec id: SIM-SPEC-01/);
  assert.match(errors, /Duplicate task id: SIM-TK-05/);
  assert.match(errors, /references missing step missing-step/);
  assert.match(errors, /does not resolve/);
});

test("required scenario and Job Order identities and titles reject whitespace-only values", () => {
  const invalid = structuredClone(feedbackAuditScenario);
  invalid.id = "   ";
  invalid.shortId = "\t";
  invalid.title = "\n";
  invalid.jobOrder.id = "   ";
  invalid.jobOrder.title = "\t";
  invalid.jobOrder.specs[0].id = "   ";
  invalid.jobOrder.specs[0].title = "\n";
  invalid.jobOrder.specs[0].tasks[0].id = "\t";
  invalid.jobOrder.specs[0].tasks[0].title = "   ";

  const errors = validateScenarioDefinition(invalid).join("\n");
  assert.match(errors, /Scenario id is required/);
  assert.match(errors, /Scenario shortId is required/);
  assert.match(errors, /Scenario title is required/);
  assert.match(errors, /Scenario Job Order id is required/);
  assert.match(errors, /Scenario Job Order title is required/);
  assert.match(errors, /Job Order spec 0 id is required/);
  assert.match(errors, /Job Order spec 0 title is required/);
  assert.match(errors, /Task 0 in 0 id is required/);
  assert.match(errors, /Task 0 in 0 title is required/);
});

test("save validates before persistence and storage failure is atomic", () => {
  const storage = memoryStorage();
  const draft = duplicateSeedScenario(feedbackAuditScenario, []);
  const saved = saveLocalScenario({ storage, scenarios: [], candidate: draft });

  assert.equal(saved.ok, true);
  assert.equal(saved.scenarios.length, 1);
  assert.ok(Object.isFrozen(saved.scenarios[0]));
  assert.ok(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY));

  const loaded = loadLocalScenarioLibrary(storage);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.scenarios, saved.scenarios);

  const invalid = structuredClone(draft);
  invalid.title = "";
  const refused = saveLocalScenario({ storage, scenarios: saved.scenarios, candidate: invalid });
  assert.equal(refused.ok, false);
  assert.strictEqual(refused.scenarios, saved.scenarios);
  assert.match(refused.errors.join("\n"), /Scenario title is required/);

  const failed = saveLocalScenario({
    storage: memoryStorage({ failWrites: true }),
    scenarios: saved.scenarios,
    candidate: duplicateSeedScenario(feedbackAuditScenario, saved.scenarios),
  });
  assert.equal(failed.ok, false);
  assert.strictEqual(failed.scenarios, saved.scenarios);
  assert.match(failed.errors.join("\n"), /Could not save local scenarios: quota denied/);
});

test("validation and storage refusal preserve the same persisted bytes, selected scenario, run, and trace", () => {
  const storage = memoryStorage();
  const local = duplicateSeedScenario(feedbackAuditScenario, []);
  const saved = saveLocalScenario({ storage, scenarios: [], candidate: local });
  let session = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), local);
  session = {
    ...session,
    run: transitionRun(session.run, { type: "STEP" }, session.scenario),
  };
  const sessionSnapshot = structuredClone(session);
  const persistedBytes = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);

  const invalid = structuredClone(local);
  invalid.title = "   ";
  const refused = saveScenarioLibrarySession({
    storage,
    scenarios: saved.scenarios,
    candidate: invalid,
    session,
  });
  assert.equal(refused.ok, false);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
  assert.strictEqual(refused.session, session);
  assert.deepEqual(refused.session, sessionSnapshot);

  const nextLocal = duplicateSeedScenario(feedbackAuditScenario, saved.scenarios);
  storage.failNextWrite();
  const failed = saveScenarioLibrarySession({
    storage,
    scenarios: saved.scenarios,
    candidate: nextLocal,
    session,
  });
  assert.equal(failed.ok, false);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
  assert.strictEqual(failed.session, session);
  assert.deepEqual(failed.session, sessionSnapshot);
});

test("reload defaults to seed while exposing saved locals for explicit selection", () => {
  const storage = memoryStorage();
  const local = duplicateSeedScenario(feedbackAuditScenario, []);
  const saved = saveLocalScenario({ storage, scenarios: [], candidate: local });
  const loaded = loadLocalScenarioLibrary(storage);
  const initial = createInitialScenarioSession(feedbackAuditScenario);

  assert.equal(saved.ok, true);
  assert.equal(loaded.scenarios[0].id, local.id);
  assert.equal(initial.scenario.id, feedbackAuditScenario.id);
  assert.equal(initial.run.scenarioId, feedbackAuditScenario.id);
});

test("reload fails closed for corrupt records and save refuses seed identity collisions", () => {
  const corruptStorage = memoryStorage();
  corruptStorage.setItem(LOCAL_SCENARIO_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1,
    scenarios: [{ id: "incomplete" }],
  }));
  const corrupt = loadLocalScenarioLibrary(corruptStorage, {
    reservedScenarios: [feedbackAuditScenario],
  });
  assert.deepEqual(corrupt.scenarios, []);
  assert.match(corrupt.errors.join("\n"), /Scenario schemaVersion must be 1/);

  const collision = saveLocalScenario({
    storage: memoryStorage(),
    scenarios: [],
    candidate: structuredClone(feedbackAuditScenario),
    reservedScenarios: [feedbackAuditScenario],
  });
  assert.equal(collision.ok, false);
  assert.match(collision.errors.join("\n"), /Duplicate scenario id: feedback-audit/);
  assert.match(collision.errors.join("\n"), /Duplicate scenario shortId: FEEDBACK-AUDIT/);
  assert.match(collision.errors.join("\n"), /Duplicate Scenario Job Order id: FEEDBACK-AUDIT-JO-01/);
});

test("explicit selection starts a new isolated run that completes through the public engine", () => {
  let previousRun = createRun(feedbackAuditScenario, 4);
  previousRun = transitionRun(previousRun, { type: "STEP" }, feedbackAuditScenario);
  const previousSnapshot = structuredClone(previousRun);
  const local = updateScenarioDraftContent(
    duplicateSeedScenario(feedbackAuditScenario, []),
    { title: "Local Feedback Walkthrough", stepId: "mirror-route", stepTitle: "Inspect the local mirror" },
  );

  const selected = selectScenarioSession({ scenario: feedbackAuditScenario, run: previousRun }, local);
  assert.equal(selected.scenario.id, local.id);
  assert.equal(selected.run.id, "FEEDBACK-AUDIT-LOCAL-1-0005");
  assert.equal(selected.run.scenarioId, local.id);
  assert.equal(selected.run.stepIndex, 0);
  assert.equal(selected.run.trace.length, 1);
  assert.deepEqual(previousRun, previousSnapshot);

  const completed = complete(selected.scenario);
  assert.equal(completed.status, "completed");
  assert.equal(completed.scenarioId, local.id);
  assert.equal(completed.trace.at(-1).message, local.steps.at(-1).title);
});

test("Select Start restarts a saved revision of the already active local scenario", () => {
  const local = duplicateSeedScenario(feedbackAuditScenario, []);
  let active = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), local);
  active = {
    ...active,
    run: transitionRun(active.run, { type: "STEP" }, active.scenario),
  };
  const previousSnapshot = structuredClone(active);
  const revision = updateScenarioDraftContent(local, {
    title: "Revised active local",
    stepId: "mirror-route",
    stepTitle: "Restart the saved revision",
  });

  const restarted = selectScenarioSession(active, revision);
  assert.equal(restarted.scenario.id, active.scenario.id);
  assert.equal(restarted.scenario.title, "Revised active local");
  assert.equal(restarted.run.runNumber, active.run.runNumber + 1);
  assert.equal(restarted.run.stepIndex, 0);
  assert.equal(restarted.run.trace.length, 1);
  assert.deepEqual(active, previousSnapshot);

  const source = readFileSync(new URL("../src/components/ScenarioLibraryPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{isPremade && isActive\}/);
});

test("cross-scenario history replay atomically restores its archived scenario and internally consistent run", () => {
  const local = updateScenarioDraftContent(
    duplicateSeedScenario(feedbackAuditScenario, []),
    { title: "Archived local", stepId: "capture-intent", stepTitle: "Replay the archived local" },
  );
  let localSession = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), local);
  localSession = {
    ...localSession,
    run: transitionRun(localSession.run, { type: "STEP" }, localSession.scenario),
  };
  const archived = archiveScenarioRun(localSession.scenario, localSession.run);
  const seedSession = selectScenarioSession(localSession, feedbackAuditScenario);
  const seedSnapshot = structuredClone(seedSession);

  const replayed = replayScenarioSession(seedSession, archived);
  assert.equal(replayed.scenario.id, local.id);
  assert.equal(replayed.run.scenarioId, local.id);
  assert.equal(replayed.run.jobOrder.id, local.jobOrder.id);
  assert.equal(replayed.run.jobOrder.scenarioId, local.id);
  assert.equal(replayed.run.trace.at(-1).message, "Replay the archived local");
  assert.ok(replayed.run.trace.every((event) => event.snapshot.jobOrder.scenarioId === local.id));
  assert.equal(replayed.run.status, "paused");
  assert.equal(replayed.run.replayOf, archived.id);
  assert.equal(replayed.run.stepIndex, archived.stepIndex);
  assert.deepEqual(replayed.run.jobOrder, archived.jobOrder);
  assert.equal(replayed.run.speed, archived.trace.at(-1).snapshot.speed);
  assert.equal(replayed.run.tripCount, archived.tripCount);
  assert.deepEqual(seedSession, seedSnapshot);
  assert.ok(Object.isFrozen(archived.scenario));
});

test("persisted Replay refuses an out-of-range archived step atomically", () => {
  const storage = memoryStorage();
  const local = duplicateSeedScenario(feedbackAuditScenario, []);
  const saved = saveLocalScenario({ storage, scenarios: [], candidate: local });
  let archivedSession = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), local);
  archivedSession = {
    ...archivedSession,
    run: transitionRun(archivedSession.run, { type: "STEP" }, archivedSession.scenario),
  };
  const invalidEntry = structuredClone(archiveScenarioRun(archivedSession.scenario, archivedSession.run));
  invalidEntry.stepIndex = local.steps.length;
  invalidEntry.trace.at(-1).stepIndex = local.steps.length;
  invalidEntry.trace.at(-1).snapshot.stepIndex = local.steps.length;

  const current = createInitialScenarioSession(feedbackAuditScenario);
  const currentBefore = structuredClone(current);
  const entryBefore = structuredClone(invalidEntry);
  const history = [invalidEntry];
  const historyBefore = structuredClone(history);
  const persistedBytes = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);

  assert.throws(
    () => replayScenarioSession(current, invalidEntry, history.map((entry) => entry.id)),
    /Archived run trace event 2 stepIndex must reference its source scenario/,
  );
  assert.deepEqual(current, currentBefore);
  assert.strictEqual(history[0], invalidEntry);
  assert.deepEqual(history, historyBefore);
  assert.deepEqual(invalidEntry, entryBefore);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
  assert.equal(saved.scenarios[0].id, local.id);
});

for (const lineageCase of ["nonexistent", "self-referential", "wrong-lineage"]) {
  test(`persisted Replay refuses ${lineageCase} replayOf atomically`, () => {
    const storage = memoryStorage();
    const local = duplicateSeedScenario(feedbackAuditScenario, []);
    const saved = saveLocalScenario({ storage, scenarios: [], candidate: local });
    assert.equal(saved.ok, true);

    const sourceEntry = archiveScenarioRun(feedbackAuditScenario, createRun(feedbackAuditScenario, 3));
    const differentSource = archiveScenarioRun(
      feedbackAuditScenario,
      transitionRun(createRun(feedbackAuditScenario, 4), { type: "STEP" }, feedbackAuditScenario),
    );
    const invalidEntry = structuredClone(sourceEntry);
    invalidEntry.status = "paused";
    if (lineageCase === "nonexistent") invalidEntry.replayOf = "FORGED-NONEXISTENT";
    if (lineageCase === "self-referential") invalidEntry.replayOf = invalidEntry.id;
    if (lineageCase === "wrong-lineage") invalidEntry.replayOf = differentSource.id;

    const history = lineageCase === "wrong-lineage"
      ? [invalidEntry, differentSource]
      : [invalidEntry];
    const current = createInitialScenarioSession(feedbackAuditScenario, history.map((entry) => entry.id));
    const currentBefore = structuredClone(current);
    const historyBefore = structuredClone(history);
    const entryBefore = structuredClone(invalidEntry);
    const persistedBytes = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);

    assert.throws(
      () => replayScenarioSession(
        current,
        invalidEntry,
        history.map((entry) => entry.id),
        history,
      ),
      /Archived Replay lineage/,
    );
    assert.deepEqual(current, currentBefore);
    assert.strictEqual(history[0], invalidEntry);
    assert.deepEqual(history, historyBefore);
    assert.deepEqual(invalidEntry, entryBefore);
    assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
  });
}

test("persisted history centrally reserves distinct ids across reload, select, restart, reset, and replay", () => {
  const local = duplicateSeedScenario(feedbackAuditScenario, []);
  let seedSource = createInitialScenarioSession(feedbackAuditScenario);
  seedSource = {
    ...seedSource,
    run: transitionRun(seedSource.run, { type: "STEP" }, seedSource.scenario),
  };
  const seedEntry = archiveScenarioRun(seedSource.scenario, seedSource.run);
  let sourceSession = selectScenarioSession(seedSource, local);
  sourceSession = {
    ...sourceSession,
    run: transitionRun(sourceSession.run, { type: "STEP" }, sourceSession.scenario),
  };
  const sourceEntry = archiveScenarioRun(sourceSession.scenario, sourceSession.run);
  let history = [sourceEntry, seedEntry];
  const historyIds = () => history.map((entry) => entry.id);

  const reloaded = createInitialScenarioSession(feedbackAuditScenario, historyIds());
  assert.equal(reloaded.run.id, "FEEDBACK-AUDIT-0002");
  const directReplay = replayScenarioSession(reloaded, sourceEntry);
  assert.notEqual(directReplay.run.id, directReplay.run.replayOf);
  let selected = selectScenarioSession(reloaded, local, historyIds());
  assert.notEqual(selected.run.id, sourceEntry.id);
  selected = { ...selected, run: transitionRun(selected.run, { type: "STEP" }, selected.scenario) };
  history = appendScenarioHistory(history, archiveScenarioRun(selected.scenario, selected.run));

  const revision = updateScenarioDraftContent(local, { title: "Reserved identity revision" });
  let restarted = selectScenarioSession(selected, revision, historyIds());
  restarted = { ...restarted, run: transitionRun(restarted.run, { type: "STEP" }, restarted.scenario) };
  history = appendScenarioHistory(history, archiveScenarioRun(restarted.scenario, restarted.run));

  const reset = resetScenarioSession(restarted, historyIds());
  const replayed = replayScenarioSession(reset, sourceEntry, historyIds());
  history = appendScenarioHistory(history, archiveScenarioRun(replayed.scenario, replayed.run));

  const ids = [
    seedEntry.id,
    sourceSession.run.id,
    reloaded.run.id,
    selected.run.id,
    restarted.run.id,
    reset.run.id,
    replayed.run.id,
  ];
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    "FEEDBACK-AUDIT-0001",
    "FEEDBACK-AUDIT-LOCAL-1-0002",
    "FEEDBACK-AUDIT-0002",
    "FEEDBACK-AUDIT-LOCAL-1-0003",
    "FEEDBACK-AUDIT-LOCAL-1-0004",
    "FEEDBACK-AUDIT-LOCAL-1-0005",
    "FEEDBACK-AUDIT-LOCAL-1-0006",
  ]);
  assert.equal(replayed.run.replayOf, sourceEntry.id);
  assert.notEqual(replayed.run.id, replayed.run.replayOf);
  assert.deepEqual(history.map((entry) => [entry.id, entry.trace]), [
    ["FEEDBACK-AUDIT-LOCAL-1-0006", replayed.run.trace],
    ["FEEDBACK-AUDIT-LOCAL-1-0004", restarted.run.trace],
    ["FEEDBACK-AUDIT-LOCAL-1-0003", selected.run.trace],
    ["FEEDBACK-AUDIT-LOCAL-1-0002", sourceEntry.trace],
    ["FEEDBACK-AUDIT-0001", seedEntry.trace],
  ]);

  const providerSource = readFileSync(new URL("../src/store/RunContext.jsx", import.meta.url), "utf8");
  assert.match(providerSource, /createInitialScenarioSession\(premadeScenarios\[0\], historyIds/);
  assert.match(providerSource, /selectScenarioSession\(session, selected, occupiedHistoryIds\(\)\)/);
  assert.match(providerSource, /resetScenarioSession\(session, occupiedHistoryIds\(\)\)/);
  assert.match(
    providerSource,
    /replayScenarioSession\(\s*session,\s*entry,\s*occupiedHistoryIds\(\),\s*historyRef\.current,\s*\)/,
  );
  const replaySource = providerSource.slice(
    providerSource.indexOf("const replay ="),
    providerSource.indexOf("const clearHistory ="),
  );
  assert.ok(
    replaySource.indexOf("const replayed = replayScenarioSession(")
      < replaySource.indexOf("historyRef.current"),
    "provider must supply persisted Replay lineage",
  );
  assert.ok(
    replaySource.indexOf("historyRef.current")
      < replaySource.indexOf("if (!archive(run, scenario)) return;"),
    "provider must validate persisted Replay before archiving or installing state",
  );
});

test("history dedupe rejects a distinct session with an occupied id instead of silently dropping it", () => {
  let session = createInitialScenarioSession(feedbackAuditScenario);
  session = { ...session, run: transitionRun(session.run, { type: "STEP" }, session.scenario) };
  const entry = archiveScenarioRun(session.scenario, session.run);
  const conflicting = structuredClone(entry);
  conflicting.status = "completed";

  assert.throws(
    () => appendScenarioHistory([entry], conflicting),
    /Run history identity collision/,
  );
  assert.strictEqual(appendScenarioHistory([entry], entry)[0], entry);
});

test("Workflow preserves labeled duplicate, edit, save, select, and alert controls beside transfer UI", () => {
  const source = readFileSync(new URL("../src/components/ScenarioLibraryPanel.jsx", import.meta.url), "utf8");
  assert.match(source, /DUPLICATE SEED/);
  assert.match(source, /EDIT LOCAL/);
  assert.match(source, /SAVE LOCAL SCENARIO/);
  assert.match(source, /SELECT \/ START/);
  assert.match(source, /role="alert"/);
  assert.match(source, /htmlFor=/);
  assert.match(source, /IMPORT JSON/);
  assert.match(source, /EXPORT JSON/);
  assert.doesNotMatch(source, /FileReader/);
});
