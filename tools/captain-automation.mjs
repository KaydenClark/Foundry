#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const OUTCOMES = new Set([
  "actionable",
  "worked",
  "idle",
  "owner_gate",
  "collision",
  "infrastructure_error",
]);
const SIGNALS = new Set([
  "remote_delta",
  "eligible_ticket",
  "pending_feedback_pr",
  "captain_assignment",
  "keep_active",
]);
const STATUSES = new Set(["active", "paused", "owner_input"]);
const MODEL_POLICY = {
  default_worker: {
    model: "gpt-5.3-codex-spark",
    reasoningEffort: "medium",
    use: "default_worker",
  },
  terra_low: {
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
    use: "captain_selected_complex_work",
  },
  terra_medium: {
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    use: "captain_selected_complex_work",
  },
  auditor: {
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    use: "default_auditor",
  },
  auditor_high: {
    model: "gpt-5.6-terra",
    reasoningEffort: "high",
    use: "justified_complex_audit",
  },
};
const ESCALATION_POLICY = {
  automaticFallback: false,
  workerMayRequestAnyHigherProfile: true,
  terraRequiresFailedLowerAttempt: false,
  solRequiresCaptainReview: true,
  solRequiresExistingTicketReason: true,
  solHighRequiresLowerReasoningRationale: true,
};
const DAILY_COORDINATOR = {
  model: "gpt-5.6-luna",
  reasoningEffort: "low",
  maxWorkerDispatches: 1,
  allowAutomaticAudits: false,
  allowAutomaticMedics: false,
};
const ACTIVATION_LEVELS = {
  L0_SLEEPING: { level: 0, name: "Sleeping", responsibility: "deterministic_checks_only" },
  L1_DISPATCHER: { level: 1, name: "Dispatcher", responsibility: "captain_coordination" },
  L2_DEFAULT_WORKER: { level: 2, name: "Worker default", responsibility: "default_slice_execution" },
  L2_COMPLEX_WORKER: { level: 2, name: "Worker complex", responsibility: "complex_slice_execution_or_audit" },
  L3_EXECUTIVE: { level: 3, name: "Executive", responsibility: "reviewed_escalation_only" },
};
const MODEL_ROSTER = {
  L0_SLEEPING: { openai: null, claude: null },
  L1_DISPATCHER: { openai: "gpt-5.6-luna", claude: "claude-sonnet-5" },
  L2_DEFAULT_WORKER: { openai: "gpt-5.3-codex-spark", claude: "claude-sonnet-5" },
  L2_COMPLEX_WORKER: { openai: "gpt-5.6-terra", claude: "claude-opus-4-8" },
  L3_EXECUTIVE: { openai: "gpt-5.6-sol", claude: "claude-fable-5" },
};
const MODEL_TIER_ACTIVATION = {
  default_worker: "L2_DEFAULT_WORKER",
  terra_low: "L2_COMPLEX_WORKER",
  terra_medium: "L2_COMPLEX_WORKER",
  auditor: "L2_COMPLEX_WORKER",
  auditor_high: "L2_COMPLEX_WORKER",
};

function requireExactKeys(value, keys, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).sort().join("\n") !== [...keys].sort().join("\n")
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function loadBindings(explicitBindings) {
  const bindings = explicitBindings ?? (() => {
    const path = process.env.FOUNDRY_CAPTAIN_BINDINGS;
    if (!path) throw new Error("Captain automation requires FOUNDRY_CAPTAIN_BINDINGS");
    return JSON.parse(readFileSync(path, "utf8"));
  })();
  requireExactKeys(
    bindings,
    ["schemaVersion", "requiredContracts", "contracts", "workflows"],
    "Captain workflow bindings",
  );
  if (
    bindings.schemaVersion !== "1.0"
    || !Array.isArray(bindings.requiredContracts)
    || !bindings.requiredContracts.length
    || !Array.isArray(bindings.workflows)
  ) {
    throw new Error("Captain workflow bindings are invalid");
  }
  const requiredContracts = bindings.requiredContracts.map((id, index) =>
    requireNonEmptyString(id, `requiredContracts[${index}]`));
  if (new Set(requiredContracts).size !== requiredContracts.length) {
    throw new Error("Captain workflow bindings contain duplicate required contracts");
  }
  requireExactKeys(bindings.contracts, requiredContracts, "Captain workflow binding contracts");
  for (const [id, contract] of Object.entries(bindings.contracts)) {
    requireExactKeys(contract, ["repository", "ref"], `Captain workflow binding contract ${id}`);
    requireNonEmptyString(contract.repository, `Captain workflow binding contract ${id} repository`);
    requireSha(contract.ref, `Captain workflow binding contract ref ${id}`);
  }
  const allowlist = new Map();
  for (const workflow of bindings.workflows) {
    requireExactKeys(workflow, ["id", "automationToml", "role"], "Captain workflow binding");
    const id = requireNonEmptyString(workflow.id, "Captain workflow binding id");
    requireNonEmptyString(workflow.automationToml, `Captain workflow binding ${id} automationToml`);
    requireNonEmptyString(workflow.role, `Captain workflow binding ${id} role`);
    if (allowlist.has(id)) {
      throw new Error("Captain workflow bindings contain an invalid or duplicate id");
    }
    allowlist.set(id, workflow);
  }
  return {
    requiredContracts,
    contracts: bindings.contracts,
    allowlist,
  };
}

function requireTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function meaningfulProof(proof) {
  return Boolean(
    proof &&
      typeof proof.pushedSha === "string" &&
      proof.pushedSha.length > 0 &&
      proof.pushedSha === proof.specEvidenceSha &&
      proof.remoteContainsSha === true
  );
}

function requireSha(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a 40-character lowercase Git SHA`);
  }
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a 64-character lowercase SHA-256 digest`);
  }
  return value;
}

export function createMeaningfulProofReceipt({
  closeout,
  fetchProvenance,
  specEvidenceSha,
}) {
  const closeoutKeys = ["ok", "repo", "branch", "sha", "verifiedAt"].sort();
  if (!closeout || Object.keys(closeout).sort().join("\n") !== closeoutKeys.join("\n")) {
    throw new Error("meaningful proof requires the exact Captain closeout receipt");
  }
  const provenanceKeys = [
    "schemaVersion",
    "remoteName",
    "remoteUrl",
    "trackedRef",
    "sha",
    "fetchedAt",
  ].sort();
  if (
    !fetchProvenance
    || Object.keys(fetchProvenance).sort().join("\n") !== provenanceKeys.join("\n")
    || fetchProvenance.schemaVersion !== "1.0"
  ) {
    throw new Error("meaningful proof requires the exact Captain fetch provenance receipt");
  }
  const pushedSha = requireSha(closeout.sha, "closeout.sha");
  const evidenceSha = requireSha(specEvidenceSha, "specEvidenceSha");
  const fetchedSha = requireSha(fetchProvenance.sha, "fetchProvenance.sha");
  const verifiedAt = requireTimestamp(closeout.verifiedAt, "closeout.verifiedAt");
  const fetchedAt = requireTimestamp(fetchProvenance.fetchedAt, "fetchProvenance.fetchedAt");
  if (!closeout.ok || pushedSha !== evidenceSha || pushedSha !== fetchedSha) {
    throw new Error("meaningful proof SHAs must match verified remote and spec evidence");
  }
  if (Date.parse(fetchedAt) > Date.parse(verifiedAt)) {
    throw new Error("meaningful proof fetch cannot follow closeout verification");
  }
  return {
    pushedSha,
    specEvidenceSha: evidenceSha,
    remoteContainsSha: true,
    verifiedAt,
  };
}

export function createState({ workflowId, enrolledAt }) {
  if (!loadBindings().allowlist.has(workflowId)) {
    throw new Error(`workflow ${workflowId} is not allowlisted`);
  }
  return {
    workflowId,
    status: "active",
    consecutiveIdle: 0,
    enrolledAt: requireTimestamp(enrolledAt, "enrolledAt"),
    lastObservedRemoteSha: null,
    lastRunOutcome: null,
    lastRunReason: null,
    lastMeaningfulProofAt: null,
    lastOwnerDecisionAt: null,
    readyToArchive: false,
  };
}

export function applyEvent(state, event) {
  const next = structuredClone(state);
  const at = requireTimestamp(event.at, "event.at");

  if (event.type === "run") {
    if (!OUTCOMES.has(event.outcome)) {
      throw new Error(`unknown outcome: ${event.outcome}`);
    }
    next.lastRunOutcome = event.outcome;
    if (typeof event.reason === "string" && event.reason.trim()) {
      next.lastRunReason = event.reason.trim();
    }
    if (typeof event.remoteSha === "string" && event.remoteSha.length > 0) {
      next.lastObservedRemoteSha = event.remoteSha;
    }

    if (meaningfulProof(event.proof)) {
      next.lastMeaningfulProofAt = at;
      next.status = "active";
      next.consecutiveIdle = 0;
      next.readyToArchive = false;
      return next;
    }

    if (event.outcome === "idle") {
      next.consecutiveIdle = Math.min(2, next.consecutiveIdle + 1);
      if (next.consecutiveIdle === 2 && next.status !== "owner_input") {
        next.status = "paused";
      }
    } else if (event.outcome === "owner_gate") {
      next.status = "owner_input";
    } else if (
      (event.outcome === "worked" || event.outcome === "actionable") &&
      next.status !== "owner_input"
    ) {
      next.status = "active";
      next.consecutiveIdle = 0;
    }
    return next;
  }

  if (event.type === "signal") {
    if (!SIGNALS.has(event.kind)) {
      throw new Error(`unknown signal: ${event.kind}`);
    }
    if (event.kind === "captain_assignment" || event.kind === "keep_active") {
      next.status = "active";
      next.consecutiveIdle = 0;
      next.readyToArchive = false;
      next.lastOwnerDecisionAt = at;
      return next;
    }
    if (next.status !== "owner_input") {
      next.status = "active";
      next.consecutiveIdle = 0;
    }
    return next;
  }

  throw new Error(`unknown event type: ${event.type}`);
}

