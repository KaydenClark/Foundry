#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const STOP_CONDITIONS = new Set([
  "locked_technical_decision_conflict",
  "destructive_outside_sandbox",
  "verification_failure_repeated_twice",
  "new_authority_or_login",
  "unapproved_paid_service",
  "credential_or_privacy_boundary",
  "irreversible_remote_deletion",
  "unresolvable_conflict",
  "unknown_ownership",
  "integration_to_main",
]);
const REQUIRED_STOP_CONDITIONS = [...STOP_CONDITIONS].sort();

function assertExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.keys(value).sort().join("\n") !== [...keys].sort().join("\n")) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertSpecId(value, label) {
  const specId = assertNonEmptyString(value, label);
  if (!/^S-\d{3}$/.test(specId)) {
    throw new Error(`${label} must be a stable S-### identifier`);
  }
  return specId;
}

function assertTicketReference(value, label) {
  const reference = assertNonEmptyString(value, label);
  if (!/^S-\d{3}\/TK-\d{3}$/.test(reference)) {
    throw new Error(`${label} must be an S-###/TK-### reference`);
  }
  return reference;
}

function assertExactStringSet(values, expected, label) {
  if (!Array.isArray(values) || values.length !== expected.length) {
    throw new Error(`${label} must contain the complete required set`);
  }
  const actual = [...new Set(values)].sort();
  if (actual.length !== expected.length || actual.join("\n") !== expected.join("\n")) {
    throw new Error(`${label} must contain the complete required set`);
  }
}

function assertSha(value, label) {
  const sha = assertNonEmptyString(value, label);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`${label} must be a 40-character lowercase Git SHA`);
  }
  return sha;
}

