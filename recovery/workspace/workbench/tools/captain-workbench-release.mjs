#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findRepoRoot } from "./workspace-paths.mjs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GH_PATH = "/opt/homebrew/bin/gh";
// `Scheduled/` and `.local/` below are workspace paths. Two `dirname` calls
// reached the workspace before the tools lane moved under `workbench/`.
const ROOT = realpathSync(findRepoRoot(dirname(fileURLToPath(import.meta.url))));
const MANIFEST_PATH = join(ROOT, "Scheduled", "Captain", "workbench-release-pr34.json");
const CONTRACT_PATH = join(ROOT, "Scheduled", "Captain", "workbench-release-contract.json");
const SPOOL_ROOT = join(ROOT, ".local", "captain-workbench-release");
const EXPECTED_REPOSITORY_URL = "https://github.com/example/LLM_Workbench";
const EXPECTED_MANIFEST = Object.freeze({
  schemaVersion: "1.0",
  repository: "example/LLM_Workbench",
  sourceBranch: "integration",
  destinationBranch: "main",
  mainSha: "dd1ed326a1d55e1f2303aa233cc4d1bf6a0a4270",
  integrationSha: "60f62917d4ed1ae8000478d62fab56a7afc54816",
  pullRequestNumber: 34,
  releaseGateContext: "gptos/workbench-release-gate",
  releaseGateStatusId: 50582189853,
  evidenceUrl: "https://github.com/example/LLM_Workbench/pull/33#issuecomment-4992316390",
  auditorSummary: "PASS: Workbench integration 60f6291 is clean, exact, fully verified, and ready for evidence publication.",
  fingerprint: "1f126b2c1566505176ef4cfa700c30d9f173d3df06e4a6d6ddae63200b611625",
});
const REQUEST_KEYS = Object.freeze([
  "approvedAt",
  "candidate",
  "dispatchedAt",
  "executionClaimId",
  "operationId",
  "schemaVersion",
  "taskType",
].sort());
const RESULT_KEYS = Object.freeze([
  "completedAt",
  "executionClaimId",
  "operationId",
  "outcome",
  "requestSha256",
  "schemaVersion",
  "taskType",
].sort());
const APPLIED_OUTCOME_KEYS = Object.freeze(["evidenceUrl", "mergeSha", "status"].sort());
const FAILURE_OUTCOME_KEYS = Object.freeze(["code", "detail", "status"].sort());
const MANIFEST_KEYS = Object.freeze(Object.keys(EXPECTED_MANIFEST).sort());
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const REQUEST_MAX_AGE_MS = 15 * 60 * 1000;
export const REQUEST_MAX_FUTURE_SKEW_MS = 60 * 1000;
export const REQUEST_MAX_BYTES = 64 * 1024;
export const RESULT_MAX_BYTES = 16 * 1024;

function loadReleaseContract(path) {
  let contract;
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("contract is a symbolic link");
    contract = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("shared Workbench release contract is unreadable or invalid");
  }
  const keys = [
    "appliedEvidenceUrlPrefix",
    "failureCodes",
    "processArgument",
    "schemaVersion",
    "taskType",
  ].sort();
  if (!contract || typeof contract !== "object" || Array.isArray(contract)
    || Object.keys(contract).sort().join("\n") !== keys.join("\n")
    || contract.schemaVersion !== "1.0"
    || contract.taskType !== "workbench_release"
    || contract.processArgument !== "<absolute-request-path>"
    || contract.appliedEvidenceUrlPrefix !== `${EXPECTED_REPOSITORY_URL}/commit/`
    || !Array.isArray(contract.failureCodes)
    || contract.failureCodes.length === 0
    || contract.failureCodes.some((code) => typeof code !== "string" || !/^[a-z_]+$/.test(code))
    || new Set(contract.failureCodes).size !== contract.failureCodes.length
    || [...contract.failureCodes].sort().join("\n") !== contract.failureCodes.join("\n")) {
    throw new Error("shared Workbench release contract does not match its exact schema");
  }
  return contract;
}

const RELEASE_CONTRACT = Object.freeze(loadReleaseContract(CONTRACT_PATH));
export const FAILURE_CODES = Object.freeze([...RELEASE_CONTRACT.failureCodes]);
const FAILURE_CODE_SET = new Set(FAILURE_CODES);