export function evaluateWeeklyValue(state, now) {
  const evaluatedAt = requireTimestamp(now, "now");
  const progressBase = state.lastMeaningfulProofAt ?? state.enrolledAt;
  const attentionBase = [progressBase, state.lastOwnerDecisionAt]
    .filter(Boolean)
    .sort()
    .at(-1);
  const attentionDays = (Date.parse(evaluatedAt) - Date.parse(attentionBase)) / 86_400_000;
  const progressDays = (Date.parse(evaluatedAt) - Date.parse(progressBase)) / 86_400_000;
  if (attentionDays < 0 || progressDays < 0) {
    throw new Error("evaluation time precedes workflow evidence");
  }

  const next = structuredClone(state);
  if (attentionDays >= 7) {
    next.status = "owner_input";
  }
  next.readyToArchive = progressDays >= 14 && attentionDays >= 7;
  return next;
}

export function validateRegistry(registry, { bindings } = {}) {
  const {
    requiredContracts,
    contracts,
    allowlist,
  } = loadBindings(bindings);
  if (!registry || registry.version !== 4 || !Array.isArray(registry.workflows)) {
    throw new Error("registry.workflows must be an array");
  }
  if (JSON.stringify(registry.modelPolicy) !== JSON.stringify(MODEL_POLICY)) {
    throw new Error("registry modelPolicy does not match the approved lowest-capable policy");
  }
  if (JSON.stringify(registry.escalationPolicy) !== JSON.stringify(ESCALATION_POLICY)) {
    throw new Error("registry escalationPolicy does not match the approved review contract");
  }
  if (JSON.stringify(registry.dailyCoordinator) !== JSON.stringify(DAILY_COORDINATOR)) {
    throw new Error("registry dailyCoordinator does not match the approved budget cap");
  }
  if (JSON.stringify(registry.activationLevels) !== JSON.stringify(ACTIVATION_LEVELS)) {
    throw new Error("registry activationLevels do not match the approved S-015 levels");
  }
  if (JSON.stringify(registry.modelRoster) !== JSON.stringify(MODEL_ROSTER)) {
    throw new Error("registry modelRoster does not match the approved S-015 roster");
  }
  if (JSON.stringify(registry.modelTierActivation) !== JSON.stringify(MODEL_TIER_ACTIVATION)) {
    throw new Error("registry modelTierActivation does not match the approved S-015 tier map");
  }
  if (Object.entries(registry.modelTierActivation).some(([, tier]) => tier === "L3_EXECUTIVE")) {
    throw new Error("registry modelTierActivation must not default any workflow to L3 Executive");
  }
  if (!registry.contracts || typeof registry.contracts !== "object") {
    throw new Error("registry.contracts must declare the integrated contracts");
  }
  if (
    Object.keys(registry.contracts).sort().join("\n")
    !== Object.keys(contracts).sort().join("\n")
  ) {
    throw new Error("registry contracts do not match the exact contract allowlist");
  }
  for (const [id, expected] of Object.entries(contracts)) {
    const contract = registry.contracts[id];
    if (
      !contract
      || contract.repository !== expected.repository
      || contract.ref !== expected.ref
      || !["integrated", "pending"].includes(contract.status)
    ) {
      throw new Error(`contract ${id} does not match its approved integration`);
    }
  }
  const seen = new Set();
  for (const workflow of registry.workflows) {
    const expected = allowlist.get(workflow.id);
    if (!expected || workflow.automationToml !== expected.automationToml) {
      throw new Error(`workflow ${workflow.id} or its path is not allowlisted`);
    }
    if (typeof workflow.runtimeEnabled !== "boolean") {
      throw new Error(`workflow ${workflow.id} runtimeEnabled must be boolean`);
    }
    if (workflow.dispatchMode !== "one_shot_role_task" || workflow.role !== expected.role) {
      throw new Error(`workflow ${workflow.id} must use its approved one-shot role task`);
    }
    if (!Object.hasOwn(MODEL_POLICY, workflow.modelTier)) {
      throw new Error(`workflow ${workflow.id} has an unknown modelTier`);
    }
    if (workflow.role === "Planner" && workflow.modelTier !== "terra_medium") {
      throw new Error(`workflow ${workflow.id} planning requires Terra medium`);
    }
    if (workflow.role === "Auditor" && workflow.modelTier !== "auditor") {
      throw new Error(`workflow ${workflow.id} auditing requires the default Auditor tier`);
    }
    if (
      workflow.fallbackTier !== null
      && !Object.hasOwn(MODEL_POLICY, workflow.fallbackTier)
    ) {
      throw new Error(`workflow ${workflow.id} has an unknown fallbackTier`);
    }
    if (workflow.fallbackTier !== null) {
      throw new Error(`workflow ${workflow.id} automatic fallback is forbidden`);
    }
    if (
      !Array.isArray(workflow.requiredContracts)
      || workflow.requiredContracts.join("\n") !== requiredContracts.join("\n")
    ) {
      throw new Error(`workflow ${workflow.id} must name the exact required contracts`);
    }
    if (
      workflow.runtimeEnabled
      && workflow.requiredContracts.some((id) => registry.contracts[id]?.status !== "integrated")
    ) {
      throw new Error(`runtime-enabled workflow ${workflow.id} requires integrated contracts`);
    }
    if (seen.has(workflow.id)) {
      throw new Error(`duplicate workflow: ${workflow.id}`);
    }
    seen.add(workflow.id);
  }
  if (seen.size !== allowlist.size || [...allowlist.keys()].some((id) => !seen.has(id))) {
    throw new Error("registry must contain the exact workflow allowlist");
  }
  return registry.workflows;
}

