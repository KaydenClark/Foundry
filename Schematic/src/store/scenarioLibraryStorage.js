import {
  freezeScenarioDefinition,
  validateScenarioDefinition,
} from "../domain/scenarioLibrary.js";
import { importScenarioDocument } from "../domain/scenarioPortability.js";

export const LOCAL_SCENARIO_STORAGE_KEY = "foundry-schematic.scenarios.v1";
const LOCAL_LIBRARY_SCHEMA_VERSION = 1;

function identityErrors(scenarios, reservedScenarios = []) {
  const errors = [];
  const ids = new Set(reservedScenarios.map((scenario) => scenario.id));
  const shortIds = new Set(reservedScenarios.map((scenario) => scenario.shortId));
  const jobOrderIds = new Set(reservedScenarios.map((scenario) => scenario.jobOrder?.id));

  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) errors.push(`Duplicate scenario id: ${scenario.id}.`);
    else ids.add(scenario.id);
    if (shortIds.has(scenario.shortId)) errors.push(`Duplicate scenario shortId: ${scenario.shortId}.`);
    else shortIds.add(scenario.shortId);
    if (jobOrderIds.has(scenario.jobOrder?.id)) errors.push(`Duplicate Scenario Job Order id: ${scenario.jobOrder?.id}.`);
    else jobOrderIds.add(scenario.jobOrder?.id);
  }
  return errors;
}

function validateLibrary(scenarios, reservedScenarios = []) {
  const errors = [];
  for (const [index, scenario] of scenarios.entries()) {
    for (const error of validateScenarioDefinition(scenario)) {
      errors.push(`Local scenario ${index + 1}: ${error}`);
    }
  }
  errors.push(...identityErrors(scenarios, reservedScenarios));
  return errors;
}

function freezeLibrary(scenarios) {
  return Object.freeze(scenarios.map((scenario) => freezeScenarioDefinition(structuredClone(scenario))));
}

export function loadLocalScenarioLibrary(storage, { reservedScenarios = [] } = {}) {
  try {
    const raw = storage.getItem(LOCAL_SCENARIO_STORAGE_KEY);
    if (raw === null) return { scenarios: Object.freeze([]), errors: [] };
    const document = JSON.parse(raw);
    if (!document || document.schemaVersion !== LOCAL_LIBRARY_SCHEMA_VERSION || !Array.isArray(document.scenarios)) {
      return { scenarios: Object.freeze([]), errors: ["Stored local scenario library is invalid or unsupported."] };
    }
    const errors = validateLibrary(document.scenarios, reservedScenarios);
    if (errors.length) return { scenarios: Object.freeze([]), errors };
    return { scenarios: freezeLibrary(document.scenarios), errors: [] };
  } catch (error) {
    return { scenarios: Object.freeze([]), errors: [`Could not read local scenarios: ${error.message}`] };
  }
}

export function saveLocalScenario({ storage, scenarios, candidate, reservedScenarios = [] }) {
  const candidateErrors = validateScenarioDefinition(candidate);
  if (candidateErrors.length) return { ok: false, scenarios, errors: candidateErrors };

  const candidateCopy = structuredClone(candidate);
  const existingIndex = scenarios.findIndex((scenario) => scenario.id === candidateCopy.id);
  const next = scenarios.map((scenario) => structuredClone(scenario));
  if (existingIndex === -1) next.push(candidateCopy);
  else next[existingIndex] = candidateCopy;

  const errors = validateLibrary(next, reservedScenarios);
  if (errors.length) return { ok: false, scenarios, errors };

  try {
    storage.setItem(LOCAL_SCENARIO_STORAGE_KEY, JSON.stringify({
      schemaVersion: LOCAL_LIBRARY_SCHEMA_VERSION,
      scenarios: next,
    }));
  } catch (error) {
    return { ok: false, scenarios, errors: [`Could not save local scenarios: ${error.message}`] };
  }

  return { ok: true, scenarios: freezeLibrary(next), errors: [] };
}

export function importLocalScenario({ storage, scenarios, documentText, reservedScenarios = [] }) {
  const decoded = importScenarioDocument(documentText);
  if (!decoded.ok) {
    return {
      ok: false,
      scenarios,
      importedScenario: null,
      errors: decoded.errors,
    };
  }

  const collisionErrors = identityErrors(
    [decoded.scenario],
    [...reservedScenarios, ...scenarios],
  );
  if (collisionErrors.length) {
    return {
      ok: false,
      scenarios,
      importedScenario: null,
      errors: collisionErrors,
    };
  }

  const candidate = structuredClone(decoded.scenario);
  const next = [...scenarios.map((scenario) => structuredClone(scenario)), candidate];
  const errors = validateLibrary(next, reservedScenarios);
  if (errors.length) {
    return {
      ok: false,
      scenarios,
      importedScenario: null,
      errors,
    };
  }

  try {
    storage.setItem(LOCAL_SCENARIO_STORAGE_KEY, JSON.stringify({
      schemaVersion: LOCAL_LIBRARY_SCHEMA_VERSION,
      scenarios: next,
    }));
  } catch (error) {
    return {
      ok: false,
      scenarios,
      importedScenario: null,
      errors: [`Could not import local scenario: ${error.message}`],
    };
  }

  const frozenScenarios = freezeLibrary(next);
  return {
    ok: true,
    scenarios: frozenScenarios,
    importedScenario: frozenScenarios.at(-1),
    errors: [],
  };
}
