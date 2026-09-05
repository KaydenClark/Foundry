import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { transitionRun } from "../domain/engine.js";
import {
  duplicateSeedScenario,
  updateScenarioDraftContent,
} from "../domain/scenarioLibrary.js";
import { exportScenarioDocument } from "../domain/scenarioPortability.js";
import { feedbackAuditScenario, premadeScenarios } from "../domain/scenario.js";
import {
  loadLocalScenarioLibrary,
} from "./scenarioLibraryStorage.js";
import {
  clearStoredHistory,
  MAX_HISTORY,
  readHistory,
  writeHistory,
} from "./historyStorage.js";
import {
  appendScenarioHistory,
  archiveScenarioRun,
  createInitialScenarioSession,
  importScenarioLibrarySession,
  replayScenarioSession,
  resetScenarioSession,
  saveScenarioLibrarySession,
  selectScenarioSession,
} from "./scenarioSession.js";
import { presentScenarioImport } from "./scenarioTransfer.js";

const RunContext = createContext(null);

export function RunProvider({ children }) {
  const [initialLibrary] = useState(() => loadLocalScenarioLibrary(window.localStorage, {
    reservedScenarios: premadeScenarios,
  }));
  const [localScenarios, setLocalScenarios] = useState(initialLibrary.scenarios);
  const [scenarioDraft, setScenarioDraft] = useState(null);
  const [scenarioErrors, setScenarioErrors] = useState(initialLibrary.errors);
  const [scenarioNotice, setScenarioNotice] = useState("");
  const [history, setHistory] = useState(() => readHistory(window.localStorage));
  const historyIds = history.map((entry) => entry.id);
  const historyRef = useRef(history);
  const [session, setSession] = useState(() => createInitialScenarioSession(premadeScenarios[0], historyIds));
  const { scenario, run } = session;
  const occupiedHistoryIds = () => historyRef.current.map((entry) => entry.id);

  const archive = (candidate, sourceScenario = scenario) => {
    if (!candidate || candidate.trace.length <= 1) return true;
    try {
      const entry = archiveScenarioRun(sourceScenario, candidate);
      const next = appendScenarioHistory(historyRef.current, entry, MAX_HISTORY);
      if (next === historyRef.current) return true;
      historyRef.current = next;
      writeHistory(window.localStorage, next);
      setHistory(next);
      return true;
    } catch (error) {
      setScenarioErrors([error.message]);
      setScenarioNotice("");
      return false;
    }
  };

  useEffect(() => {
    if (run.status === "completed") archive(run, scenario);
  }, [run]);

  useEffect(() => {
    if (run.status !== "running") return undefined;
    const timer = window.setTimeout(() => {
      setSession((current) => ({
        ...current,
        run: transitionRun(current.run, { type: "TICK" }, current.scenario),
      }));
    }, 1200 / run.speed);
    return () => window.clearTimeout(timer);
  }, [run.status, run.stepIndex, run.speed, run.trace.length, scenario]);

  const dispatch = (action) => setSession((current) => ({
    ...current,
    run: transitionRun(current.run, action, current.scenario),
  }));
  const reset = () => {
    const resetSession = resetScenarioSession(session, occupiedHistoryIds());
    if (!archive(run, scenario)) return;
    setSession(resetSession);
  };
  const replay = (entry = run) => {
    try {
      const replayed = replayScenarioSession(
        session,
        entry,
        occupiedHistoryIds(),
        historyRef.current,
      );
      if (!archive(run, scenario)) return;
      setSession(replayed);
      setScenarioErrors([]);
      setScenarioNotice(`Replaying ${entry.id} against its archived scenario.`);
    } catch (error) {
      setScenarioErrors([error.message]);
      setScenarioNotice("");
    }
  };
  const clearHistory = () => {
    const cleared = clearStoredHistory(window.localStorage);
    historyRef.current = cleared;
    setHistory(cleared);
  };

  const duplicateSeed = () => {
    const draft = duplicateSeedScenario(feedbackAuditScenario, localScenarios);
    setScenarioDraft(draft);
    setScenarioErrors([]);
    setScenarioNotice(`Created local draft ${draft.id}. Save it before starting a run.`);
  };
  const editLocalScenario = (scenarioId) => {
    const local = localScenarios.find((candidate) => candidate.id === scenarioId);
    if (!local) {
      setScenarioErrors([`Local scenario ${scenarioId} was not found.`]);
      return;
    }
    setScenarioDraft(structuredClone(local));
    setScenarioErrors([]);
    setScenarioNotice(`Editing ${local.title}. Save before starting the updated scenario.`);
  };
  const updateScenarioDraft = (change) => {
    setScenarioDraft((current) => current ? updateScenarioDraftContent(current, change) : current);
    setScenarioErrors([]);
    setScenarioNotice("");
  };
  const saveScenarioDraft = () => {
    if (!scenarioDraft) {
      setScenarioErrors(["Duplicate or edit a local scenario before saving."]);
      return;
    }
    const result = saveScenarioLibrarySession({
      storage: window.localStorage,
      scenarios: localScenarios,
      candidate: scenarioDraft,
      session,
      reservedScenarios: premadeScenarios,
    });
    if (!result.ok) {
      setScenarioErrors(result.errors);
      setScenarioNotice("");
      return;
    }
    const saved = result.scenarios.find((candidate) => candidate.id === scenarioDraft.id);
    setLocalScenarios(result.scenarios);
    setScenarioDraft(structuredClone(saved));
    setScenarioErrors([]);
    setScenarioNotice(`Saved ${saved.title}. Select / Start to create a new run.`);
  };
  const selectScenario = (scenarioId) => {
    const selected = premadeScenarios.find((candidate) => candidate.id === scenarioId)
      ?? localScenarios.find((candidate) => candidate.id === scenarioId);
    if (!selected) {
      setScenarioErrors([`Scenario ${scenarioId} was not found.`]);
      return;
    }
    const selectedSession = selectScenarioSession(session, selected, occupiedHistoryIds());
    if (!archive(run, scenario)) return;
    setSession(selectedSession);
    setScenarioErrors([]);
    setScenarioNotice(`Started a new run for ${selected.title}.`);
  };
  const exportLocalScenario = (scenarioId) => {
    const local = localScenarios.find((candidate) => candidate.id === scenarioId);
    if (!local) {
      const result = { ok: false, errors: [`Local scenario ${scenarioId} was not found.`] };
      setScenarioErrors(result.errors);
      setScenarioNotice("");
      return result;
    }
    const result = exportScenarioDocument(local);
    if (!result.ok) {
      setScenarioErrors(result.errors);
      setScenarioNotice("");
      return result;
    }
    setScenarioErrors([]);
    setScenarioNotice("");
    return result;
  };
  const importLocalScenarioDocument = (documentText) => presentScenarioImport({
    transact: () => importScenarioLibrarySession({
      storage: window.localStorage,
      scenarios: localScenarios,
      documentText,
      reservedScenarios: premadeScenarios,
      session,
      history,
    }),
    refuse: (errors) => {
      setScenarioErrors(errors);
      setScenarioNotice("");
    },
    accept: (result) => {
      setLocalScenarios(result.scenarios);
      setScenarioErrors([]);
      setScenarioNotice(`Imported ${result.importedScenario.title}. Select / Start to create a new run.`);
    },
  });
  const reportScenarioTransferError = (message) => {
    setScenarioErrors([message]);
    setScenarioNotice("");
  };
  const reportScenarioTransferSuccess = (message) => {
    setScenarioErrors([]);
    setScenarioNotice(message);
  };

  const scenarios = useMemo(
    () => [...premadeScenarios, ...localScenarios],
    [localScenarios],
  );

  const value = useMemo(() => ({
    scenarios,
    premadeScenarios,
    scenario,
    localScenarios,
    scenarioDraft,
    scenarioErrors,
    scenarioNotice,
    run,
    history,
    currentStep: scenario.steps[run.stepIndex],
    progress: run.stepIndex / (scenario.steps.length - 1),
    runNow: () => dispatch({ type: "RUN" }),
    pause: () => dispatch({ type: "PAUSE" }),
    step: () => dispatch({ type: "STEP" }),
    reset,
    setSpeed: (speed) => dispatch({ type: "SET_SPEED", speed }),
    injectTrip: () => dispatch({ type: "INJECT_TRIP" }),
    replay,
    clearHistory,
    duplicateSeed,
    editLocalScenario,
    updateScenarioDraft,
    saveScenarioDraft,
    selectScenario,
    exportLocalScenario,
    importLocalScenarioDocument,
    reportScenarioTransferError,
    reportScenarioTransferSuccess,
  }), [scenarios, scenario, localScenarios, scenarioDraft, scenarioErrors, scenarioNotice, run, history]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun() {
  const context = useContext(RunContext);
  if (!context) throw new Error("useRun must be used inside RunProvider.");
  return context;
}
