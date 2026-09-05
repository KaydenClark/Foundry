import { getPlane } from "./scenario.js";

const STRUCTURAL_CLASSES = Object.freeze([
  Object.freeze({ id: "halls", label: "Halls", description: "Native Factory spaces" }),
  Object.freeze({ id: "modules", label: "Modules", description: "Replaceable supporting capabilities" }),
  Object.freeze({ id: "sockets", label: "Sockets", description: "Typed Module boundaries" }),
]);

function activeClassIds(step) {
  return new Set(step.structuralClasses ?? ["halls"]);
}

function activationDurations(scenario, trace) {
  const durations = new Map(STRUCTURAL_CLASSES.map((item) => [item.id, 0]));
  for (let index = 0; index < trace.length - 1; index += 1) {
    const event = trace[index];
    const next = trace[index + 1];
    const step = scenario.steps[event.stepIndex];
    if (!step) continue;
    const delta = Math.max(0, next.elapsedMs - event.elapsedMs);
    for (const id of activeClassIds(step)) durations.set(id, durations.get(id) + delta);
  }
  return durations;
}

export function formatSimulationTime(milliseconds) {
  const seconds = Math.max(0, Number(milliseconds)) / 1000;
  return `T+${seconds.toFixed(1)}s`;
}

export function deriveWorkflowHistoryPresentation(history, { replay, clearHistory }) {
  if (!Array.isArray(history)) throw new TypeError("Workflow history presentation requires an array.");
  if (typeof replay !== "function" || typeof clearHistory !== "function") {
    throw new TypeError("Workflow history presentation requires Replay and clear actions.");
  }
  return {
    canClear: history.length > 0,
    clear: clearHistory,
    entries: history.map((entry) => ({
      entry,
      id: entry.id,
      statusLabel: typeof entry.status === "string" ? entry.status.toUpperCase() : "INVALID",
      eventCount: entry.trace.length,
      tripCount: entry.tripCount,
      replay: () => replay(entry),
    })),
  };
}

export function deriveWorkflowPresentation(scenario, run, stepIndex = run?.stepIndex) {
  if (!scenario?.steps?.length) throw new TypeError("Workflow presentation requires scenario steps.");
  if (!run?.jobOrder || !Array.isArray(run.trace) || !Number.isInteger(run.stepIndex)) {
    throw new TypeError("Workflow presentation requires a valid Run and trace.");
  }

  if (!Number.isInteger(stepIndex)) {
    throw new TypeError("Workflow presentation requires an integer step index.");
  }
  const step = scenario.steps[stepIndex];
  if (!step) throw new RangeError(`Run step ${run.stepIndex} is outside the scenario.`);
  const previousStep = scenario.steps[Math.max(0, stepIndex - 1)];
  const plane = getPlane(step.planeId);
  const previousPlane = getPlane(previousStep.planeId);
  const latestEvent = run.trace.at(-1);
  const stageEvents = run.trace.filter((event) => event.stepIndex === stepIndex);
  const stageStartedAt = stageEvents[0]?.elapsedMs ?? 0;
  const elapsedMs = latestEvent?.elapsedMs ?? 0;
  const lastStageEventIndex = run.trace.findLastIndex((event) => event.stepIndex === stepIndex);
  const stageEndedAt = stepIndex === run.stepIndex
    ? elapsedMs
    : (lastStageEventIndex >= 0 ? run.trace[lastStageEventIndex + 1]?.elapsedMs ?? stageStartedAt : 0);
  const stageDurationMs = Math.max(0, stageEndedAt - stageStartedAt);
  const usesElevator = stepIndex > 0 && previousStep.planeId !== step.planeId;
  const active = activeClassIds(step);
  const durations = activationDurations(scenario, run.trace);

  return {
    step,
    plane,
    location: step.location,
    actor: step.worker,
    packet: `${step.specId} / ${step.taskId}`,
    gate: step.gateResult,
    evidence: [...step.evidence],
    elapsedMs,
    activeDurationMs: stepIndex === run.stepIndex ? stageDurationMs : 0,
    stageDurationMs,
    transition: {
      usesElevator,
      message: usesElevator
        ? `Gatehouse checked Job Order and Clearance for the elevator from Floor ${previousPlane.floor} ${previousPlane.label} to Floor ${plane.floor} ${plane.label}.`
        : `The Job Order is moving within the identical floor plan on Floor ${plane.floor}; no elevator Crossing is required.`,
    },
    activations: STRUCTURAL_CLASSES.map((item) => ({
      ...item,
      active: active.has(item.id),
      durationMs: durations.get(item.id),
    })),
  };
}
