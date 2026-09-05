import { validateScenarioJobOrder } from "../domain/jobOrder.js";
import { ATLAS_VIEW_LIMITS } from "../view/atlasView.js";

const EXPECTED_PLANES = Object.freeze([
  "projection",
  "intent",
  "enduring-context",
  "grounding",
  "canon",
  "actuality",
]);

const VIEW_BOOLEANS = Object.freeze([
  "showRoute",
  "showCrossings",
  "showLabels",
  "showInactive",
]);

function evaluatePlanes(planes, errors) {
  if (!Array.isArray(planes) || planes.length !== EXPECTED_PLANES.length) {
    errors.push("Simulator Atlas must define exactly six governance floors.");
    return new Set();
  }

  const planeIds = new Set();
  planes.forEach((plane, index) => {
    const expectedId = EXPECTED_PLANES[index];
    const expectedFloor = EXPECTED_PLANES.length - index;
    if (!plane || plane.id !== expectedId || plane.floor !== expectedFloor) {
      errors.push(`Governance floor ${index + 1} must be ${expectedId} on level ${expectedFloor}.`);
    }
    if (plane?.id) planeIds.add(plane.id);
  });
  if (planeIds.size !== EXPECTED_PLANES.length) errors.push("Governance floor ids must be unique.");
  return planeIds;
}

function evaluateView(view, planeIds, errors) {
  if (!view || typeof view !== "object") {
    errors.push("Atlas view state is required.");
    return;
  }

  for (const [field, limits] of Object.entries(ATLAS_VIEW_LIMITS)) {
    const value = view[field];
    if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
      errors.push(`Atlas ${field} must be between ${limits.min} and ${limits.max}.`);
    }
  }
  for (const field of VIEW_BOOLEANS) {
    if (typeof view[field] !== "boolean") errors.push(`Atlas ${field} must be a boolean.`);
  }
  if (!view.selection || !planeIds.has(view.selection.planeId)) {
    errors.push("Atlas selection must reference a declared governance floor.");
  }
}

function evaluateScenario(scenario, planeIds, errors) {
  errors.push(...validateScenarioJobOrder(scenario));
  if (!Array.isArray(scenario?.steps)) return;
  scenario.steps.forEach((step, index) => {
    if (!planeIds.has(step.planeId)) {
      errors.push(`Scenario step ${index} references undeclared governance floor ${step.planeId}.`);
    }
  });
}

function evaluateRun(run, scenario, errors) {
  if (!run || typeof run !== "object" || !run.jobOrder) {
    errors.push("Simulator run with current Job Order state is required.");
    return;
  }
  const currentStep = scenario?.steps?.[run.stepIndex];
  if (!currentStep) {
    errors.push("Simulator run step index must resolve to a scenario step.");
    return;
  }
  if (run.scenarioId !== scenario.id) errors.push("Simulator run must reference the active scenario.");
  if (run.jobOrder.id !== scenario.jobOrder?.id) errors.push("Simulator run must retain the declared Job Order id.");
  if (run.jobOrder.specId !== currentStep.specId) errors.push("Simulator current spec must match the active scenario step.");
  if (run.jobOrder.taskId !== currentStep.taskId) errors.push("Simulator current task must match the active scenario step.");
  if (run.jobOrder.planeId !== currentStep.planeId) errors.push("Simulator current floor must match the active scenario step.");
}

export function evaluateSimulatorContract({ planes, scenario, view, run } = {}) {
  const errors = [];
  const planeIds = evaluatePlanes(planes, errors);
  evaluateScenario(scenario, planeIds, errors);
  evaluateView(view, planeIds, errors);
  evaluateRun(run, scenario, errors);
  return errors;
}

export function assertSimulatorContract(contract) {
  const errors = evaluateSimulatorContract(contract);
  if (errors.length) throw new TypeError(errors.join("\n"));
  const { planes, scenario } = contract;
  return Object.freeze({
    planeCount: planes.length,
    specCount: scenario.jobOrder.specs.length,
    taskCount: scenario.jobOrder.specs.reduce((total, spec) => total + spec.tasks.length, 0),
    stepCount: scenario.steps.length,
  });
}