function optionalTimestamp(value, label) {
  return value === null ? null : requireTimestamp(value, label);
}

function validateWorkflowState(state, workflowId) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error(`workflow state ${workflowId} must be an object`);
  }
  const exactKeys = [
    "workflowId",
    "status",
    "consecutiveIdle",
    "enrolledAt",
    "lastObservedRemoteSha",
    "lastRunOutcome",
    "lastRunReason",
    "lastMeaningfulProofAt",
    "lastOwnerDecisionAt",
    "readyToArchive",
  ].sort();
  if (Object.keys(state).sort().join("\n") !== exactKeys.join("\n")) {
    throw new Error(`workflow state ${workflowId} has an invalid shape`);
  }
  if (state.workflowId !== workflowId || !STATUSES.has(state.status)) {
    throw new Error(`workflow state ${workflowId} has invalid identity or status`);
  }
  if (!Number.isInteger(state.consecutiveIdle) || state.consecutiveIdle < 0 || state.consecutiveIdle > 2) {
    throw new Error(`workflow state ${workflowId} has invalid idle evidence`);
  }
  requireTimestamp(state.enrolledAt, `${workflowId}.enrolledAt`);
  optionalTimestamp(state.lastMeaningfulProofAt, `${workflowId}.lastMeaningfulProofAt`);
  optionalTimestamp(state.lastOwnerDecisionAt, `${workflowId}.lastOwnerDecisionAt`);
  if (
    state.lastObservedRemoteSha !== null
    && (typeof state.lastObservedRemoteSha !== "string" || !state.lastObservedRemoteSha)
  ) {
    throw new Error(`workflow state ${workflowId} has invalid remote SHA`);
  }
  if (state.lastRunOutcome !== null && !OUTCOMES.has(state.lastRunOutcome)) {
    throw new Error(`workflow state ${workflowId} has invalid run outcome`);
  }
  if (
    state.lastRunReason !== null
    && (typeof state.lastRunReason !== "string" || !state.lastRunReason.trim())
  ) {
    throw new Error(`workflow state ${workflowId} has invalid run reason`);
  }
  if (typeof state.readyToArchive !== "boolean") {
    throw new Error(`workflow state ${workflowId} has invalid archive readiness`);
  }
}

function validateMachineState(state, registry) {
  validateRegistry(registry);
  if (!state || state.schemaVersion !== "1.0" || !state.workflows) {
    throw new Error("captain machine state must use schemaVersion 1.0");
  }
  requireTimestamp(state.updatedAt, "state.updatedAt");
  const expectedIds = registry.workflows.map(({ id }) => id);
  if (Object.keys(state.workflows).join("\n") !== expectedIds.join("\n")) {
    throw new Error("captain machine state does not match the exact workflow allowlist");
  }
  for (const workflowId of expectedIds) {
    validateWorkflowState(state.workflows[workflowId], workflowId);
  }
  return state;
}

function newMachineState(registry, now) {
  const enrolledAt = requireTimestamp(now, "now");
  return {
    schemaVersion: "1.0",
    updatedAt: enrolledAt,
    workflows: Object.fromEntries(
      registry.workflows.map(({ id }) => [id, createState({ workflowId: id, enrolledAt })])
    ),
  };
}

