import {
  freezeScenarioDefinition,
  validateScenarioDefinition,
} from "./scenarioLibrary.js";

export const PORTABLE_SCENARIO_KIND = "foundry-schematic-scenario";
export const PORTABLE_SCENARIO_FORMAT_VERSION = 1;

const DOCUMENT_FIELDS = new Set(["kind", "formatVersion", "scenario"]);
const SCENARIO_FIELDS = new Set([
  "schemaVersion",
  "id",
  "shortId",
  "title",
  "summary",
  "boundary",
  "terminalResult",
  "jobOrder",
  "steps",
]);
const JOB_ORDER_FIELDS = new Set(["id", "title", "specs"]);
const SPEC_FIELDS = new Set(["id", "title", "tasks"]);
const TASK_FIELDS = new Set(["id", "stepId", "title"]);
const STEP_FIELDS = new Set([
  "id",
  "structuralClasses",
  "specId",
  "taskId",
  "planeId",
  "direction",
  "title",
  "location",
  "worker",
  "earnedAccess",
  "gateResult",
  "evidence",
  "description",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unexpectedFields(value, allowed, label, errors) {
  if (!isRecord(value)) return;
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) errors.push(`${label} contains unsupported field ${field}.`);
  }
}

function portableShapeErrors(document) {
  const errors = [];
  unexpectedFields(document, DOCUMENT_FIELDS, "Portable scenario document", errors);
  if (!isRecord(document?.scenario)) return errors;

  const { scenario } = document;
  unexpectedFields(scenario, SCENARIO_FIELDS, "Scenario", errors);
  unexpectedFields(scenario.jobOrder, JOB_ORDER_FIELDS, "Scenario Job Order", errors);
  if (Array.isArray(scenario.jobOrder?.specs)) {
    scenario.jobOrder.specs.forEach((spec, specIndex) => {
      unexpectedFields(spec, SPEC_FIELDS, `Job Order spec ${specIndex}`, errors);
      if (Array.isArray(spec?.tasks)) {
        spec.tasks.forEach((task, taskIndex) => {
          unexpectedFields(task, TASK_FIELDS, `Task ${taskIndex} in ${specIndex}`, errors);
        });
      }
    });
  }
  if (Array.isArray(scenario.steps)) {
    scenario.steps.forEach((step, stepIndex) => {
      unexpectedFields(step, STEP_FIELDS, `Scenario step ${stepIndex}`, errors);
    });
  }
  return errors;
}

function publicScenarioSnapshot(scenario) {
  return {
    schemaVersion: scenario.schemaVersion,
    id: scenario.id,
    shortId: scenario.shortId,
    title: scenario.title,
    summary: scenario.summary,
    boundary: scenario.boundary,
    ...(scenario.terminalResult === undefined ? {} : { terminalResult: scenario.terminalResult }),
    jobOrder: {
      id: scenario.jobOrder?.id,
      title: scenario.jobOrder?.title,
      specs: scenario.jobOrder?.specs?.map((spec) => ({
        id: spec.id,
        title: spec.title,
        tasks: spec.tasks?.map((task) => ({
          id: task.id,
          stepId: task.stepId,
          title: task.title,
        })),
      })),
    },
    steps: scenario.steps?.map((step) => ({
      id: step.id,
      ...(step.structuralClasses === undefined ? {} : { structuralClasses: [...step.structuralClasses] }),
      specId: step.specId,
      taskId: step.taskId,
      planeId: step.planeId,
      direction: step.direction,
      title: step.title,
      location: step.location,
      worker: step.worker,
      earnedAccess: Array.isArray(step.earnedAccess) ? [...step.earnedAccess] : step.earnedAccess,
      gateResult: step.gateResult,
      evidence: Array.isArray(step.evidence) ? [...step.evidence] : step.evidence,
      description: step.description,
    })),
  };
}

function filenameForScenario(scenarioId) {
  const safeId = String(scenarioId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeId || "scenario"}.foundry-schematic.v${PORTABLE_SCENARIO_FORMAT_VERSION}.json`;
}

export function exportScenarioDocument(scenario) {
  const sourceErrors = validateScenarioDefinition(scenario);
  if (sourceErrors.length) {
    return { ok: false, filename: null, mimeType: null, text: null, errors: sourceErrors };
  }
  const candidate = publicScenarioSnapshot(scenario ?? {});
  const errors = validateScenarioDefinition(candidate);
  if (errors.length) return { ok: false, filename: null, mimeType: null, text: null, errors };

  return {
    ok: true,
    filename: filenameForScenario(candidate.id),
    mimeType: "application/json",
    text: `${JSON.stringify({
      kind: PORTABLE_SCENARIO_KIND,
      formatVersion: PORTABLE_SCENARIO_FORMAT_VERSION,
      scenario: candidate,
    }, null, 2)}\n`,
    errors: [],
  };
}

export function importScenarioDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      scenario: null,
      errors: [`Portable scenario JSON is malformed: ${error.message}`],
    };
  }

  if (!isRecord(document)) {
    return { ok: false, scenario: null, errors: ["Portable scenario document must be an object."] };
  }

  const errors = portableShapeErrors(document);
  if (document.kind !== PORTABLE_SCENARIO_KIND) {
    errors.unshift(`Portable scenario kind must be ${PORTABLE_SCENARIO_KIND}.`);
  }
  if (document.formatVersion !== PORTABLE_SCENARIO_FORMAT_VERSION) {
    errors.unshift(`Portable scenario formatVersion must be ${PORTABLE_SCENARIO_FORMAT_VERSION}.`);
  }
  errors.push(...validateScenarioDefinition(document.scenario));
  const uniqueErrors = [...new Set(errors)];
  if (uniqueErrors.length) return { ok: false, scenario: null, errors: uniqueErrors };

  return {
    ok: true,
    scenario: freezeScenarioDefinition(structuredClone(document.scenario)),
    errors: [],
  };
}
