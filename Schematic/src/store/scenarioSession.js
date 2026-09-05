import { createRun, runIdForScenario, transitionRun } from "../domain/engine.js";
import {
  assertScenarioDefinition,
  freezeScenarioDefinition,
} from "../domain/scenarioLibrary.js";
import { replayCurrentRunState, replayRunState } from "./replayRun.js";
import {
  importLocalScenario,
  saveLocalScenario,
} from "./scenarioLibraryStorage.js";

function scenarioSnapshot(scenario) {
  assertScenarioDefinition(scenario);
  return freezeScenarioDefinition(structuredClone(scenario));
}

function allocateRunNumber(scenario, currentRun, occupiedRunIds = []) {
  if (!Array.isArray(occupiedRunIds)) throw new TypeError("Occupied run ids must be an array.");
  const occupied = new Set(occupiedRunIds.filter((id) => typeof id === "string"));
  if (currentRun?.id) occupied.add(currentRun.id);
  let runNumber = currentRun ? currentRun.runNumber + 1 : 1;
  while (occupied.has(runIdForScenario(scenario, runNumber))) runNumber += 1;
  return runNumber;
}

export function createInitialScenarioSession(seed, occupiedRunIds = []) {
  const scenario = scenarioSnapshot(seed);
  const runNumber = allocateRunNumber(scenario, null, occupiedRunIds);
  return Object.freeze({ scenario, run: createRun(scenario, runNumber) });
}

export function selectScenarioSession(current, selectedScenario, occupiedRunIds = []) {
  if (!current?.run) throw new TypeError("Current scenario session is required.");
  const scenario = scenarioSnapshot(selectedScenario);
  const runNumber = allocateRunNumber(scenario, current.run, occupiedRunIds);
  return Object.freeze({
    scenario,
    run: createRun(scenario, runNumber),
  });
}

export function resetScenarioSession(current, occupiedRunIds = []) {
  if (!current?.scenario || !current?.run) throw new TypeError("Current scenario session is required.");
  const runNumber = allocateRunNumber(current.scenario, current.run, occupiedRunIds);
  return Object.freeze({
    ...current,
    run: transitionRun(current.run, { type: "RESET", runNumber }, current.scenario),
  });
}

export function archiveScenarioRun(scenario, run) {
  const archivedScenario = scenarioSnapshot(scenario);
  if (!run || !Array.isArray(run.trace)) throw new TypeError("Run state is invalid.");
  if (run.scenarioId !== archivedScenario.id) {
    throw new TypeError("Archived run does not belong to its source scenario.");
  }
  return freezeScenarioDefinition(structuredClone({
    id: run.id,
    scenarioId: run.scenarioId,
    scenario: archivedScenario,
    status: run.status,
    stepIndex: run.stepIndex,
    tripCount: run.tripCount,
    replayOf: run.replayOf,
    jobOrder: run.jobOrder,
    trace: run.trace,
  }));
}

export function replayScenarioSession(current, entry, occupiedRunIds = [], lineageEntries = []) {
  if (!current?.scenario || !current?.run) throw new TypeError("Current scenario session is required.");
  if (!entry || !Array.isArray(entry.trace)) throw new TypeError("Archived run is invalid.");
  const sourceScenario = entry.scenario
    ?? (entry.scenarioId === current.scenario.id ? current.scenario : null);
  if (!sourceScenario) throw new TypeError("Archived run is missing its source scenario.");
  const scenario = scenarioSnapshot(sourceScenario);
  if (entry.scenarioId !== scenario.id) throw new TypeError("Archived run scenario identity is inconsistent.");

  const runNumber = allocateRunNumber(scenario, current.run, [...occupiedRunIds, entry.id]);
  const run = entry === current.run
    ? replayCurrentRunState({ scenario, currentRun: current.run, runNumber })
    : replayRunState({ scenario, currentRun: current.run, entry, lineageEntries, runNumber });
  const traceIsConsistent = run.trace.every((event) => (
    !event.snapshot?.jobOrder || event.snapshot.jobOrder.scenarioId === scenario.id
  ));
  if (
    run.scenarioId !== scenario.id
    || run.jobOrder.scenarioId !== scenario.id
    || run.jobOrder.id !== scenario.jobOrder.id
    || !traceIsConsistent
  ) {
    throw new TypeError("Replayed run is inconsistent with its source scenario.");
  }
  return Object.freeze({ scenario, run });
}

export function appendScenarioHistory(history, entry, maxHistory = 20) {
  if (!Array.isArray(history)) throw new TypeError("Run history must be an array.");
  if (!entry || typeof entry.id !== "string") throw new TypeError("Archived run is invalid.");
  const existing = history.find((candidate) => candidate.id === entry.id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(entry)) return history;
    throw new TypeError(`Run history identity collision: ${entry.id}.`);
  }
  return [entry, ...history].slice(0, maxHistory);
}

export function saveScenarioLibrarySession({ session, ...saveOptions }) {
  if (!session?.scenario || !session?.run) throw new TypeError("Current scenario session is required.");
  return {
    ...saveLocalScenario(saveOptions),
    session,
  };
}

export function importScenarioLibrarySession({ session, history, ...importOptions }) {
  if (!session?.scenario || !session?.run) throw new TypeError("Current scenario session is required.");
  if (!Array.isArray(history)) throw new TypeError("Run history must be an array.");
  return {
    ...importLocalScenario(importOptions),
    session,
    history,
  };
}