class ReleaseError extends Error {
  constructor(status, code, detail, { quarantine = false } = {}) {
    const safeCode = FAILURE_CODE_SET.has(code) ? code : "internal_error";
    super(safeCode === code ? detail : "release worker failed closed");
    this.status = status;
    this.code = safeCode;
    this.detail = safeCode === code ? detail : "release worker failed closed";
    this.quarantine = quarantine;
  }
}

function sameExactObject(actual, expected) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.every((key) => actual[key] === expected[key]);
}

function requireIsoTimestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ReleaseError("rejected", "invalid_request", `${label} must be an ISO timestamp`, { quarantine: true });
  }
  if (new Date(value).toISOString() !== value) {
    throw new ReleaseError("rejected", "invalid_request", `${label} must be canonical ISO-8601`, { quarantine: true });
  }
  return value;
}

function manifestFingerprint(manifest) {
  const preimage = [
    manifest.repository,
    manifest.mainSha,
    manifest.integrationSha,
    manifest.pullRequestNumber,
    manifest.releaseGateStatusId,
  ].join(" | ");
  return createHash("sha256").update(preimage, "utf8").digest("hex");
}

function loadManifest(path) {
  let parsed;
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("manifest is a symbolic link");
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ReleaseError("blocked", "manifest_invalid", "immutable release manifest is unreadable or invalid");
  }
  if (!sameExactObject(parsed, EXPECTED_MANIFEST)
    || Object.keys(parsed).sort().join("\n") !== MANIFEST_KEYS.join("\n")
    || manifestFingerprint(parsed) !== EXPECTED_MANIFEST.fingerprint) {
    throw new ReleaseError("blocked", "manifest_invalid", "immutable release manifest does not match the approved contract");
  }
  return parsed;
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensurePrivateDirectory(path) {
  const before = lstatIfPresent(path);
  if (before?.isSymbolicLink() || (before && !before.isDirectory())) {
    throw new ReleaseError("blocked", "spool_invalid", "release spool requires real directories");
  }
  if (!before) mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}

