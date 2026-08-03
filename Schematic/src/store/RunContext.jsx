import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { createRun, replayTrace, transitionRun } from "../domain/engine.js";
import { feedbackAuditScenario } from "../domain/scenario.js";

const STORAGE_KEY = "foundry-schematic.history.v1";
const MAX_HISTORY = 20;
const RunContext = createContext(null);

function readHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.id === "string" && Array.isArray(entry.trace)).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function writeHistory(history) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // History is a convenience projection. A storage failure must not affect the run.
  }
}

function archiveEntry(run) {
  return {
    id: run.id,
    scenarioId: run.scenarioId,
    status: run.status,
    stepIndex: run.stepIndex,
    tripCount: run.tripCount,
    replayOf: run.replayOf,
    jobOrder: run.jobOrder,
    trace: run.trace,
  };
}

export function RunProvider({ children }) {
  const scenario = feedbackAuditScenario;
  const [run, setRun] = useState(() => createRun(scenario, 1));
  const [history, setHistory] = useState(readHistory);
  const archivedRef = useRef(new Set(history.map((entry) => entry.id)));

  const archive = (candidate) => {
    if (!candidate || archivedRef.current.has(candidate.id) || candidate.trace.length <= 1) return;
    archivedRef.current.add(candidate.id);
    setHistory((current) => {
      const next = [archiveEntry(candidate), ...current].slice(0, MAX_HISTORY);
      writeHistory(next);
      return next;
    });
  };

  useEffect(() => {
    if (run.status === "completed") archive(run);
  }, [run]);

  useEffect(() => {
    if (run.status !== "running") return undefined;
    const timer = window.setTimeout(() => {
      setRun((current) => transitionRun(current, { type: "TICK" }, scenario));
    }, 1200 / run.speed);
    return () => window.clearTimeout(timer);
  }, [run.status, run.stepIndex, run.speed, run.trace.length, scenario]);

  const dispatch = (action) => setRun((current) => transitionRun(current, action, scenario));
  const reset = () => {
    archive(run);
    setRun((current) => transitionRun(current, { type: "RESET", runNumber: current.runNumber + 1 }, scenario));
  };
  const replay = (entry = run) => {
    archive(run);
    const sourceTrace = entry.trace;
    const reconstructed = replayTrace(scenario, sourceTrace, run.runNumber + 1);
    const fresh = createRun(scenario, run.runNumber + 1);
    setRun({ ...fresh, status: "paused", replayOf: entry.id, replayTarget: reconstructed.stepIndex });
  };
  const clearHistory = () => {
    archivedRef.current.clear();
    setHistory([]);
    writeHistory([]);
  };

  const value = useMemo(() => ({
    scenario,
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
  }), [run, history, scenario]);

  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRun() {
  const context = useContext(RunContext);
  if (!context) throw new Error("useRun must be used inside RunProvider.");
  return context;
}
