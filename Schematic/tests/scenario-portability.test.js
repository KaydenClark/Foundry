import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { transitionRun } from "../src/domain/engine.js";
import {
  PORTABLE_SCENARIO_FORMAT_VERSION,
  PORTABLE_SCENARIO_KIND,
  exportScenarioDocument,
  importScenarioDocument,
} from "../src/domain/scenarioPortability.js";
import {
  duplicateSeedScenario,
  updateScenarioDraftContent,
} from "../src/domain/scenarioLibrary.js";
import {
  feedbackAuditScenario,
  jobOrderFlightScenario,
} from "../src/domain/scenario.js";
import {
  LOCAL_SCENARIO_STORAGE_KEY,
  loadLocalScenarioLibrary,
  saveLocalScenario,
} from "../src/store/scenarioLibraryStorage.js";
import {
  archiveScenarioRun,
  createInitialScenarioSession,
  importScenarioLibrarySession,
  selectScenarioSession,
} from "../src/store/scenarioSession.js";
import {
  downloadScenarioFile,
  performScenarioDownload,
  presentScenarioImport,
  uploadScenarioFile,
} from "../src/store/scenarioTransfer.js";

function memoryStorage() {
  const values = new Map();
  let failNextWrite = false;
  let writes = 0;
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error("quota denied");
      }
      writes += 1;
      values.set(key, value);
    },
    failNextWrite() {
      failNextWrite = true;
    },
    writeCount() {
      return writes;
    },
  };
}

function localScenario() {
  return updateScenarioDraftContent(
    duplicateSeedScenario(feedbackAuditScenario, []),
    {
      title: "Portable Feedback Walkthrough",
      stepId: "mirror-route",
      stepTitle: "Read the portable mirror",
    },
  );
}

test("export emits one deterministic versioned public-safe scenario document", () => {
  const scenario = localScenario();
  const source = {
    ...structuredClone(scenario),
    run: { id: "PRIVATE-RUN" },
    history: [{ id: "PRIVATE-HISTORY" }],
    receipts: ["PRIVATE-RECEIPT"],
    provider: { name: "PRIVATE-PROVIDER" },
    privateState: { label: "PRIVATE-STATE" },
  };

  const first = exportScenarioDocument(source);
  const second = exportScenarioDocument(source);

  assert.equal(first.ok, true);
  assert.equal(first.filename, "feedback-audit-local-1.foundry-schematic.v1.json");
  assert.equal(first.mimeType, "application/json");
  assert.equal(first.text, second.text);
  assert.ok(first.text.endsWith("\n"));

  const document = JSON.parse(first.text);
  assert.deepEqual(Object.keys(document), ["kind", "formatVersion", "scenario"]);
  assert.equal(document.kind, PORTABLE_SCENARIO_KIND);
  assert.equal(document.formatVersion, PORTABLE_SCENARIO_FORMAT_VERSION);
  assert.deepEqual(document.scenario, scenario);
  for (const excluded of ["run", "history", "receipts", "provider", "privateState"]) {
    assert.equal(excluded in document.scenario, false);
  }
  assert.doesNotMatch(first.text, /PRIVATE-(?:RUN|HISTORY|RECEIPT|PROVIDER|STATE)/);

  const invalid = structuredClone(scenario);
  invalid.steps[0] = null;
  const refused = exportScenarioDocument(invalid);
  assert.equal(refused.ok, false);
  assert.equal(refused.text, null);
  assert.match(refused.errors.join("\n"), /Scenario step 0 must be an object/);
});

