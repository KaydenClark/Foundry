import { validateScenarioJobOrder } from "./jobOrder.js";
import { governancePlanes } from "./scenario.js";

export const SCENARIO_SCHEMA_VERSION = 1;

const PLANE_IDS = new Set(governancePlanes.map((plane) => plane.id));
const DIRECTIONS = new Set(["down", "up"]);
const WORKERS = new Set(["Pawn", "Agent"]);
const GATE_RESULTS = new Set(["not-entered", "clear", "issued", "complete"]);
const STRUCTURAL_CLASSES = new Set(["halls", "modules", "sockets"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value, label, errors) {
  if (typeof value !== "string" || value.trim() === "") errors.push(`${label} is required.`);
}

function stringArray(value, label, errors, { allowed = null } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${label} must be an array of strings.`);
    return;
  }
  if (allowed) {
    for (const item of value) {
      if (!allowed.has(item)) errors.push(`${label} contains unsupported value ${item}.`);
    }
  }
}

export function validateScenarioDefinition(scenario) {
  const errors = [];
  if (!isRecord(scenario)) return ["Scenario is required."];

  if (scenario.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    errors.push(`Scenario schemaVersion must be ${SCENARIO_SCHEMA_VERSION}.`);
  }
  requiredString(scenario.id, "Scenario id", errors);
  requiredString(scenario.shortId, "Scenario shortId", errors);
  requiredString(scenario.title, "Scenario title", errors);
  requiredString(scenario.summary, "Scenario summary", errors);
  requiredString(scenario.boundary, "Scenario boundary", errors);
  if (scenario.terminalResult !== undefined) {
    requiredString(scenario.terminalResult, "Scenario terminalResult", errors);
  }

  if (!Array.isArray(scenario.steps) || scenario.steps.length < 2) {
    errors.push("Scenario must define at least two steps.");
  } else {
    scenario.steps.forEach((step, index) => {
      if (!isRecord(step)) {
        errors.push(`Scenario step ${index} must be an object.`);
        return;
      }
      for (const field of ["id", "specId", "taskId", "planeId", "direction", "title", "location", "worker", "gateResult", "description"]) {
        requiredString(step[field], `Scenario step ${index} ${field}`, errors);
      }
      if (step.planeId && !PLANE_IDS.has(step.planeId)) {
        errors.push(`Scenario step ${index} references undeclared governance floor ${step.planeId}.`);
      }
      if (step.direction && !DIRECTIONS.has(step.direction)) {
        errors.push(`Scenario step ${index} direction must be down or up.`);
      }
      if (step.worker && !WORKERS.has(step.worker)) {
        errors.push(`Scenario step ${index} worker must be Pawn or Agent.`);
      }
      if (step.gateResult && !GATE_RESULTS.has(step.gateResult)) {
        errors.push(`Scenario step ${index} gateResult is unsupported.`);
      }
      stringArray(step.earnedAccess, `Scenario step ${index} earnedAccess`, errors);
      stringArray(step.evidence, `Scenario step ${index} evidence`, errors);
      if (step.structuralClasses !== undefined) {
        stringArray(step.structuralClasses, `Scenario step ${index} structuralClasses`, errors, { allowed: STRUCTURAL_CLASSES });
      }
    });
  }

  errors.push(...validateScenarioJobOrder(scenario));
  return [...new Set(errors)];
}

export function assertScenarioDefinition(scenario) {
  const errors = validateScenarioDefinition(scenario);
  if (errors.length) throw new TypeError(errors.join("\n"));
  return scenario;
}

export function freezeScenarioDefinition(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeScenarioDefinition(child);
  return Object.freeze(value);
}

export function duplicateSeedScenario(seed, existingScenarios = []) {
  assertScenarioDefinition(seed);
  if (!Array.isArray(existingScenarios)) throw new TypeError("Existing scenarios must be an array.");
  for (const scenario of existingScenarios) assertScenarioDefinition(scenario);

  const allScenarios = [seed, ...existingScenarios];
  const occupiedIds = new Set(allScenarios.map((scenario) => scenario.id));
  const occupiedShortIds = new Set(allScenarios.map((scenario) => scenario.shortId));
  const occupiedJobOrderIds = new Set(allScenarios.map((scenario) => scenario.jobOrder.id));
  let suffix = 1;
  while (
    occupiedIds.has(`${seed.id}-local-${suffix}`)
    || occupiedShortIds.has(`${seed.shortId}-LOCAL-${suffix}`)
    || occupiedJobOrderIds.has(`${seed.jobOrder.id}-LOCAL-${suffix}`)
  ) suffix += 1;

  const duplicate = structuredClone(seed);
  duplicate.id = `${seed.id}-local-${suffix}`;
  duplicate.shortId = `${seed.shortId}-LOCAL-${suffix}`;
  duplicate.title = `${seed.title} Local ${suffix}`;
  duplicate.jobOrder.id = `${seed.jobOrder.id}-LOCAL-${suffix}`;
  return duplicate;
}

export function updateScenarioDraftContent(draft, { title, stepId, stepTitle } = {}) {
  if (!isRecord(draft)) throw new TypeError("Scenario draft is required.");
  const next = structuredClone(draft);
  if (title !== undefined) next.title = title;
  if (stepTitle !== undefined) {
    const step = next.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw new RangeError(`Scenario step ${stepId} was not found.`);
    step.title = stepTitle;
    const task = next.jobOrder.specs
      .flatMap((spec) => spec.tasks)
      .find((candidate) => candidate.stepId === stepId);
    if (!task) throw new RangeError(`Scenario task for step ${stepId} was not found.`);
    task.title = stepTitle;
  }
  return next;
}
