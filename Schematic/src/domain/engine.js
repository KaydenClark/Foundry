import { assertScenarioDefinition } from "./scenarioLibrary.js";

const ALLOWED_SPEEDS = new Set([0.5, 1, 2, 4]);

function padRunNumber(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError("Run number must be a positive integer.");
  return String(number).padStart(4, "0");
}

export function runIdForScenario(scenario, runNumber) {
  if (!scenario || typeof scenario.shortId !== "string" || scenario.shortId.trim() === "") {
    throw new TypeError("Scenario shortId is required.");
  }
  return `${scenario.shortId}-${padRunNumber(runNumber)}`;
}

function cloneList(value) {
  return [...value];
}

function jobOrderFromStep(scenario, step, previous = null) {
  return {
    id: previous?.id ?? scenario.jobOrder.id,
    scenarioId: scenario.id,
    specId: step.specId,
    taskId: step.taskId,
    planeId: step.planeId,
    direction: step.direction,
    location: step.location,
    worker: step.worker,
    earnedAccess: cloneList(step.earnedAccess),
    gateResult: step.gateResult,
    evidence: cloneList(step.evidence),
    result: step.id === scenario.steps.at(-1).id
      ? (scenario.terminalResult ?? "audit-complete")
      : "pending",
    freshness: step.id === scenario.steps.at(-1).id ? "current" : "in-flight",
    projectionStatus: step.id === scenario.steps.at(-1).id ? "fresh" : "not-captured",
  };
}

function snapshot(run) {
  return {
    stepIndex: run.stepIndex,
    status: run.status,
    speed: run.speed,
    jobOrder: {
      ...run.jobOrder,
      earnedAccess: cloneList(run.jobOrder.earnedAccess),
      evidence: cloneList(run.jobOrder.evidence),
    },
  };
}

function event(run, details) {
  const sequence = run.trace.length + 1;
  return {
    id: `EVT-${String(sequence).padStart(4, "0")}`,
    sequence,
    elapsedMs: (sequence - 1) * 800,
    stepIndex: run.stepIndex,
    planeId: run.jobOrder.planeId,
    location: run.jobOrder.location,
    worker: run.jobOrder.worker,
    specId: run.jobOrder.specId,
    taskId: run.jobOrder.taskId,
    gateResult: run.jobOrder.gateResult,
    ...details,
    snapshot: snapshot(run),
  };
}

function append(run, details) {
  const next = { ...run };
  next.trace = [...run.trace];
  next.trace.push(event(next, details));
  return next;
}

export function createRun(scenario, runNumber = 1) {
  assertScenarioDefinition(scenario);
  const firstStep = scenario.steps[0];
  const run = {
    schemaVersion: 1,
    id: runIdForScenario(scenario, runNumber),
    runNumber,
    scenarioId: scenario.id,
    status: "idle",
    speed: 1,
    stepIndex: 0,
    replayOf: null,
    tripCount: 0,
    jobOrder: jobOrderFromStep(scenario, firstStep),
    trace: [],
  };

  return append(run, {
    kind: "run-created",
    message: "Run initialized on the Projection mirror.",
  });
}

function advance(run, actionType, scenario) {
  if (run.status === "completed") {
    return append(run, { kind: "transition-refused", message: "Run is complete; reset or replay to continue." });
  }

  if (run.status === "tripped") {
    const resumed = {
      ...run,
      status: "paused",
      jobOrder: { ...run.jobOrder, gateResult: "clear" },
    };
    return append(resumed, {
      kind: "trip-disposition",
      message: "Trip response recorded; the Job Order remains on the held floor.",
    });
  }

  const nextIndex = Math.min(run.stepIndex + 1, scenario.steps.length - 1);
  const nextStep = scenario.steps[nextIndex];
  const completed = nextIndex === scenario.steps.length - 1;
  const nextStatus = completed ? "completed" : actionType === "TICK" ? "running" : "paused";
  const next = {
    ...run,
    stepIndex: nextIndex,
    status: nextStatus,
    jobOrder: jobOrderFromStep(scenario, nextStep, run.jobOrder),
  };

  return append(next, {
    kind: "transition",
    stageId: nextStep.id,
    direction: nextStep.direction,
    message: nextStep.title,
  });
}

function injectTrip(run) {
  if (run.status === "completed") {
    return append(run, { kind: "transition-refused", message: "A completed run cannot accept a trip injection." });
  }
  if (run.status === "tripped") {
    return append(run, { kind: "transition-refused", message: "This Crossing is already held." });
  }

  let next = {
    ...run,
    status: "tripped",
    tripCount: run.tripCount + 1,
    jobOrder: { ...run.jobOrder, gateResult: "held" },
  };
  next = append(next, { kind: "gatehouse-signal", message: "Gatehouse signaled a candidate tripped Crossing." });
  next = append(next, { kind: "assay-check", message: "Assay checked the frozen simulator evidence." });
  next = append(next, { kind: "ward-report", message: "Ward reported the checked simulator result." });
  return next;
}

export function transitionRun(run, action, scenario) {
  assertScenarioDefinition(scenario);
  if (!run || typeof run !== "object" || !Array.isArray(run.trace)) throw new TypeError("Run state is invalid.");
  if (!action || typeof action.type !== "string") throw new TypeError("Action type is required.");

  switch (action.type) {
    case "RUN": {
      if (run.status === "completed" || run.status === "tripped") return run;
      return append({ ...run, status: "running" }, { kind: "run-control", message: "Run started." });
    }
    case "PAUSE":
      return append({ ...run, status: "paused" }, { kind: "run-control", message: "Run paused." });
    case "STEP":
    case "TICK":
      return advance(run, action.type, scenario);
    case "RESET":
      return createRun(scenario, action.runNumber ?? run.runNumber + 1);
    case "SET_SPEED": {
      const speed = Number(action.speed);
      if (!ALLOWED_SPEEDS.has(speed)) throw new RangeError("Speed must be 0.5, 1, 2, or 4.");
      return append({ ...run, speed }, { kind: "run-control", message: `Speed set to ${speed}×.` });
    }
    case "INJECT_TRIP":
      return injectTrip(run);
    default:
      throw new RangeError(`Unsupported run action: ${action.type}`);
  }
}

export function replayTrace(scenario, trace, runNumber = 1) {
  assertScenarioDefinition(scenario);
  if (!Array.isArray(trace) || trace.length === 0) throw new TypeError("Replay requires a non-empty trace.");

  let replayed = createRun(scenario, runNumber);
  for (const sourceEvent of trace.slice(1)) {
    if (!sourceEvent.snapshot?.jobOrder) continue;
    replayed = {
      ...replayed,
      stepIndex: sourceEvent.snapshot.stepIndex,
      status: sourceEvent.snapshot.status,
      speed: sourceEvent.snapshot.speed,
      jobOrder: {
        ...sourceEvent.snapshot.jobOrder,
        earnedAccess: cloneList(sourceEvent.snapshot.jobOrder.earnedAccess),
        evidence: cloneList(sourceEvent.snapshot.jobOrder.evidence),
      },
      trace: [...replayed.trace, sourceEvent],
    };
  }
  return replayed;
}
