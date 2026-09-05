import { governancePlanes } from "./scenario.js";
import { deriveWorkflowPresentation } from "./workflowPresentation.js";

const planeIndex = new Map(governancePlanes.map((plane, index) => [plane.id, index]));

function clearanceForStep(step) {
  const index = planeIndex.get(step.planeId);
  if (!Number.isInteger(index)) throw new RangeError(`Unknown Governance Plane: ${step.planeId}`);
  const read = governancePlanes.slice(0, index + 1).map((plane) => plane.label);
  const write = [governancePlanes[index].label];
  return Object.freeze({ read: Object.freeze(read), write: Object.freeze(write) });
}

function stateForStep(index, run, total) {
  if (run.status === "completed") return "complete";
  if (index < run.stepIndex) return "complete";
  if (index === Math.min(run.stepIndex, total - 1)) return "active";
  return "queued";
}

function tokenPosition(step) {
  const active = new Set(step.structuralClasses ?? ["halls"]);
  if (active.has("sockets") && active.size < 3) {
    return { x: 32, y: 46, target: "socket conduit", kind: "connection" };
  }
  if (active.size > 1) return { x: 51, y: 45, target: "workspace", kind: "structure" };
  if (active.has("modules")) return { x: 84, y: 46, target: "modules", kind: "structure" };
  return { x: 17, y: 48, target: "halls", kind: "structure" };
}

export function deriveWorkflowProofPresentation(scenario, run, focusedStepIndex = run?.stepIndex) {
  if (!scenario?.steps?.length) throw new TypeError("Workflow proof requires scenario steps.");
  if (!run?.jobOrder || run.scenarioId !== scenario.id || !Number.isInteger(run.stepIndex)) {
    throw new TypeError("Workflow proof requires a matching deterministic Run.");
  }
  if (!Number.isInteger(focusedStepIndex) || !scenario.steps[focusedStepIndex]) {
    throw new RangeError("Workflow proof focus must resolve to a scenario step.");
  }

  const presentation = deriveWorkflowPresentation(scenario, run, focusedStepIndex);
  const steps = scenario.steps.map((step, index) => ({
    id: step.id,
    index,
    title: step.title,
    description: step.description,
    worker: step.worker,
    plane: governancePlanes[planeIndex.get(step.planeId)],
    clearance: clearanceForStep(step),
    state: stateForStep(index, run, scenario.steps.length),
  }));
  const focused = steps[focusedStepIndex];
  const usesPassage = presentation.transition.usesElevator;
  const latestEvent = run.trace.at(-1);

  return Object.freeze({
    steps: Object.freeze(steps),
    current: Object.freeze({
      step: presentation.step,
      plane: presentation.plane,
      clearance: focused.clearance,
      worker: presentation.actor,
      location: presentation.location,
      gate: presentation.gate,
      evidence: Object.freeze([...presentation.evidence]),
      token: Object.freeze(tokenPosition(presentation.step)),
    }),
    receipt: Object.freeze({
      id: `PASSAGE-${String(focusedStepIndex + 1).padStart(4, "0")}`,
      stepId: presentation.step.id,
      result: usesPassage ? "RECORDED" : "NOT REQUIRED",
      message: presentation.transition.message,
    }),
    progress: Object.freeze({
      completed: run.status === "completed" ? scenario.steps.length : run.stepIndex,
      total: scenario.steps.length,
      percent: run.status === "completed" ? 100 : Math.round((run.stepIndex / Math.max(1, scenario.steps.length - 1)) * 100),
    }),
    trace: Object.freeze(run.trace.slice(-4).map((event) => Object.freeze({
      id: event.id,
      elapsedMs: event.elapsedMs,
      kind: event.kind,
      message: event.message,
      planeId: event.planeId,
    }))),
    elapsedMs: latestEvent?.elapsedMs ?? 0,
  });
}