function ensureSpool(workspaceRoot, root) {
  let canonicalWorkspace;
  try {
    canonicalWorkspace = realpathSync(workspaceRoot);
  } catch {
    throw new ReleaseError("blocked", "spool_invalid", "workspace root is unavailable");
  }
  const requestedRoot = resolve(root);
  const withinWorkspace = relative(canonicalWorkspace, requestedRoot);
  if (!withinWorkspace || withinWorkspace === ".." || withinWorkspace.startsWith(`..${sep}`)
    || isAbsolute(withinWorkspace)) {
    throw new ReleaseError("blocked", "spool_invalid", "release spool must stay below the canonical workspace root");
  }

  let current = canonicalWorkspace;
  const components = withinWorkspace.split(sep);
  for (const component of components) {
    current = join(current, component);
    const entry = lstatIfPresent(current);
    if (entry?.isSymbolicLink() || (entry && !entry.isDirectory())) {
      throw new ReleaseError("blocked", "spool_invalid", "release spool ancestors must be real directories");
    }
    if (!entry) mkdirSync(current, { mode: 0o700 });
  }
  const canonicalSpool = realpathSync(requestedRoot);
  const canonicalRelative = relative(canonicalWorkspace, canonicalSpool);
  if (!canonicalRelative || canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`)
    || isAbsolute(canonicalRelative)) {
    throw new ReleaseError("blocked", "spool_invalid", "release spool resolved outside the canonical workspace root");
  }
  chmodSync(canonicalSpool, 0o700);
  const paths = Object.fromEntries(
    ["requests", "processing", "results", "quarantine"].map((name) => {
      const path = join(canonicalSpool, name);
      ensurePrivateDirectory(path);
      return [name, path];
    })
  );
  return paths;
}

function requestFilename(operationId, executionClaimId) {
  return `${operationId}.${executionClaimId}.json`;
}

function validateRequest(parsed, filename, manifest) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed).sort().join("\n") !== REQUEST_KEYS.join("\n")) {
    throw new ReleaseError("rejected", "invalid_request", "request must use the exact workbench-release schema", { quarantine: true });
  }
  if (parsed.schemaVersion !== "1.0" || parsed.taskType !== "workbench_release") {
    throw new ReleaseError("rejected", "invalid_request", "request schemaVersion or taskType is not allowlisted", { quarantine: true });
  }
  if (!ID_PATTERN.test(parsed.operationId) || !ID_PATTERN.test(parsed.executionClaimId)) {
    throw new ReleaseError("rejected", "invalid_request", "operation and claim identifiers are invalid", { quarantine: true });
  }
  if (filename !== requestFilename(parsed.operationId, parsed.executionClaimId)) {
    throw new ReleaseError("rejected", "invalid_request", "request filename does not match its identifiers", { quarantine: true });
  }
  const approvedAt = requireIsoTimestamp(parsed.approvedAt, "approvedAt");
  const dispatchedAt = requireIsoTimestamp(parsed.dispatchedAt, "dispatchedAt");
  if (Date.parse(approvedAt) > Date.parse(dispatchedAt)) {
    throw new ReleaseError("rejected", "invalid_request", "approval cannot follow dispatch", { quarantine: true });
  }
  if (!sameExactObject(parsed.candidate, manifest)) {
    throw new ReleaseError("rejected", "candidate_mismatch", "candidate does not match the immutable approved release", { quarantine: true });
  }
  return parsed;
}

function validateFreshAuthorization(parsed, capturedNow) {
  const nowMs = Date.parse(requireIsoTimestamp(capturedNow, "captured worker time"));
  const approvedMs = Date.parse(parsed.approvedAt);
  const dispatchedMs = Date.parse(parsed.dispatchedAt);
  if (approvedMs > nowMs + REQUEST_MAX_FUTURE_SKEW_MS
    || dispatchedMs > nowMs + REQUEST_MAX_FUTURE_SKEW_MS) {
    throw new ReleaseError("rejected", "invalid_request", "request timestamp exceeds the allowed future skew", { quarantine: true });
  }
  if (nowMs - approvedMs > REQUEST_MAX_AGE_MS || nowMs - dispatchedMs > REQUEST_MAX_AGE_MS) {
    throw new ReleaseError("rejected", "invalid_request", "request authorization is stale", { quarantine: true });
  }
}

function scrubEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) =>
    key !== "WORKBENCH_GITHUB_TOKEN"
      && !(/^(?:GH|GITHUB)(?:_|$)/i.test(key) && /(?:TOKEN|PAT|AUTH)/i.test(key))
  ));
}

function releaseError(code, detail) {
  return new ReleaseError("blocked", code, detail);
}

async function ghApi(ghPath, env, args) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(ghPath, ["api", ...args], {
      encoding: "utf8",
      env: scrubEnvironment(env),
      maxBuffer: 1024 * 1024,
      shell: false,
      timeout: 30_000,
      windowsHide: true,
    }));
  } catch {
    throw releaseError("github_unavailable", "GitHub command failed without a verified release outcome");
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw releaseError("github_response_invalid", "GitHub returned invalid JSON");
  }
}

function exactRef(response, expected, label) {
  const sha = response?.object?.sha;
  if (!SHA_PATTERN.test(sha) || sha !== expected) {
    throw releaseError("ref_mismatch", `${label} does not match the immutable release manifest`);
  }
}

function exactPullRequest(pr, manifest) {
  return pr?.number === manifest.pullRequestNumber
    && pr.state === "open"
    && pr.draft === false
    && pr.mergeable === true
    && pr.merged === false
    && pr.head?.ref === manifest.sourceBranch
    && pr.head?.sha === manifest.integrationSha
    && pr.base?.ref === manifest.destinationBranch
    && pr.base?.sha === manifest.mainSha;
}

async function inspectRemote({ ghPath, env, manifest }) {
  const repo = await ghApi(ghPath, env, [`repos/${manifest.repository}`]);
  if (repo?.full_name !== manifest.repository || repo?.html_url !== EXPECTED_REPOSITORY_URL) {
    throw releaseError("remote_mismatch", "GitHub repository identity does not match the fixed release target");
  }
  // Keep reads ordered so each later check is based on one bounded observation
  // sequence and test doubles can model state transitions deterministically.
  const mainRef = await ghApi(ghPath, env, [
    `repos/${manifest.repository}/git/ref/heads/${manifest.destinationBranch}`,
  ]);
  const integrationRef = await ghApi(ghPath, env, [
    `repos/${manifest.repository}/git/ref/heads/${manifest.sourceBranch}`,
  ]);
  const pr = await ghApi(ghPath, env, [
    `repos/${manifest.repository}/pulls/${manifest.pullRequestNumber}`,
  ]);
  return { repo, mainRef, integrationRef, pr };
}

async function verifyMerged({ ghPath, env, manifest, inspected = null, expectedMergeSha = null }) {
  const current = inspected ?? await inspectRemote({ ghPath, env, manifest });
  const mergeSha = current.pr?.merge_commit_sha;
  if (current.pr?.merged !== true || current.pr?.state !== "closed"
    || current.pr?.head?.ref !== manifest.sourceBranch
    || current.pr?.head?.sha !== manifest.integrationSha
    || current.pr?.base?.ref !== manifest.destinationBranch
    || current.pr?.base?.sha !== manifest.mainSha
    || !SHA_PATTERN.test(mergeSha)
    || (expectedMergeSha !== null && mergeSha !== expectedMergeSha)) {
    throw releaseError("post_merge_mismatch", "pull request does not prove the exact approved merge");
  }
  exactRef(current.mainRef, mergeSha, "remote main");
  exactRef(current.integrationRef, manifest.integrationSha, "remote integration");
  const commit = await ghApi(ghPath, env, [`repos/${manifest.repository}/git/commits/${mergeSha}`]);
  if (commit?.sha !== mergeSha
    || !Array.isArray(commit.parents)
    || commit.parents.length !== 2
    || commit.parents[0]?.sha !== manifest.mainSha
    || commit.parents[1]?.sha !== manifest.integrationSha) {
    throw releaseError("post_merge_mismatch", "remote main is not the exact two-parent approved merge commit");
  }
  return mergeSha;
}

async function verifyOpenRelease({ ghPath, env, manifest, inspected }) {
  exactRef(inspected.mainRef, manifest.mainSha, "remote main");
  exactRef(inspected.integrationRef, manifest.integrationSha, "remote integration");
  if (!exactPullRequest(inspected.pr, manifest)) {
    throw releaseError("pull_request_mismatch", "pull request is not open, non-draft, mergeable, and bound to the exact approved refs");
  }
  const comparison = await ghApi(ghPath, env, [
    `repos/${manifest.repository}/compare/${manifest.mainSha}...${manifest.integrationSha}`,
  ]);
  if (comparison?.status !== "ahead" || comparison?.behind_by !== 0
    || comparison?.base_commit?.sha !== manifest.mainSha
    || comparison?.merge_base_commit?.sha !== manifest.mainSha
    || !Array.isArray(comparison?.commits)
    || comparison.commits.length < 1
    || comparison.commits.at(-1)?.sha !== manifest.integrationSha) {
    throw releaseError("ancestry_mismatch", "integration is not the exact zero-behind descendant of main");
  }
  const statuses = await ghApi(ghPath, env, [
    `repos/${manifest.repository}/statuses/${manifest.integrationSha}?per_page=100`,
  ]);
  const status = Array.isArray(statuses)
    ? statuses.find(({ id }) => id === manifest.releaseGateStatusId)
    : null;
  if (!status || status.state !== "success"
    || status.context !== manifest.releaseGateContext
    || status.target_url !== manifest.evidenceUrl
    || status.description !== manifest.auditorSummary
    || manifestFingerprint(manifest) !== manifest.fingerprint) {
    throw releaseError("release_gate_mismatch", "release-gate status or evidence does not match the immutable approval");
  }
}

export async function preflightOne({ manifestPath, ghPath, env = process.env }) {
  const manifest = loadManifest(manifestPath);
  const inspected = await inspectRemote({ ghPath, env, manifest });
  if (inspected.pr?.merged === true) {
    const mergeSha = await verifyMerged({ ghPath, env, manifest, inspected });
    return {
      status: "already_applied",
      mergeSha,
      evidenceUrl: `${RELEASE_CONTRACT.appliedEvidenceUrlPrefix}${mergeSha}`,
    };
  }
  await verifyOpenRelease({ ghPath, env, manifest, inspected });
  return {
    status: "ready",
    repository: manifest.repository,
    pullRequestNumber: manifest.pullRequestNumber,
    integrationSha: manifest.integrationSha,
    evidenceUrl: manifest.evidenceUrl,
    fingerprint: manifest.fingerprint,
  };
}

async function executeRelease({ ghPath, env, manifest, request, now }) {
  const inspected = await inspectRemote({ ghPath, env, manifest });
  if (inspected.pr?.merged === true) {
    return verifyMerged({ ghPath, env, manifest, inspected });
  }
  await verifyOpenRelease({ ghPath, env, manifest, inspected });
  validateFreshAuthorization(request, now());

  let mergeResponse;
  try {
    mergeResponse = await ghApi(ghPath, env, [
      "--method",
      "PUT",
      `repos/${manifest.repository}/pulls/${manifest.pullRequestNumber}/merge`,
      "-f",
      "merge_method=merge",
      "-f",
      `sha=${manifest.integrationSha}`,
    ]);
  } catch (error) {
    if (!(error instanceof ReleaseError) || error.code !== "github_unavailable") throw error;
    return verifyMerged({ ghPath, env, manifest });
  }
  if (mergeResponse?.merged !== true || !SHA_PATTERN.test(mergeResponse.sha)) {
    throw releaseError("merge_failed", "GitHub did not confirm the approved merge");
  }
  return verifyMerged({
    ghPath,
    env,
    manifest,
    expectedMergeSha: mergeResponse.sha,
  });
}

function atomicWriteJson(path, value) {
  const temp = join(dirname(path), `.${randomUUID()}.tmp`);
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(temp, 0o600);
  try {
    // Publishing a fully flushed hard link is atomic and refuses to overwrite a
    // result won by another worker, unlike POSIX rename's replace behavior.
    linkSync(temp, path);
  } catch (error) {
    unlinkSync(temp);
    if (error?.code === "EEXIST") {
      throw releaseError("result_conflict", "result already exists for this operation claim");
    }
    throw error;
  }
  unlinkSync(temp);
  chmodSync(path, 0o600);
}

function protectedFileBytes(path, maxBytes, errorFactory) {
  let before;
  try {
    before = lstatSync(path);
  } catch {
    throw errorFactory("file is unavailable");
  }
  if (before.isSymbolicLink() || !before.isFile() || (before.mode & 0o777) !== 0o600
    || before.size < 1 || before.size > maxBytes) {
    throw errorFactory("file must be a bounded mode-0600 regular file");
  }

  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isFile() || (opened.mode & 0o777) !== 0o600
      || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.size < 1 || opened.size > maxBytes) {
      throw errorFactory("file identity, mode, or bounded size changed before read");
    }
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (count === 0) throw errorFactory("file ended before its declared size");
      offset += count;
    }
    const extra = Buffer.alloc(1);
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw errorFactory("file grew beyond its bounded size during read");
    }
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size) {
      throw errorFactory("file changed during read");
    }
    return bytes;
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    throw errorFactory("file could not be read safely");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\n") === keys.join("\n");
}

function validateExistingResult(result, requestSha256, request) {
  const exactIdentity = exactKeys(result, RESULT_KEYS)
    && result.schemaVersion === "1.0"
    && result.taskType === "workbench_release"
    && result.operationId === request.operationId
    && result.executionClaimId === request.executionClaimId
    && result.requestSha256 === requestSha256
    && /^[0-9a-f]{64}$/.test(result.requestSha256);
  let exactOutcome = false;
  if (exactKeys(result?.outcome, APPLIED_OUTCOME_KEYS)) {
    exactOutcome = result.outcome.status === "applied"
      && SHA_PATTERN.test(result.outcome.mergeSha)
      && result.outcome.evidenceUrl === `${RELEASE_CONTRACT.appliedEvidenceUrlPrefix}${result.outcome.mergeSha}`;
  } else if (exactKeys(result?.outcome, FAILURE_OUTCOME_KEYS)) {
    exactOutcome = ["blocked", "rejected"].includes(result.outcome.status)
      && FAILURE_CODE_SET.has(result.outcome.code)
      && typeof result.outcome.detail === "string"
      && result.outcome.detail.length > 0
      && result.outcome.detail.length <= 256
      && !/[\u0000-\u001f\u007f]/.test(result.outcome.detail);
  }
  if (!exactIdentity || !exactOutcome) {
    throw releaseError("result_conflict", "existing result does not match the exact claimed-request schema");
  }
  try {
    requireIsoTimestamp(result.completedAt, "completedAt");
  } catch {
    throw releaseError("result_conflict", "existing result has an invalid completion timestamp");
  }
  return result;
}

function existingResult(path, requestSha256, request) {
  if (!lstatIfPresent(path)) return null;
  let result;
  try {
    const bytes = protectedFileBytes(
      path,
      RESULT_MAX_BYTES,
      (detail) => releaseError("result_conflict", `existing result ${detail}`)
    );
    result = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof ReleaseError) throw error;
    throw releaseError("result_conflict", "existing result is invalid");
  }
  return validateExistingResult(result, requestSha256, request);
}

function selectClaim(paths, requestPath = null) {
  if (requestPath !== null) {
    const absoluteRequest = resolve(requestPath);
    const requestsRoot = resolve(paths.requests);
    const filename = basename(absoluteRequest);
    if (!isAbsolute(requestPath)
      || dirname(absoluteRequest) !== requestsRoot
      || absoluteRequest !== join(requestsRoot, filename)
      || !filename.endsWith(".json")) {
      throw releaseError("invalid_request", "process request path must name one JSON file in the fixed requests spool");
    }
    const processingPath = join(paths.processing, filename);
    if (existsSync(processingPath)) {
      if (existsSync(absoluteRequest)) {
        throw releaseError("spool_conflict", "request exists in both queued and processing state");
      }
      return { filename, path: processingPath };
    }
    if (!existsSync(absoluteRequest)) {
      throw releaseError("claim_conflict", "requested release claim does not exist");
    }
    try {
      renameSync(absoluteRequest, processingPath);
    } catch {
      throw releaseError("claim_conflict", "request could not be atomically claimed");
    }
    return { filename, path: processingPath };
  }
  const processing = readdirSync(paths.processing).filter((name) => name.endsWith(".json")).sort();
  if (processing.length > 1) {
    throw releaseError("spool_conflict", "more than one request is already processing");
  }
  if (processing.length === 1) {
    return { filename: processing[0], path: join(paths.processing, processing[0]) };
  }
  const queued = readdirSync(paths.requests).filter((name) => name.endsWith(".json")).sort();
  if (queued.length === 0) return null;
  const filename = queued[0];
  const from = join(paths.requests, filename);
  const path = join(paths.processing, filename);
  try {
    renameSync(from, path);
  } catch {
    throw releaseError("claim_conflict", "request could not be atomically claimed");
  }
  return { filename, path };
}

function quarantineClaim(claim, paths) {
  const target = join(paths.quarantine, claim.filename);
  if (existsSync(target)) return;
  try {
    renameSync(claim.path, target);
  } catch {
    // The result remains authoritative; a concurrent claim move fails closed.
  }
}

export async function runOne({
  manifestPath,
  spoolRoot,
  workspaceRoot = ROOT,
  ghPath,
  now = () => new Date().toISOString(),
  env = process.env,
  requestPath = null,
}) {
  const manifest = loadManifest(manifestPath);
  const paths = ensureSpool(workspaceRoot, spoolRoot);
  const claim = selectClaim(paths, requestPath);
  if (!claim) return { status: "no_request" };
  const capturedNow = now();

  let bytes;
  let parsed;
  let requestSha256;
  try {
    bytes = protectedFileBytes(
      claim.path,
      REQUEST_MAX_BYTES,
      (detail) => new ReleaseError("rejected", "invalid_request", `request ${detail}`, { quarantine: true })
    );
    requestSha256 = createHash("sha256").update(bytes).digest("hex");
    parsed = JSON.parse(bytes.toString("utf8"));
    validateRequest(parsed, claim.filename, manifest);
  } catch (error) {
    if (!(error instanceof ReleaseError)) {
      error = new ReleaseError("rejected", "invalid_request", "request JSON is invalid", { quarantine: true });
    }
    const filenameMatch = /^([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.([A-Za-z0-9][A-Za-z0-9_-]{0,127})\.json$/.exec(claim.filename);
    const operationId = parsed?.operationId ?? filenameMatch?.[1];
    const executionClaimId = parsed?.executionClaimId ?? filenameMatch?.[2];
    if (!ID_PATTERN.test(operationId ?? "") || !ID_PATTERN.test(executionClaimId ?? "")) {
      quarantineClaim(claim, paths);
      return { status: "rejected", code: "invalid_request", detail: "request identifiers are invalid" };
    }
    const result = {
      schemaVersion: "1.0",
      taskType: "workbench_release",
      operationId,
      executionClaimId,
      requestSha256: requestSha256 ?? createHash("sha256").update(bytes ?? Buffer.alloc(0)).digest("hex"),
      completedAt: capturedNow,
      outcome: { status: error.status, code: error.code, detail: error.detail },
    };
    atomicWriteJson(join(paths.results, requestFilename(operationId, executionClaimId)), result);
    if (error.quarantine) quarantineClaim(claim, paths);
    return result.outcome;
  }

  const resultPath = join(paths.results, claim.filename);
  const prior = existingResult(resultPath, requestSha256, parsed);
  if (prior?.outcome.status === "applied") {
    const mergeSha = await verifyMerged({
      ghPath,
      env,
      manifest,
      expectedMergeSha: prior.outcome.mergeSha,
    });
    return {
      status: "applied",
      mergeSha,
      evidenceUrl: `${RELEASE_CONTRACT.appliedEvidenceUrlPrefix}${mergeSha}`,
    };
  }
  if (prior) return prior.outcome;

  let outcome;
  try {
    validateFreshAuthorization(parsed, capturedNow);
    const mergeSha = await executeRelease({ ghPath, env, manifest, request: parsed, now });
    outcome = {
      status: "applied",
      mergeSha,
      evidenceUrl: `${RELEASE_CONTRACT.appliedEvidenceUrlPrefix}${mergeSha}`,
    };
  } catch (error) {
    const safe = error instanceof ReleaseError
      ? error
      : releaseError("internal_error", "release worker failed closed");
    outcome = { status: safe.status, code: safe.code, detail: safe.detail };
    if (safe.quarantine) quarantineClaim(claim, paths);
  }
  const result = {
    schemaVersion: "1.0",
    taskType: "workbench_release",
    operationId: parsed.operationId,
    executionClaimId: parsed.executionClaimId,
    requestSha256,
    completedAt: capturedNow,
    outcome,
  };
  atomicWriteJson(resultPath, result);
  return outcome;
}

export function parseCliArgs(args) {
  if (args.length === 1 && args[0] === "preflight") {
    return { command: "preflight" };
  }
  if (args.length === 2 && args[0] === "process" && isAbsolute(args[1])) {
    return { command: "process", requestPath: args[1] };
  }
  throw new ReleaseError(
    "rejected",
    "invalid_request",
    "usage: node tools/captain-workbench-release.mjs preflight | process ABSOLUTE_REQUEST_PATH"
  );
}

async function main() {
  const request = parseCliArgs(process.argv.slice(2));
  const outcome = request.command === "preflight"
    ? await preflightOne({ manifestPath: MANIFEST_PATH, ghPath: GH_PATH })
    : await runOne({
      manifestPath: MANIFEST_PATH,
      spoolRoot: SPOOL_ROOT,
      ghPath: GH_PATH,
      requestPath: request.requestPath,
    });
  process.stdout.write(`${JSON.stringify(outcome)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const outcome = error instanceof ReleaseError
      ? { status: error.status, code: error.code, detail: error.detail }
      : { status: "blocked", code: "internal_error", detail: "release worker failed closed" };
    process.stderr.write(`${JSON.stringify(outcome)}\n`);
    process.exitCode = 1;
  });
}