test("import validates syntax, version, public shape, and the complete scenario graph before returning a candidate", () => {
  const scenario = localScenario();
  const encoded = exportScenarioDocument(scenario);
  const accepted = importScenarioDocument(encoded.text);

  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.scenario, scenario);
  for (const value of [
    accepted.scenario,
    accepted.scenario.jobOrder,
    accepted.scenario.jobOrder.specs,
    accepted.scenario.jobOrder.specs[0],
    accepted.scenario.jobOrder.specs[0].tasks,
    accepted.scenario.jobOrder.specs[0].tasks[0],
    accepted.scenario.steps,
    accepted.scenario.steps[0],
    accepted.scenario.steps[0].evidence,
  ]) {
    assert.ok(Object.isFrozen(value));
  }

  const wrongKind = JSON.stringify({ kind: "other-scenario", formatVersion: 1, scenario });
  const wrongVersion = JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 2, scenario });
  const missingTitle = structuredClone(scenario);
  missingTitle.title = "";
  const duplicateStep = structuredClone(scenario);
  duplicateStep.steps[1].id = duplicateStep.steps[0].id;
  const danglingTask = structuredClone(scenario);
  danglingTask.jobOrder.specs[0].tasks[0].stepId = "missing-step";
  const runtimeState = {
    kind: PORTABLE_SCENARIO_KIND,
    formatVersion: 1,
    scenario: { ...structuredClone(scenario), history: [] },
  };
  const nestedUnknownFields = [
    ["Scenario Job Order", (candidate) => { candidate.jobOrder.privateProvider = "hidden"; }],
    ["Job Order spec 0", (candidate) => { candidate.jobOrder.specs[0].receipt = "hidden"; }],
    ["Task 0 in 0", (candidate) => { candidate.jobOrder.specs[0].tasks[0].runtime = "hidden"; }],
    ["Scenario step 0", (candidate) => { candidate.steps[0].providerState = "hidden"; }],
  ];

  const cases = [
    ["{", /Portable scenario JSON is malformed/],
    [JSON.stringify({ formatVersion: 1, scenario }), /Portable scenario kind must be/],
    [JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, scenario }), /Portable scenario formatVersion must be/],
    [JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1 }), /Scenario is required/],
    [wrongKind, /Portable scenario kind must be foundry-schematic-scenario/],
    [wrongVersion, /Portable scenario formatVersion must be 1/],
    [JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: missingTitle }), /Scenario title is required/],
    [JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: duplicateStep }), /Duplicate step id/],
    [JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: danglingTask }), /references missing step/],
    [JSON.stringify(runtimeState), /Scenario contains unsupported field history/],
  ];

  for (const [label, mutate] of nestedUnknownFields) {
    const candidate = structuredClone(scenario);
    mutate(candidate);
    cases.push([
      JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: candidate }),
      new RegExp(`${label} contains unsupported field`),
    ]);
  }

  for (const [text, expected] of cases) {
    const result = importScenarioDocument(text);
    assert.equal(result.ok, false);
    assert.equal(result.scenario, null);
    assert.match(result.errors.join("\n"), expected);
  }
});