function assertTimestamp(value, label) {
  const timestamp = assertNonEmptyString(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return new Date(timestamp).toISOString();
}

export function validateChainAssignment(
  assignment,
  { instanceRoot = process.env.FOUNDRY_INSTANCE_ROOT } = {},
) {
  if (!instanceRoot) throw new Error("chain validation requires FOUNDRY_INSTANCE_ROOT");
  const projectsRoot = `${join(resolve(instanceRoot), "Projects")}${sep}`;
  assertExactKeys(assignment, [
    "schemaVersion",
    "id",
    "status",
    "project",
    "writer",
    "readOnlyReviewers",
    "specOrder",
    "delegatedDecision",
    "finalOwnerGate",
    "proof",
    "stopConditions",
  ], "chain assignment");
  if (assignment.schemaVersion !== "1.0" || !["pending", "active"].includes(assignment.status)) {
    throw new Error("chain assignment must be a pending or active schema 1.0 record");
  }
  assertNonEmptyString(assignment.id, "chain assignment id");

  assertExactKeys(assignment.project, ["id", "path"], "project");
  assertNonEmptyString(assignment.project.id, "project.id");
  const projectPath = assertNonEmptyString(assignment.project.path, "project.path");
  if (!projectPath.startsWith(projectsRoot) || projectPath.includes(`${sep}..${sep}`)) {
    throw new Error("project.path must name one canonical project under the instance Projects root");
  }

  assertExactKeys(assignment.writer, ["role", "branch", "modelTier"], "writer");
  if (assignment.writer.role !== "Chain Engineer") {
    throw new Error("writer.role must be Chain Engineer");
  }
  if (assignment.writer.branch !== "integration") {
    throw new Error("writer.branch must be integration");
  }
  if (!["default_worker", "terra_low", "terra_medium"].includes(assignment.writer.modelTier)) {
    throw new Error("writer.modelTier must be an approved implementation tier");
  }

  if (!Array.isArray(assignment.readOnlyReviewers) || assignment.readOnlyReviewers.length !== 2) {
    throw new Error("readOnlyReviewers must define the Scout and Auditor evidence lanes");
  }
  const reviewerRoles = new Set();
  for (const reviewer of assignment.readOnlyReviewers) {
    assertExactKeys(reviewer, ["role", "phase", "mode"], "read-only reviewer");
    if (!["Scout", "Auditor"].includes(reviewer.role) || reviewer.mode !== "read_only") {
      throw new Error("reviewers must be read-only Scout and Auditor lanes");
    }
    reviewerRoles.add(reviewer.role);
  }
  if (reviewerRoles.size !== 2) {
    throw new Error("reviewer lanes must not duplicate writer authority");
  }

  if (!Array.isArray(assignment.specOrder) || assignment.specOrder.length < 1) {
    throw new Error("specOrder must name at least one stable spec");
  }
  const specOrder = assignment.specOrder.map((specId, index) => assertSpecId(specId, `specOrder[${index}]`));
  if (new Set(specOrder).size !== specOrder.length) {
    throw new Error("specOrder must not repeat a spec");
  }

  assertExactKeys(assignment.delegatedDecision, ["source", "id"], "delegatedDecision");
  if (assignment.delegatedDecision.source !== "BLUEPRINT.md" || assignment.delegatedDecision.id !== "D-038") {
    throw new Error("delegatedDecision must name the approved Blueprint D-038 source");
  }

  const finalOwnerGate = assertTicketReference(assignment.finalOwnerGate, "finalOwnerGate");
  if (!finalOwnerGate.startsWith(`${specOrder.at(-1)}/`)) {
    throw new Error("finalOwnerGate must belong to the final ordered spec");
  }

  assertExactKeys(assignment.proof, ["specEvidence", "demoArtifacts", "remoteRecovery"], "proof");
  for (const [key, value] of Object.entries(assignment.proof)) {
    if (value !== true) throw new Error(`proof.${key} must be required`);
  }
  assertExactStringSet(assignment.stopConditions, REQUIRED_STOP_CONDITIONS, "stopConditions");
  return assignment;
}

function validateChainState(assignment, state) {
  validateChainAssignment(assignment);
  assertExactKeys(state, [
    "schemaVersion",
    "assignmentId",
    "writerId",
    "nextSpecId",
    "lastPushedSha",
    "status",
    "blocker",
    "verificationFailure",
  ], "chain state");
  if (state.schemaVersion !== "1.0" || state.assignmentId !== assignment.id) {
    throw new Error("chain state does not match the validated assignment");
  }
  assertNonEmptyString(state.writerId, "chain state writerId");
  const nextSpecId = assertSpecId(state.nextSpecId, "chain state nextSpecId");
  if (!assignment.specOrder.includes(nextSpecId)) {
    throw new Error("chain state nextSpecId is not permitted by the assignment");
  }
  assertSha(state.lastPushedSha, "chain state lastPushedSha");
  if (!["active", "blocked"].includes(state.status)) {
    throw new Error("chain state has invalid status");
  }
  if (state.status === "active" && state.blocker !== null) {
    throw new Error("active chain state cannot carry a blocker");
  }
  if (state.status === "blocked" && !STOP_CONDITIONS.has(state.blocker)) {
    throw new Error("blocked chain state must name an approved stop condition");
  }
  assertExactKeys(state.verificationFailure, ["signature", "count", "at"], "verificationFailure");
  if (state.verificationFailure.signature !== null) {
    assertNonEmptyString(state.verificationFailure.signature, "verificationFailure.signature");
    if (![1, 2].includes(state.verificationFailure.count)) {
      throw new Error("verificationFailure.count must be one or two");
    }
    assertTimestamp(state.verificationFailure.at, "verificationFailure.at");
  } else if (state.verificationFailure.count !== 0 || state.verificationFailure.at !== null) {
    throw new Error("empty verification failure evidence must be zero/null");
  }
  return state;
}

export function createChainState({ assignment, writerId, nextSpecId, lastPushedSha }) {
  validateChainAssignment(assignment);
  const state = {
    schemaVersion: "1.0",
    assignmentId: assignment.id,
    writerId: assertNonEmptyString(writerId, "writerId"),
    nextSpecId: assertSpecId(nextSpecId, "nextSpecId"),
    lastPushedSha: assertSha(lastPushedSha, "lastPushedSha"),
    status: "active",
    blocker: null,
    verificationFailure: { signature: null, count: 0, at: null },
  };
  return validateChainState(assignment, state);
}

export function createChainResumeReceipt({ assignment, state, claim, branch, remoteSha, at }) {
  validateChainState(assignment, state);
  if (state.status !== "active") {
    throw new Error("blocked chain state cannot resume");
  }
  assertExactKeys(claim, ["specId", "ticketId", "agent"], "active claim");
  if (claim.agent !== state.writerId) {
    throw new Error("active claim writer does not match the chain writer");
  }
  if (assertSpecId(claim.specId, "active claim specId") !== state.nextSpecId) {
    throw new Error("active claim lifecycle spec does not match the next chain spec");
  }
  assertTicketReference(`${claim.specId}/${assertNonEmptyString(claim.ticketId, "active claim ticketId")}`, "active claim");
  if (branch !== assignment.writer.branch) {
    throw new Error("resume branch does not match the assignment integration branch");
  }
  if (assertSha(remoteSha, "remoteSha") !== state.lastPushedSha) {
    throw new Error("resume remote SHA does not match the last pushed chain SHA");
  }
  return {
    assignmentId: assignment.id,
    writerId: state.writerId,
    nextSpecId: state.nextSpecId,
    remoteSha: state.lastPushedSha,
    verifiedAt: assertTimestamp(at, "at"),
  };
}

export function applyVerificationFailure(state, { signature, at }) {
  assertExactKeys(state, [
    "schemaVersion",
    "assignmentId",
    "writerId",
    "nextSpecId",
    "lastPushedSha",
    "status",
    "blocker",
    "verificationFailure",
  ], "chain state");
  if (state.status !== "active") {
    throw new Error("blocked chain state cannot record another verification failure");
  }
  const normalizedSignature = assertNonEmptyString(signature, "verification failure signature");
  const previous = state.verificationFailure;
  const count = previous.signature === normalizedSignature ? previous.count + 1 : 1;
  const next = structuredClone(state);
  next.verificationFailure = {
    signature: normalizedSignature,
    count,
    at: assertTimestamp(at, "verification failure at"),
  };
  if (count >= 2) {
    next.status = "blocked";
    next.blocker = "verification_failure_repeated_twice";
  }
  return next;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(argv) {
  const [command, path] = argv;
  if (command === "validate" && path && argv.length === 2) {
    const assignment = validateChainAssignment(readJson(path));
    process.stdout.write(`${JSON.stringify({ ok: true, id: assignment.id, project: assignment.project.id })}\n`);
    return;
  }
  throw new Error("usage: captain-chain.mjs validate ASSIGNMENT.json");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
