import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkflowHistory } from "../src/components/WorkflowHistory.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import { deriveWorkflowHistoryPresentation } from "../src/domain/workflowPresentation.js";
import {
  clearStoredHistory,
  HISTORY_STORAGE_KEY,
  readHistory,
} from "../src/store/historyStorage.js";
import { LOCAL_SCENARIO_STORAGE_KEY } from "../src/store/scenarioLibraryStorage.js";
import {
  archiveScenarioRun,
  createInitialScenarioSession,
  replayScenarioSession,
} from "../src/store/scenarioSession.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function historyFixture() {
  const source = archiveScenarioRun(
    feedbackAuditScenario,
    createInitialScenarioSession(feedbackAuditScenario).run,
  );
  const missingStatus = structuredClone(source);
  missingStatus.id = "FEEDBACK-AUDIT-0101";
  delete missingStatus.status;
  const nonStringStatus = structuredClone(source);
  nonStringStatus.id = "FEEDBACK-AUDIT-0102";
  nonStringStatus.status = 2;
  const validStatus = structuredClone(source);
  validStatus.id = "FEEDBACK-AUDIT-0103";
  return { missingStatus, nonStringStatus, validStatus };
}

test("loader-admitted malformed statuses render recovery controls without rewriting history", () => {
  const { missingStatus, nonStringStatus, validStatus } = historyFixture();
  const encodedHistory = JSON.stringify([
    missingStatus,
    nonStringStatus,
    validStatus,
    { id: 7, trace: [] },
    { id: "NO-TRACE" },
  ]);
  const storage = memoryStorage({ [HISTORY_STORAGE_KEY]: encodedHistory });
  const history = readHistory(storage);
  const calls = [];
  const presentation = deriveWorkflowHistoryPresentation(history, {
    replay: (entry) => calls.push(["replay", entry]),
    clearHistory: () => calls.push(["clear"]),
  });

  assert.deepEqual(history.map((entry) => entry.id), [
    missingStatus.id,
    nonStringStatus.id,
    validStatus.id,
  ]);
  assert.deepEqual(
    presentation.entries.map((entry) => entry.statusLabel),
    ["INVALID", "INVALID", "IDLE"],
  );
  assert.equal(presentation.canClear, true);
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), encodedHistory);

  const markup = renderToStaticMarkup(createElement(WorkflowHistory, {
    history,
    replay: (entry) => calls.push(["replay", entry]),
    clearHistory: () => calls.push(["clear"]),
  }));
  assert.match(markup, /INVALID/);
  assert.match(markup, /IDLE/);
  assert.match(markup, /CLEAR HISTORY/);
  assert.equal((markup.match(/REPLAY/g) ?? []).length, 3);

  presentation.entries[0].replay();
  presentation.clear();
  assert.strictEqual(calls[0][1], history[0]);
  assert.deepEqual(calls.map(([action]) => action), ["replay", "clear"]);
});

test("malformed Replay visibly refuses atomically and Clear History remains usable", () => {
  const { missingStatus } = historyFixture();
  const encodedHistory = JSON.stringify([missingStatus]);
  const encodedLibrary = JSON.stringify([{ id: "public-local-fixture" }]);
  const storage = memoryStorage({
    [HISTORY_STORAGE_KEY]: encodedHistory,
    [LOCAL_SCENARIO_STORAGE_KEY]: encodedLibrary,
  });
  let history = readHistory(storage);
  const historyBefore = structuredClone(history);
  let session = createInitialScenarioSession(
    feedbackAuditScenario,
    history.map((entry) => entry.id),
  );
  const sessionBefore = structuredClone(session);
  let visibleAlert = "";

  const presentation = deriveWorkflowHistoryPresentation(history, {
    replay: (entry) => {
      try {
        session = replayScenarioSession(
          session,
          entry,
          history.map((candidate) => candidate.id),
          history,
        );
      } catch (error) {
        visibleAlert = error.message;
      }
    },
    clearHistory: () => {
      history = clearStoredHistory(storage);
    },
  });

  presentation.entries[0].replay();
  assert.match(visibleAlert, /Archived run final state contradicts its source scenario trace/);
  assert.deepEqual(session, sessionBefore);
  assert.deepEqual(history, historyBefore);
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), encodedHistory);
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), encodedLibrary);

  presentation.clear();
  assert.deepEqual(history, []);
  assert.equal(storage.getItem(HISTORY_STORAGE_KEY), "[]");
  assert.equal(storage.getItem(LOCAL_SCENARIO_STORAGE_KEY), encodedLibrary);
  assert.deepEqual(session, sessionBefore);
});

test("every valid Workflow history status keeps its existing uppercase label", () => {
  const statuses = ["idle", "running", "paused", "tripped", "completed"];
  const presentation = deriveWorkflowHistoryPresentation(
    statuses.map((status, index) => ({ id: `RUN-${index}`, status, trace: [] })),
    { replay() {}, clearHistory() {} },
  );

  assert.deepEqual(
    presentation.entries.map((entry) => entry.statusLabel),
    ["IDLE", "RUNNING", "PAUSED", "TRIPPED", "COMPLETED"],
  );
});