test("portable v1 preserves the optional terminal result and refuses malformed values", () => {
  const encoded = exportScenarioDocument(jobOrderFlightScenario);
  assert.equal(encoded.ok, true);

  const accepted = importScenarioDocument(encoded.text);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.scenario.terminalResult, "closed-complete");
  assert.deepEqual(accepted.scenario, jobOrderFlightScenario);

  for (const malformed of [null, "", 42, [], {}]) {
    const scenario = structuredClone(jobOrderFlightScenario);
    scenario.terminalResult = malformed;
    const result = importScenarioDocument(JSON.stringify({
      kind: PORTABLE_SCENARIO_KIND,
      formatVersion: 1,
      scenario,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.scenario, null);
    assert.match(result.errors.join("\n"), /Scenario terminalResult is required/);
  }
});

test("import inserts only after validation and persistence without selecting, starting, archiving, or mutating provider state", () => {
  const storage = memoryStorage();
  const firstLocal = localScenario();
  const saved = saveLocalScenario({
    storage,
    scenarios: [],
    candidate: firstLocal,
    reservedScenarios: [feedbackAuditScenario],
  });
  let session = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), firstLocal);
  session = {
    ...session,
    run: transitionRun(session.run, { type: "STEP" }, session.scenario),
  };
  const history = [archiveScenarioRun(session.scenario, session.run)];
  const sessionSnapshot = structuredClone(session);
  const historySnapshot = structuredClone(history);
  const traceReference = session.run.trace;

  const secondLocal = duplicateSeedScenario(feedbackAuditScenario, saved.scenarios);
  secondLocal.title = "Imported Portable Scenario";
  const encoded = exportScenarioDocument(secondLocal);
  const writesBeforeImport = storage.writeCount();
  const imported = importScenarioLibrarySession({
    storage,
    scenarios: saved.scenarios,
    documentText: encoded.text,
    reservedScenarios: [feedbackAuditScenario],
    session,
    history,
  });

  assert.equal(imported.ok, true);
  assert.equal(storage.writeCount() - writesBeforeImport, 1);
  assert.equal(imported.importedScenario.id, secondLocal.id);
  assert.equal(imported.scenarios.length, 2);
  assert.strictEqual(imported.session, session);
  assert.strictEqual(imported.history, history);
  assert.strictEqual(imported.session.run.trace, traceReference);
  assert.deepEqual(imported.session, sessionSnapshot);
  assert.deepEqual(imported.history, historySnapshot);
  assert.equal(imported.session.scenario.id, firstLocal.id);
  assert.equal(imported.session.run.stepIndex, 1);
  assert.deepEqual(loadLocalScenarioLibrary(storage, {
    reservedScenarios: [feedbackAuditScenario],
  }).scenarios, imported.scenarios);

  const started = selectScenarioSession(
    imported.session,
    imported.importedScenario,
    imported.history.map((entry) => entry.id),
  );
  assert.equal(started.scenario.id, secondLocal.id);
  assert.equal(started.run.stepIndex, 0);
  assert.equal(started.run.trace.length, 1);
  assert.notEqual(started.run.id, imported.session.run.id);
  assert.deepEqual(imported.session, sessionSnapshot);

  let completed = started.run;
  while (completed.status !== "completed") {
    completed = transitionRun(completed, { type: "STEP" }, started.scenario);
  }
  assert.equal(completed.scenarioId, secondLocal.id);
  assert.equal(completed.trace.at(-1).message, secondLocal.steps.at(-1).title);
});