export function writeMachineStateAtomic(statePath, state, options = {}) {
  const directory = dirname(statePath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.${basename(statePath)}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    options.beforeRename?.(temporaryPath);
    renameSync(temporaryPath, statePath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function readMachineState({ registry, statePath }) {
  try {
    return validateMachineState(JSON.parse(readFileSync(statePath, "utf8")), registry);
  } catch (error) {
    throw new Error(`captain state is invalid; refuse automatic reconstruction: ${error.message}`);
  }
}

export function bootstrapMachineState({ registry, statePath, now }) {
  validateRegistry(registry);
  if (existsSync(statePath)) {
    return { created: false, state: readMachineState({ registry, statePath }) };
  }
  const state = newMachineState(registry, now);
  writeMachineStateAtomic(statePath, state);
  return { created: true, state };
}

function validateStandardizedOutcome(outcome, currentIdleCount) {
  const keys = ["category", "reason", "idleCount", "pauseRecommended"].sort();
  if (!outcome || Object.keys(outcome).sort().join("\n") !== keys.join("\n")) {
    throw new Error("standardized S-013 outcome must contain exactly four fields");
  }
  if (!OUTCOMES.has(outcome.category)) {
    throw new Error("standardized S-013 category is invalid");
  }
  if (typeof outcome.reason !== "string" || !outcome.reason.trim()) {
    throw new Error("standardized S-013 reason must be a non-empty string");
  }
  const expectedIdleCount = outcome.category === "idle"
    ? currentIdleCount + 1
    : ["actionable", "worked"].includes(outcome.category)
      ? 0
      : currentIdleCount;
  if (outcome.idleCount !== expectedIdleCount) {
    throw new Error("standardized S-013 idleCount does not match current state");
  }
  const expectedPause = outcome.category === "idle" && expectedIdleCount >= 2;
  if (outcome.pauseRecommended !== expectedPause) {
    throw new Error("standardized S-013 pause recommendation is inconsistent");
  }
  return { ...outcome, reason: outcome.reason.trim() };
}

function validateMeaningfulProofReceipt(receipt, eventAt, stateUpdatedAt) {
  const keys = [
    "pushedSha",
    "specEvidenceSha",
    "remoteContainsSha",
    "verifiedAt",
  ].sort();
  if (!receipt || Object.keys(receipt).sort().join("\n") !== keys.join("\n")) {
    throw new Error("meaningful proof receipt must contain exactly four fields");
  }
  const pushedSha = requireSha(receipt.pushedSha, "meaningful proof pushedSha");
  const evidenceSha = requireSha(receipt.specEvidenceSha, "meaningful proof specEvidenceSha");
  const verifiedAt = requireTimestamp(receipt.verifiedAt, "meaningful proof verifiedAt");
  if (pushedSha !== evidenceSha) {
    throw new Error("meaningful proof SHA does not match owning-spec evidence");
  }
  if (receipt.remoteContainsSha !== true) {
    throw new Error("meaningful proof requires verified remote containment");
  }
  if (verifiedAt !== eventAt) {
    throw new Error("meaningful proof timestamp must bind to the outcome event");
  }
  if (Date.parse(verifiedAt) <= Date.parse(stateUpdatedAt)) {
    throw new Error("meaningful proof replay or stale receipt rejected");
  }
  return {
    pushedSha,
    specEvidenceSha: evidenceSha,
    remoteContainsSha: true,
  };
}

export function recordStandardizedOutcome({
  registry,
  statePath,
  workflowId,
  outcome,
  at,
  proofReceipt,
}) {
  validateRegistry(registry);
  if (!loadBindings().allowlist.has(workflowId)) {
    throw new Error(`workflow ${workflowId} is not allowlisted`);
  }
  const state = readMachineState({ registry, statePath });
  const normalized = validateStandardizedOutcome(
    outcome,
    state.workflows[workflowId].consecutiveIdle
  );
  const recordedAt = requireTimestamp(at, "at");
  if (Date.parse(recordedAt) < Date.parse(state.updatedAt)) {
    throw new Error("outcome time precedes the persisted Captain state");
  }
  if (proofReceipt !== undefined && normalized.category !== "worked") {
    throw new Error("meaningful proof may accompany only a worked outcome");
  }
  const proof = proofReceipt === undefined
    ? undefined
    : validateMeaningfulProofReceipt(proofReceipt, recordedAt, state.updatedAt);
  const next = structuredClone(state);
  next.workflows[workflowId] = applyEvent(next.workflows[workflowId], {
    type: "run",
    outcome: normalized.category,
    reason: normalized.reason,
    at: recordedAt,
    proof,
  });
  next.updatedAt = recordedAt;
  validateMachineState(next, registry);
  writeMachineStateAtomic(statePath, next);
  return { workflowId, outcome: normalized, state: next };
}

function validateSignals(signals, registry, now, stateUpdatedAt) {
  if (!Array.isArray(signals)) {
    throw new Error("signals must be an array");
  }
  const allowlisted = new Set(registry.workflows.map(({ id }) => id));
  const seen = new Set();
  const evaluatedAt = Date.parse(now);
  for (const signal of signals) {
    const keys = ["workflowId", "kind", "at"].sort();
    if (!signal || Object.keys(signal).sort().join("\n") !== keys.join("\n")) {
      throw new Error("signal must contain exactly workflowId, kind, and at");
    }
    if (!allowlisted.has(signal.workflowId) || !SIGNALS.has(signal.kind)) {
      throw new Error("signal is not allowlisted");
    }
    const at = requireTimestamp(signal.at, "signal.at");
    if (Date.parse(at) > evaluatedAt) {
      throw new Error("signal time cannot follow the daily evaluation");
    }
    if (Date.parse(at) < Date.parse(stateUpdatedAt)) {
      throw new Error("signal time precedes the persisted Captain state");
    }
    if (seen.has(signal.workflowId)) {
      throw new Error(`workflow ${signal.workflowId} has multiple daily signals`);
    }
    seen.add(signal.workflowId);
  }
  return new Map(signals.map((signal) => [signal.workflowId, signal]));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.keys(value).sort().join("\n") !== keys.slice().sort().join("\n")) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function optionalDigestRef(value, label) {
  if (value === null) {
    return null;
  }
  exactKeys(value, ["digest", "id"], label);
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error(`${label}.id must be a non-empty string`);
  }
  return {
    id: value.id.trim(),
    digest: requireSha256(value.digest, `${label}.digest`),
  };
}

function optionalFeedbackPr(value) {
  if (value === null) {
    return null;
  }
  exactKeys(value, ["headSha", "number", "repository"], "pendingFeedbackPr");
  if (typeof value.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)) {
    throw new Error("pendingFeedbackPr.repository must be owner/repo");
  }
  if (!Number.isInteger(value.number) || value.number <= 0) {
    throw new Error("pendingFeedbackPr.number must be a positive integer");
  }
  return {
    repository: value.repository,
    number: value.number,
    headSha: requireSha(value.headSha, "pendingFeedbackPr.headSha"),
  };
}

function normalizeLevelZeroSnapshot(snapshot, registry) {
  exactKeys(snapshot, [
    "activeDirectAssignment",
    "directAssignment",
    "enrolledGit",
    "observedAt",
    "pendingFeedbackPr",
    "readyQueueHash",
    "schemaVersion",
    "trackedFiles",
  ], "level-zero snapshot");
  if (snapshot.schemaVersion !== "1.0") {
    throw new Error("level-zero snapshot schemaVersion must be 1.0");
  }
  const observedAt = requireTimestamp(snapshot.observedAt, "level-zero snapshot observedAt");
  const expectedIds = registry.workflows.map(({ id }) => id);
  if (!Array.isArray(snapshot.enrolledGit) || snapshot.enrolledGit.length !== expectedIds.length) {
    throw new Error("level-zero snapshot enrolledGit must cover the exact workflow allowlist");
  }
  const enrolledGit = snapshot.enrolledGit.map((entry, index) => {
    exactKeys(entry, ["localSha", "remoteSha", "workflowId"], `enrolledGit[${index}]`);
    if (entry.workflowId !== expectedIds[index]) {
      throw new Error("level-zero snapshot enrolledGit must follow registry workflow order");
    }
    return {
      workflowId: entry.workflowId,
      localSha: requireSha(entry.localSha, `${entry.workflowId}.localSha`),
      remoteSha: requireSha(entry.remoteSha, `${entry.workflowId}.remoteSha`),
    };
  });
  if (!Array.isArray(snapshot.trackedFiles)) {
    throw new Error("level-zero snapshot trackedFiles must be an array");
  }
  const trackedFiles = snapshot.trackedFiles.map((entry, index) => {
    exactKeys(entry, ["mtimeMs", "path", "size"], `trackedFiles[${index}]`);
    if (
      typeof entry.path !== "string"
      || !entry.path.trim()
      || entry.path.startsWith("/")
      || entry.path.includes("\0")
    ) {
      throw new Error(`trackedFiles[${index}].path must be a relative path`);
    }
    if (!Number.isInteger(entry.mtimeMs) || entry.mtimeMs < 0) {
      throw new Error(`trackedFiles[${index}].mtimeMs must be a non-negative integer`);
    }
    if (!Number.isInteger(entry.size) || entry.size < 0) {
      throw new Error(`trackedFiles[${index}].size must be a non-negative integer`);
    }
    return { path: entry.path.trim(), mtimeMs: entry.mtimeMs, size: entry.size };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: "1.0",
    observedAt,
    enrolledGit,
    readyQueueHash: requireSha256(snapshot.readyQueueHash, "readyQueueHash"),
    trackedFiles,
    activeDirectAssignment: optionalDigestRef(snapshot.activeDirectAssignment, "activeDirectAssignment"),
    pendingFeedbackPr: optionalFeedbackPr(snapshot.pendingFeedbackPr),
    directAssignment: optionalDigestRef(snapshot.directAssignment, "directAssignment"),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function levelZeroSignalDigest(snapshot) {
  const { observedAt: _observedAt, ...signals } = snapshot;
  return createHash("sha256").update(stableJson(signals)).digest("hex");
}

function levelZeroReceipt({ evaluatedAt, decision, reason, signalDigest }) {
  return {
    schemaVersion: "1.0",
    evaluatedAt,
    decision,
    reason,
    l1DispatchDecisions: decision === "wake_l1" ? 1 : 0,
    modelSpawns: 0,
    signalDigest,
  };
}

function validateLevelZeroState(state) {
  exactKeys(state, [
    "lastChangedAt",
    "lastReceipt",
    "lastSignalDigest",
    "schemaVersion",
    "updatedAt",
  ], "level-zero state");
  if (state.schemaVersion !== "1.0") {
    throw new Error("level-zero state schemaVersion must be 1.0");
  }
  const updatedAt = requireTimestamp(state.updatedAt, "level-zero state updatedAt");
  const lastChangedAt = requireTimestamp(state.lastChangedAt, "level-zero state lastChangedAt");
  if (Date.parse(lastChangedAt) > Date.parse(updatedAt)) {
    throw new Error("level-zero state lastChangedAt cannot follow updatedAt");
  }
  const lastSignalDigest = requireSha256(state.lastSignalDigest, "level-zero state lastSignalDigest");
  exactKeys(state.lastReceipt, [
    "decision",
    "evaluatedAt",
    "l1DispatchDecisions",
    "modelSpawns",
    "reason",
    "schemaVersion",
    "signalDigest",
  ], "level-zero receipt");
  if (state.lastReceipt.schemaVersion !== "1.0") {
    throw new Error("level-zero receipt schemaVersion must be 1.0");
  }
  requireTimestamp(state.lastReceipt.evaluatedAt, "level-zero receipt evaluatedAt");
  if (!["no_change", "wake_l1"].includes(state.lastReceipt.decision)) {
    throw new Error("level-zero receipt decision is invalid");
  }
  if (!["unchanged_signals", "first_observation", "changed_signals"].includes(state.lastReceipt.reason)) {
    throw new Error("level-zero receipt reason is invalid");
  }
  if (state.lastReceipt.modelSpawns !== 0) {
    throw new Error("level-zero receipt must not spawn models");
  }
  const expectedL1 = state.lastReceipt.decision === "wake_l1" ? 1 : 0;
  if (state.lastReceipt.l1DispatchDecisions !== expectedL1) {
    throw new Error("level-zero receipt L1 dispatch count is inconsistent");
  }
  if (state.lastReceipt.signalDigest !== lastSignalDigest) {
    throw new Error("level-zero receipt digest must match state");
  }
  return { ...state, updatedAt, lastChangedAt, lastSignalDigest };
}

function readLevelZeroState(statePath) {
  try {
    return validateLevelZeroState(JSON.parse(readFileSync(statePath, "utf8")));
  } catch (error) {
    throw new Error(`level-zero state invalid; no wake: ${error.message}`);
  }
}

export function runLevelZeroDecision({ registry, statePath, snapshot, now }) {
  validateRegistry(registry);
  const evaluatedAt = requireTimestamp(now, "now");
  const normalizedSnapshot = normalizeLevelZeroSnapshot(snapshot, registry);
  if (Date.parse(normalizedSnapshot.observedAt) > Date.parse(evaluatedAt)) {
    throw new Error("level-zero snapshot cannot follow evaluation time; no wake");
  }
  const signalDigest = levelZeroSignalDigest(normalizedSnapshot);
  const current = existsSync(statePath) ? readLevelZeroState(statePath) : null;
  if (current && Date.parse(evaluatedAt) < Date.parse(current.updatedAt)) {
    throw new Error("level-zero evaluation is stale; no wake");
  }
  if (current && Date.parse(normalizedSnapshot.observedAt) < Date.parse(current.updatedAt)) {
    throw new Error("level-zero snapshot is stale; no wake");
  }
  const firstObservation = current === null;
  const changed = firstObservation || current.lastSignalDigest !== signalDigest;
  const receipt = levelZeroReceipt({
    evaluatedAt,
    signalDigest,
    decision: changed ? "wake_l1" : "no_change",
    reason: firstObservation
      ? "first_observation"
      : changed
        ? "changed_signals"
        : "unchanged_signals",
  });
  const next = {
    schemaVersion: "1.0",
    updatedAt: evaluatedAt,
    lastChangedAt: changed ? evaluatedAt : current.lastChangedAt,
    lastSignalDigest: signalDigest,
    lastReceipt: receipt,
  };
  validateLevelZeroState(next);
  writeMachineStateAtomic(statePath, next);
  return { evaluatedAt, receipt, state: next };
}

export function runDailyDecision({ registry, statePath, signals, now }) {
  validateRegistry(registry);
  const evaluatedAt = requireTimestamp(now, "now");
  const current = readMachineState({ registry, statePath });
  if (Date.parse(evaluatedAt) < Date.parse(current.updatedAt)) {
    throw new Error("daily evaluation time precedes the persisted Captain state");
  }
  const signalByWorkflow = validateSignals(
    signals,
    registry,
    evaluatedAt,
    current.updatedAt
  );
  const next = structuredClone(current);
  const decisions = [];
  let dispatches = 0;

  for (const workflow of registry.workflows) {
    const signal = signalByWorkflow.get(workflow.id);
    let workflowState = next.workflows[workflow.id];
    if (signal) {
      workflowState = applyEvent(workflowState, {
        type: "signal",
        kind: signal.kind,
        at: signal.at,
      });
    }
    workflowState = evaluateWeeklyValue(workflowState, evaluatedAt);
    next.workflows[workflow.id] = workflowState;

    if (!workflow.runtimeEnabled) {
      decisions.push({ workflowId: workflow.id, decision: "skip", reason: "not_runtime_eligible" });
    } else if (workflowState.readyToArchive) {
      decisions.push({ workflowId: workflow.id, decision: "archive", reason: "fourteen_day_review" });
    } else if (workflowState.status === "owner_input") {
      decisions.push({ workflowId: workflow.id, decision: "owner", reason: "seven_day_review_or_owner_gate" });
    } else if (workflowState.status === "paused") {
      decisions.push({ workflowId: workflow.id, decision: "pause", reason: "two_verified_idle_results" });
    } else if (signal && dispatches >= registry.dailyCoordinator.maxWorkerDispatches) {
      decisions.push({ workflowId: workflow.id, decision: "defer", reason: "daily_worker_cap" });
    } else if (signal) {
      const selectedProfile = registry.modelPolicy[workflow.modelTier];
      const fallbackProfile = workflow.fallbackTier
        ? registry.modelPolicy[workflow.fallbackTier]
        : null;
      decisions.push({
        workflowId: workflow.id,
        decision: "dispatch",
        reason: signal.kind,
        role: workflow.role,
        dispatchMode: workflow.dispatchMode,
        separateTask: true,
        activationTier: registry.modelTierActivation[workflow.modelTier],
        providerModels: registry.modelRoster[registry.modelTierActivation[workflow.modelTier]],
        modelTier: workflow.modelTier,
        model: selectedProfile.model,
        reasoningEffort: selectedProfile.reasoningEffort,
        fallbackTier: workflow.fallbackTier,
        fallbackModel: fallbackProfile?.model ?? null,
        fallbackReasoningEffort: fallbackProfile?.reasoningEffort ?? null,
      });
      dispatches += 1;
    } else {
      decisions.push({ workflowId: workflow.id, decision: "skip", reason: "no_actionable_signal" });
    }
  }

  next.updatedAt = evaluatedAt;
  validateMachineState(next, registry);
  writeMachineStateAtomic(statePath, next);
  return { evaluatedAt, decisions, state: next };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv) {
  const [command, ...args] = argv;
  if (command === "validate-registry" && args.length === 1) {
    const workflows = validateRegistry(readJson(args[0]));
    process.stdout.write(`${JSON.stringify({ ok: true, workflows: workflows.length })}\n`);
    return;
  }
  if (command === "transition" && args.length === 2) {
    process.stdout.write(`${JSON.stringify(applyEvent(readJson(args[0]), readJson(args[1])), null, 2)}\n`);
    return;
  }
  if (command === "bootstrap" && args.length === 3) {
    process.stdout.write(`${JSON.stringify(bootstrapMachineState({
      registry: readJson(args[0]),
      statePath: args[1],
      now: args[2],
    }), null, 2)}\n`);
    return;
  }
  if (command === "daily-decision" && args.length === 4) {
    const signalInput = readJson(args[2]);
    if (
      !signalInput
      || Object.keys(signalInput).join("\n") !== "signals"
      || !Array.isArray(signalInput.signals)
    ) {
      throw new Error("daily-decision input must contain only a signals array");
    }
    process.stdout.write(`${JSON.stringify(runDailyDecision({
      registry: readJson(args[0]),
      statePath: args[1],
      signals: signalInput.signals,
      now: args[3],
    }), null, 2)}\n`);
    return;
  }
  if (command === "level-zero-decision" && args.length === 4) {
    process.stdout.write(`${JSON.stringify(runLevelZeroDecision({
      registry: readJson(args[0]),
      statePath: args[1],
      snapshot: readJson(args[2]),
      now: args[3],
    }), null, 2)}\n`);
    return;
  }
  if (command === "proof-receipt" && args.length === 3) {
    process.stdout.write(`${JSON.stringify(createMeaningfulProofReceipt({
      closeout: readJson(args[0]),
      fetchProvenance: readJson(args[1]),
      specEvidenceSha: args[2],
    }), null, 2)}\n`);
    return;
  }
  if (command === "record-outcome" && (args.length === 5 || args.length === 6)) {
    process.stdout.write(`${JSON.stringify(recordStandardizedOutcome({
      registry: readJson(args[0]),
      statePath: args[1],
      workflowId: args[2],
      outcome: readJson(args[3]),
      at: args[4],
      proofReceipt: args[5] ? readJson(args[5]) : undefined,
    }), null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: captain-automation.mjs validate-registry REGISTRY | transition STATE EVENT | bootstrap REGISTRY STATE NOW | level-zero-decision REGISTRY L0_STATE SNAPSHOT NOW | daily-decision REGISTRY STATE SIGNALS NOW | proof-receipt CLOSEOUT FETCH_PROVENANCE SPEC_SHA | record-outcome REGISTRY STATE WORKFLOW_ID OUTCOME NOW [PROOF_RECEIPT]"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