test("every refused import preserves exact persisted bytes and the same library, selected session, run, trace, and history references", () => {
  const storage = memoryStorage();
  const firstLocal = localScenario();
  const saved = saveLocalScenario({
    storage,
    scenarios: [],
    candidate: firstLocal,
    reservedScenarios: [feedbackAuditScenario],
  });
  let session = selectScenarioSession(createInitialScenarioSession(feedbackAuditScenario), firstLocal);
  session = {
    ...session,
    run: transitionRun(session.run, { type: "STEP" }, session.scenario),
  };
  const history = [archiveScenarioRun(session.scenario, session.run)];
  const persistedBytes = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);
  const runReference = session.run;
  const traceReference = session.run.trace;

  const wrongVersion = JSON.stringify({
    kind: PORTABLE_SCENARIO_KIND,
    formatVersion: 2,
    scenario: firstLocal,
  });
  const missingTitle = structuredClone(firstLocal);
  missingTitle.title = "";
  const duplicateStep = structuredClone(firstLocal);
  duplicateStep.steps[1].id = duplicateStep.steps[0].id;
  const danglingTask = structuredClone(firstLocal);
  danglingTask.jobOrder.specs[0].tasks[0].stepId = "missing-step";
  const collisionDocuments = [];
  for (const occupied of [feedbackAuditScenario, firstLocal]) {
    for (const [field, mutate] of [
      ["scenario id", (candidate) => { candidate.id = occupied.id; }],
      ["scenario shortId", (candidate) => { candidate.shortId = occupied.shortId; }],
      ["Scenario Job Order id", (candidate) => { candidate.jobOrder.id = occupied.jobOrder.id; }],
    ]) {
      const candidate = duplicateSeedScenario(feedbackAuditScenario, [firstLocal, ...collisionDocuments.map(({ scenario }) => scenario)]);
      mutate(candidate);
      collisionDocuments.push({
        text: exportScenarioDocument(candidate).text,
        expected: new RegExp(`Duplicate ${field}`),
        scenario: candidate,
      });
    }
  }

  const refusedDocuments = [
    "{",
    wrongVersion,
    JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: missingTitle }),
    JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: duplicateStep }),
    JSON.stringify({ kind: PORTABLE_SCENARIO_KIND, formatVersion: 1, scenario: danglingTask }),
    ...collisionDocuments.map(({ text }) => text),
  ];

  for (const [index, documentText] of refusedDocuments.entries()) {
    const writesBefore = storage.writeCount();
    const refused = importScenarioLibrarySession({
      storage,
      scenarios: saved.scenarios,
      documentText,
      reservedScenarios: [feedbackAuditScenario],
      session,
      history,
    });
    assert.equal(refused.ok, false);
    if (index >= refusedDocuments.length - collisionDocuments.length) {
      assert.match(refused.errors.join("\n"), collisionDocuments[index - (refusedDocuments.length - collisionDocuments.length)].expected);
    }
    assert.equal(storage.writeCount(), writesBefore);
    assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
    assert.strictEqual(refused.scenarios, saved.scenarios);
    assert.strictEqual(refused.session, session);
    assert.strictEqual(refused.session.run, runReference);
    assert.strictEqual(refused.session.run.trace, traceReference);
    assert.strictEqual(refused.history, history);
  }

  const validSecond = duplicateSeedScenario(feedbackAuditScenario, saved.scenarios);
  storage.failNextWrite();
  const writesBeforeFailure = storage.writeCount();
  const failedWrite = importScenarioLibrarySession({
    storage,
    scenarios: saved.scenarios,
    documentText: exportScenarioDocument(validSecond).text,
    reservedScenarios: [feedbackAuditScenario],
    session,
    history,
  });
  assert.equal(failedWrite.ok, false);
  assert.equal(storage.writeCount(), writesBeforeFailure);
  assert.match(failedWrite.errors.join("\n"), /Could not import local scenario: quota denied/);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), persistedBytes);
  assert.strictEqual(failedWrite.scenarios, saved.scenarios);
  assert.strictEqual(failedWrite.session, session);
  assert.strictEqual(failedWrite.history, history);
});

test("download emits exact bytes and filename, clicks once, and defers anchor removal and Blob URL revocation", () => {
  const prepared = exportScenarioDocument(localScenario());
  const calls = [];
  const deferred = [];
  let capturedBlob;
  const anchor = {
    click() { calls.push("click"); },
    remove() { calls.push("remove"); },
  };

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
      capturedBlob = this;
    }
  }

  downloadScenarioFile(prepared, {
    BlobCtor: FakeBlob,
    createObjectURL(blob) {
      calls.push(["create", blob]);
      return "blob:scenario";
    },
    revokeObjectURL(url) { calls.push(["revoke", url]); },
    createAnchor() { return anchor; },
    appendAnchor(link) { calls.push(["append", link]); },
    defer(callback) { deferred.push(callback); },
  });

  assert.deepEqual(capturedBlob.parts, [prepared.text]);
  assert.equal(capturedBlob.type, prepared.mimeType);
  assert.equal(anchor.href, "blob:scenario");
  assert.equal(anchor.download, prepared.filename);
  assert.deepEqual(calls, [["create", capturedBlob], ["append", anchor], "click"]);
  assert.equal(deferred.length, 1);

  deferred[0]();
  assert.deepEqual(calls.slice(-2), ["remove", ["revoke", "blob:scenario"]]);
});

test("download success is reported only after the helper completes and synchronous failure is visible", () => {
  const events = [];
  const prepared = exportScenarioDocument(localScenario());
  const success = performScenarioDownload({
    scenarioId: prepared.scenarioId,
    prepare: () => prepared,
    download(result) {
      assert.strictEqual(result, prepared);
      events.push("download");
    },
    reportSuccess(message) { events.push(["success", message]); },
    reportError(message) { events.push(["error", message]); },
  });
  assert.equal(success.ok, true);
  assert.deepEqual(events, ["download", ["success", `Downloaded ${prepared.filename}.`]]);

  events.length = 0;
  const refused = performScenarioDownload({
    scenarioId: "feedback-audit-local-1",
    prepare: () => prepared,
    download() { throw new Error("click refused"); },
    reportSuccess(message) { events.push(["success", message]); },
    reportError(message) { events.push(["error", message]); },
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(events, [["error", "Could not download local scenario: click refused"]]);
});

test("upload resets the native input after success or read rejection and permits retrying the same file", async () => {
  const file = { name: "scenario.json" };
  const input = { files: [file], value: "/fake/scenario.json" };
  const reads = [];
  const imports = [];
  const errors = [];
  const readFile = async (candidate) => {
    reads.push(candidate);
    return "portable bytes";
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    input.value = "/fake/scenario.json";
    const result = await uploadScenarioFile({
      input,
      readFile,
      importDocument(text) {
        imports.push(text);
        return { ok: true };
      },
      reportError(message) { errors.push(message); },
    });
    assert.equal(result.ok, true);
    assert.equal(input.value, "");
  }
  assert.deepEqual(reads, [file, file]);
  assert.deepEqual(imports, ["portable bytes", "portable bytes"]);
  assert.deepEqual(errors, []);

  input.value = "/fake/scenario.json";
  const rejected = await uploadScenarioFile({
    input,
    readFile: async () => { throw new Error("reader denied"); },
    importDocument() { throw new Error("must not import unread bytes"); },
    reportError(message) { errors.push(message); },
  });
  assert.equal(rejected.ok, false);
  assert.equal(input.value, "");
  assert.equal(errors.at(-1), "Could not read scenario file: reader denied");
});

test("provider import presentation exposes an alert on refusal and status only after a successful atomic transaction", () => {
  const events = [];
  const refusal = { ok: false, errors: ["Duplicate scenario id: local-1."] };
  const refused = presentScenarioImport({
    transact: () => refusal,
    accept(result) { events.push(["accepted", result]); },
    refuse(errors) { events.push(["alert", errors]); },
  });
  assert.strictEqual(refused, refusal);
  assert.deepEqual(events, [["alert", refusal.errors]]);

  events.length = 0;
  const accepted = { ok: true, importedScenario: { title: "Portable local" }, scenarios: [] };
  const result = presentScenarioImport({
    transact: () => accepted,
    accept(value) { events.push(["status", value]); },
    refuse(errors) { events.push(["alert", errors]); },
  });
  assert.strictEqual(result, accepted);
  assert.deepEqual(events, [["status", accepted]]);
});

test("Workflow exposes semantic labeled local-only JSON controls", () => {
  const panelSource = readFileSync(new URL("../src/components/ScenarioLibraryPanel.jsx", import.meta.url), "utf8");
  const providerSource = readFileSync(new URL("../src/store/RunContext.jsx", import.meta.url), "utf8");

  assert.match(panelSource, /EXPORT JSON/);
  assert.match(panelSource, /IMPORT JSON/);
  assert.match(panelSource, /type="file"/);
  assert.match(panelSource, /accept="\.json,application\/json"/);
  assert.match(panelSource, /htmlFor="scenario-import-file"/);
  assert.doesNotMatch(panelSource, /\bfetch\b|XMLHttpRequest|WebSocket/);

  assert.match(providerSource, /exportScenarioDocument/);
  assert.match(providerSource, /importScenarioLibrarySession/);
  assert.match(providerSource, /Imported \$\{result\.importedScenario\.title\}\. Select \/ Start to create a new run\./);
  assert.match(providerSource, /presentScenarioImport/);
});
