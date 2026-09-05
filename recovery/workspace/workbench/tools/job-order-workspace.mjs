#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { devNull, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSpecEvidence,
  parseEvidenceTableRow,
  parseSpecEvidenceDeclaration,
  sensitiveContentCodes,
} from "../../Foundry/Halls/Forge/tools/spec-evidence.mjs";
import { laneRelative } from "./workspace-paths.mjs";

const FILE_LIMIT = 64 * 1024;
const WORKSPACE_LIMIT = 512 * 1024;
const REQUIRED_ORDER_FILES = new Set([
  "CLAIM.md",
  "CONTEXT.md",
  "JOB_ORDER.md",
  "handoffs",
]);
const REQUIRED_ORDER_HEADINGS = [
  "Canon Issuance",
  "Intended Result",
  "Scope And Repository",
  "Required Gates And Proof",
  "Recovery",
  "Exclusions And Stop Conditions",
];
const CLAIM_FIELDS = [
  "Disposition",
  "Claimant",
  "Run FUID",
  "Current stage",
  "Writer lane",
  "Accepted handoff receipt",
  "Accepted handoff digest",
  "Decision mode",
  "Waiting on the owner",
];
const RECEIPT_FIELDS = [
  "Job Order",
  "Spec",
  "Ticket",
  "Sequence",
  "Receipt FUID",
  "Run FUID",
  "Claimant",
  "From",
  "Next",
  "Outgoing role",
  "Receiving role",
  "Prior receipt",
  "Prior digest",
  "Repository",
  "Worktree",
  "Branch",
  "Base SHA",
  "Candidate SHA",
  "Target SHA",
  "Allowed scope",
  "Prohibited scope",
  "Checks",
  "Gates",
  "Unknowns",
  "Freshness fingerprint",
  "Invalidation conditions",
  "Next action",
  "Resume phrase",
  "Exclusions",
];
const STAGES = [
  "sitrep",
  "preflight",
  "launch-flight",
  "in-flight",
  "landing-check",
  "land",
  "postflight-check",
];
const STAGE_PATTERN = STAGES.map((stage) => stage.replaceAll("-", "\\-")).join("|");
const RECEIPT_NAME = new RegExp(
  `^(\\d{3})-([0-9A-Z]{6})-(${STAGE_PATTERN})-to-(${STAGE_PATTERN})-([0-9A-Z]{6})\\.md$`,
);
const FULL_SHA = /^[0-9a-f]{40}$/;
const CANON_ARCHIVE_REMOTE = "https://github.com/example/workspace.git";
const CANON_ARCHIVE_REF = "refs/heads/integration";
const CANON_ARCHIVE_GIT_PATH = "/usr/bin/git";
const CANON_ARCHIVE_GH_PATH = "/opt/homebrew/bin/gh";
const CANON_ARCHIVE_GIT_TEMP_ROOT = "/private/tmp";
const CANON_ARCHIVE_GIT_TEMP_PREFIX = "gpt-os-canon-archive-authority-";
const CANON_ARCHIVE_GIT_ENV_KEYS = ["TMPDIR", "TMP", "TEMP"];
const CANON_ARCHIVE_GIT_ARGS = [
  "-c",
  "credential.helper=",
  "-c",
  `credential.https://github.com.helper=!${CANON_ARCHIVE_GH_PATH} auth git-credential`,
  "ls-remote",
  "--refs",
];
const TERMINAL = new Set(["closed-complete", "closed-blocked", "closed-aborted"]);
const LAUNCH_MODEL_SCHEMA = "gpt-os.job-order-launch.v2";
const TERMINAL_HISTORY_SCHEMA = "gpt-os.job-order-workspace.v1-terminal-history";
const TK013_RECEIPT = "TK-012_LAUNCH_RECEIPT.json";
const TK013_COMPONENTS = [
  ["SPEC", "SPEC.md", 23642],
  ["JOB_ORDER", "job-orders/JO-00007U-preflight-local-day-freshness/JOB_ORDER.md", 26974],
  ["CLAIM", "job-orders/JO-00007U-preflight-local-day-freshness/CLAIM.md", 7786],
  ["CONTEXT", "job-orders/JO-00007U-preflight-local-day-freshness/CONTEXT.md", 12827],
  ["GROUNDING_PRE_R5", "GROUNDING_PRE_R5.md", 19795],
  ["GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR", "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md", 44224],
];

function add(errors, code, filePath, detail) {
  errors.push({ code, path: filePath, detail });
}

function sorted(errors) {
  return errors.sort((a, b) =>
    a.code.localeCompare(b.code)
      || a.path.localeCompare(b.path)
      || a.detail.localeCompare(b.detail));
}

export function validateTk013Accounting({ components, receiptBytes, receiptCount = 1 }) {
  const errors = [];
  const expected = new Map(TK013_COMPONENTS.map(([name, , baselineBytes]) => [name, baselineBytes]));
  const seen = new Set();
  for (const component of components || []) {
    if (!expected.has(component.name)) add(errors, "accounting.component-extra", component.name || ".", "counted component is not in the R10 baseline");
    else if (seen.has(component.name)) add(errors, "accounting.component-duplicate", component.name, "counted component appears more than once");
    else seen.add(component.name);
    if (!Number.isInteger(component.actualBytes) || component.actualBytes < 0) add(errors, "accounting.size-invalid", component.name || ".", "component byte size must be a non-negative integer");
    else if (component.actualBytes >= FILE_LIMIT) add(errors, "accounting.file-too-large", component.name, `counted file must be smaller than ${FILE_LIMIT} bytes`);
    if (expected.has(component.name) && component.baselineBytes !== expected.get(component.name)) add(errors, "accounting.baseline-mismatch", component.name, "component baseline does not match R10");
  }
  for (const name of expected.keys()) if (!seen.has(name)) add(errors, "accounting.component-missing", name, "R10 baseline component is missing");
  if (receiptCount !== 1) add(errors, "accounting.receipt-count", TK013_RECEIPT, "receipt must be counted exactly once");
  if (!Number.isInteger(receiptBytes) || receiptBytes < 0) add(errors, "accounting.size-invalid", TK013_RECEIPT, "receipt byte size must be a non-negative integer");
  const unique = (components || []).filter((item, index, all) => expected.has(item.name) && all.findIndex((candidate) => candidate.name === item.name) === index);
  const formulaTotal = 135248 + (Number.isInteger(receiptBytes) ? receiptBytes : 0)
    + unique.reduce((sum, item) => sum + item.actualBytes - item.baselineBytes, 0);
  const actualTotal = (Number.isInteger(receiptBytes) ? receiptBytes : 0)
    + unique.reduce((sum, item) => sum + item.actualBytes, 0);
  if (formulaTotal !== actualTotal) add(errors, "accounting.sum-mismatch", ".", "R10 formula does not equal the actual counted byte sum");
  if (actualTotal >= WORKSPACE_LIMIT) add(errors, "accounting.workspace-too-large", ".", `counted aggregate must be smaller than ${WORKSPACE_LIMIT} bytes`);
  return { errors: sorted(errors), formulaTotal, actualTotal };
}

export function validateTk013Receipt(value, bytes, sourceText = null) {
  const errors = [];
  const at = (code, detail) => add(errors, code, TK013_RECEIPT, detail);
  if (bytes > 4096) at("receipt.file-too-large", "receipt exceeds 4096 bytes");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    at("receipt.schema", "receipt must be a JSON object");
    return sorted(errors);
  }
  if (value.schema !== "gpt-os.preflight-receipt.v1" || value.ticket !== "TK-012") at("receipt.schema", "receipt schema or ticket identity is invalid");
  const serialized = JSON.stringify(value);
  if (/https?:\/\/|(?:^|["'])\/(?:Users|private|tmp|var)\/|refs\/(?:heads|remotes|private)|(?:host(?:name)?|commandPath|absolutePath|refInventory|credential|token|password)\s*["']?\s*:/i.test(serialized)) {
    at("receipt.privacy", "receipt contains prohibited URL, host, path, ref inventory, or credential data");
  }
  if (!Array.isArray(value.observations) || value.observations.length !== 2
      || value.observations?.[0]?.provenance !== "authoritative-historical-pre-claim"
      || value.observations?.[1]?.provenance !== "corroborating-corrected-candidate-replay") {
    at("receipt.provenance", "receipt must preserve the two ordered distinct provenance observations");
  }
  const expected = [
    [36, 18941, "f2e89983ae68587a38fc0cfc277b28b61c9407c3120f87e495dad8af60855b68"],
    [37, 19424, "2ef6b49ff12b71cf3ae0dbf89dbf282e819a34fdd6189e03bbf1bd74b2e05f1f"],
  ];
  for (const [index, observation] of (value.observations || []).entries()) {
    const tuple = expected[index];
    if (!tuple) continue;
    if (observation.status !== "pass" || observation.exitCode !== 0 || observation.freshnessRecords !== tuple[0]
        || observation.artifactBytesIncludingFinalLf !== tuple[1]
        || !observation.counts || Object.keys(observation.counts).sort().join(",") !== "blocking,failures,findings,freshnessErrors,reconcilable"
        || Object.values(observation.counts).some((count) => count !== 0)) at("receipt.count", "observation status, record count, or zero-count bands are invalid");
    if (observation.artifactSha256WithoutFinalLf !== tuple[2] || !/^[0-9a-f]{64}$/.test(observation.artifactSha256WithoutFinalLf || "")) at("receipt.digest", "observation digest is invalid");
    if (observation.rawArtifactAvailable !== false || observation.rawArtifactUnavailableReason !== "temporary proof root was removed after capture") at("receipt.raw-availability", "raw-artifact availability must truthfully record removed temporary proof storage");
  }
  if (value.observations?.[0]?.checkedAt !== "2026-08-28T11:44:27.986Z") at("receipt.provenance", "authoritative observation timestamp is invalid");
  if (value.replayEquivalent !== false) at("receipt.replay-equivalence", "corroborating replay must not be represented as byte-equivalent");
  const projection = value.projection;
  const projectionKeys = projection && typeof projection === "object" && !Array.isArray(projection)
    ? Object.keys(projection).sort()
    : [];
  const allowedProjectionKeys = ["digests", "errorCounts", "freshnessRecords", "status"];
  if (!projection || typeof projection !== "object" || Array.isArray(projection)
      || projectionKeys.join(",") !== allowedProjectionKeys.join(",")) {
    at("receipt.projection-schema", "projection must contain exactly status, digests, freshnessRecords, and errorCounts");
  }
  if (sourceText !== null) {
    const projectionOccurrences = [...sourceText.matchAll(/"projection"\s*:/g)].length;
    const projectionBody = sourceText.match(/"projection"\s*:\s*\{([^{}]*)\}/s)?.[1] || "";
    const duplicateKey = allowedProjectionKeys.some((key) =>
      [...projectionBody.matchAll(new RegExp(`"${key}"\\s*:`, "g"))].length !== 1);
    if (projectionOccurrences !== 1 || duplicateKey) at("receipt.projection-duplicate", "projection object and each allowed projection key must occur exactly once");
  }
  const observations = Array.isArray(value.observations) ? value.observations : [];
  const expectedStatus = observations.length === 2 && observations.every((item) => item?.status === observations[0]?.status)
    ? observations[0].status
    : null;
  if (typeof projection?.status !== "string" || projection.status !== expectedStatus) {
    at("receipt.projection-status", "projection status must equal both canonical observation statuses");
  }
  const expectedDigests = observations.map((item) => item?.artifactSha256WithoutFinalLf);
  if (!Array.isArray(projection?.digests) || projection.digests.length !== 2
      || projection.digests.some((digest, index) => typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest) || digest !== expectedDigests[index])) {
    at("receipt.projection-digest", "projection digests must be two ordered 64-hex values equal to the canonical observations");
  }
  const expectedFreshness = observations.map((item) => item?.freshnessRecords);
  if (!Array.isArray(projection?.freshnessRecords) || projection.freshnessRecords.length !== 2
      || projection.freshnessRecords.some((count, index) => !Number.isInteger(count) || count < 0 || count !== expectedFreshness[index])) {
    at("receipt.projection-freshness-records", "projection freshness records must be two ordered non-negative integers equal to the canonical observations");
  }
  const expectedErrors = observations.map((item) => item?.counts && typeof item.counts === "object"
    ? Object.values(item.counts).reduce((sum, count) => sum + (Number.isInteger(count) ? count : Number.NaN), 0)
    : Number.NaN);
  if (!Array.isArray(projection?.errorCounts) || projection.errorCounts.length !== 2
      || projection.errorCounts.some((count, index) => !Number.isInteger(count) || count < 0 || count !== expectedErrors[index])) {
    at("receipt.projection-error-count", "projection error counts must be two ordered non-negative integers equal to canonical observation count sums");
  }
  return sorted(errors);
}

function validateTk013Evidence(canonicalRoot, specDir, errors) {
  const evidenceDir = path.join(specDir, "evidence");
  let names;
  try {
    if (!requirePlainDirectory(evidenceDir, specDir, errors, "evidence")) return;
    names = readdirSync(evidenceDir).sort();
  } catch {
    return;
  }
  if (names.length !== 1 || names[0] !== TK013_RECEIPT) add(errors, "receipt.component-set", path.relative(canonicalRoot, evidenceDir), "evidence must contain exactly the one R10-counted receipt");
  const receiptPath = path.join(evidenceDir, TK013_RECEIPT);
  let stat;
  try { stat = lstatSync(receiptPath); } catch { add(errors, "receipt.missing", path.relative(canonicalRoot, receiptPath), "R10-counted receipt is missing"); return; }
  if (stat.isSymbolicLink()) { add(errors, "path.symlink", path.relative(canonicalRoot, receiptPath), "receipt may not be a symbolic link"); return; }
  if (!stat.isFile()) { add(errors, "path.special", path.relative(canonicalRoot, receiptPath), "receipt must be a regular file"); return; }
  const receiptBytes = readFileSync(receiptPath);
  if (receiptBytes.includes(0) || receiptBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) add(errors, "receipt.encoding", path.relative(canonicalRoot, receiptPath), "receipt must be UTF-8 without BOM or NUL");
  const text = receiptBytes.toString("utf8");
  if (!Buffer.from(text).equals(receiptBytes)) add(errors, "receipt.encoding", path.relative(canonicalRoot, receiptPath), "receipt must be valid UTF-8");
  let value;
  try { value = JSON.parse(text); } catch { add(errors, "receipt.schema", path.relative(canonicalRoot, receiptPath), "receipt must be valid JSON"); }
  if (value) errors.push(...validateTk013Receipt(value, receiptBytes.length, text));
  const components = TK013_COMPONENTS.map(([name, relative, baselineBytes]) => {
    const file = path.join(specDir, relative);
    let actualBytes = FILE_LIMIT;
    try {
      const componentStat = lstatSync(file);
      if (componentStat.isSymbolicLink() || !componentStat.isFile()) add(errors, componentStat.isSymbolicLink() ? "path.symlink" : "path.special", path.relative(canonicalRoot, file), "counted component must be a regular file");
      actualBytes = componentStat.size;
    } catch { add(errors, "accounting.component-missing", path.relative(canonicalRoot, file), "counted component is missing"); }
    return { name, baselineBytes, actualBytes };
  });
  errors.push(...validateTk013Accounting({ components, receiptBytes: receiptBytes.length }).errors);
}

function result({
  spec,
  jobOrder,
  errors,
  structure = false,
  appendOnly = false,
  terminalFreeze = false,
  modelVersion = "gpt-os.job-order-workspace.v1",
  launchModel = null,
}) {
  const ordered = sorted(errors);
  return {
    ok: ordered.length === 0,
    spec,
    jobOrder,
    modelVersion,
    launchModel,
    errors: ordered,
    checked: { structure, appendOnly, terminalFreeze },
  };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function safeRelative(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function requirePlainDirectory(directory, root, errors, label) {
  const relative = path.relative(root, directory).split(path.sep).join("/") || ".";
  let stat;
  try {
    stat = lstatSync(directory);
  } catch {
    add(errors, "path.load", relative, `${label} directory does not exist`);
    return false;
  }
  if (stat.isSymbolicLink()) {
    add(errors, "path.symlink", relative, `${label} directory may not be a symbolic link`);
    return false;
  }
  if (!stat.isDirectory()) {
    add(errors, "path.special", relative, `${label} must be a directory`);
    return false;
  }
  let real;
  try {
    real = realpathSync(directory);
  } catch {
    add(errors, "path.load", relative, `${label} directory could not be resolved`);
    return false;
  }
  if (real !== path.resolve(directory) || (directory !== root && !safeRelative(root, real))) {
    add(errors, "path.escape", relative, `${label} resolves outside its declared parent`);
    return false;
  }
  return true;
}

function resolveUniqueDirectory(parent, prefix, errors, label) {
  let names;
  try {
    names = readdirSync(parent).filter((name) => name === prefix || name.startsWith(`${prefix}-`));
  } catch {
    add(errors, "path.load", path.relative(process.cwd(), parent) || ".", `cannot read ${label} parent directory`);
    return null;
  }
  if (names.length !== 1) {
    add(errors, "path.ambiguous", path.relative(process.cwd(), parent) || ".", `expected exactly one ${label} matching ${prefix}`);
    return null;
  }
  const absolute = path.join(parent, names[0]);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    add(errors, "path.load", names[0], `cannot inspect ${label}`);
    return null;
  }
  if (stat.isSymbolicLink()) {
    add(errors, "path.symlink", names[0], `${label} may not be a symbolic link`);
    return null;
  }
  if (!stat.isDirectory()) {
    add(errors, "path.special", names[0], `${label} must be a directory`);
    return null;
  }
  return absolute;
}

function readBoundedFile(file, root, errors, byteState) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  let stat;
  try {
    stat = lstatSync(file);
  } catch {
    add(errors, "structure.missing", relative, "required file is missing");
    return null;
  }
  if (stat.isSymbolicLink()) {
    add(errors, "path.symlink", relative, "symbolic links are prohibited");
    return null;
  }
  if (!stat.isFile()) {
    add(errors, "path.special", relative, "only regular Markdown files are allowed");
    return null;
  }
  if (stat.size > FILE_LIMIT) {
    add(errors, "content.file-too-large", relative, `file exceeds ${FILE_LIMIT} bytes`);
    return null;
  }
  byteState.total += stat.size;
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch {
    add(errors, "path.load", relative, "file could not be read");
    return null;
  }
  if (bytes.includes(0)) {
    add(errors, "content.binary", relative, "NUL or binary content is prohibited");
    return null;
  }
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) {
    add(errors, "content.binary", relative, "content must be valid UTF-8");
    return null;
  }
  scanSensitiveContent(text, relative, errors);
  return { text, bytes, relative };
}

function scanSensitiveContent(text, relative, errors) {
  const details = {
    "content.diff": "raw diff content is prohibited",
    "content.credential": "credential-shaped content is prohibited",
    "content.private-payload": "embedded private-payload stores are prohibited",
    "content.host-private": "host-private credential or browser-store paths are prohibited",
  };
  for (const code of sensitiveContentCodes(text)) add(errors, code, relative, details[code]);
  if (/\b(?:api[_-]?(?:key|token)|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/i.test(text)) {
    add(errors, "content.credential", relative, details["content.credential"]);
  }
}

function parseFields(text, wanted, relative, errors) {
  const found = new Map();
  const linePattern = /^\*\*([^*\n]+):\*\*\s*(.*)$/gm;
  for (const match of text.matchAll(linePattern)) {
    const key = match[1].trim();
    if (!wanted.includes(key)) continue;
    if (found.has(key)) {
      add(errors, "field.duplicate", relative, `field ${key} must be unique`);
    } else {
      found.set(key, match[2].trim());
    }
  }
  for (const field of wanted) {
    if (!found.has(field)) add(errors, "field.missing", relative, `missing field ${field}`);
  }
  return Object.fromEntries(found);
}

function parseAllFields(text) {
  const found = {};
  for (const match of text.matchAll(/^\*\*([^*\n]+):\*\*\s*(.*)$/gm)) {
    const key = match[1].trim();
    if (!(key in found)) found[key] = match[2].trim();
  }
  return found;
}

function exactHeadingMatches(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...text.matchAll(new RegExp(`^## ${escaped}\\s*$`, "gm"))];
}

function exactHeadingCount(text, heading) {
  return exactHeadingMatches(text, heading).length;
}

function exactHeadingStart(text, heading) {
  return exactHeadingMatches(text, heading)[0]?.index ?? -1;
}

function sectionBody(text, heading) {
  const start = exactHeadingStart(text, heading);
  if (start < 0) return "";
  const bodyStart = text.indexOf("\n", start) + 1;
  const end = text.indexOf("\n## ", bodyStart);
  return text.slice(bodyStart, end < 0 ? undefined : end).trim();
}

function normalizedParagraphs(text) {
  return text.split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

function normalizedSectionEntries(text) {
  return normalizedParagraphs(text)
    .map((entry) => entry.replace(/^(?:-|\d+\.)\s*/, "").trim())
    .filter(Boolean);
}

function exactBullet(section, label, relative, errors, code) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = section.split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = new RegExp(`^- ${escaped}:\\s*(.*)$`).exec(lines[index]);
    if (!match) continue;
    const value = [match[1]];
    while (index + 1 < lines.length && /^(?: {2,}|\t)\S/.test(lines[index + 1])) {
      index += 1;
      value.push(lines[index].trim());
    }
    matches.push(value.join(" ").trim());
  }
  if (matches.length !== 1 || !matches[0]) {
    add(errors, code, relative, `${label} must appear exactly once as a non-empty labeled bullet`);
    return "";
  }
  return matches[0].replace(/\.$/, "");
}

function parseLaunchStatus(status, relative, errors) {
  if (status === "ready") return { status: "ready", dependencies: [], launchEligible: true };
  const blocked = /^blocked — depends on (JO-[0-9A-Z]{6}(?:, JO-[0-9A-Z]{6})*) accepted and landed$/.exec(status || "");
  if (blocked) {
    const dependencies = blocked[1].split(", ");
    if (new Set(dependencies).size !== dependencies.length) {
      add(errors, "dependency.duplicate", relative, "dependency aliases must be unique");
    }
    return { status: "blocked", dependencies, launchEligible: false };
  }
  add(errors, "lifecycle.status", relative, "launch status must be ready or the exact dependency-held form");
  return { status: status || "invalid", dependencies: [], launchEligible: false };
}

function loadDependencyNode({ specDir, specText, specId, specFuid, registry, alias, errors }) {
  const relativeRoot = path.relative(path.dirname(specDir), path.join(specDir, "job-orders")).split(path.sep).join("/");
  const jobOrdersRoot = path.join(specDir, "job-orders");
  let names = [];
  try {
    names = readdirSync(jobOrdersRoot).filter((name) => name === alias || name.startsWith(`${alias}-`)).sort();
  } catch {
    add(errors, "dependency.missing", relativeRoot, `dependency ${alias} cannot be resolved`);
    return null;
  }
  if (names.length !== 1) {
    add(errors, names.length ? "dependency.ambiguous" : "dependency.missing", relativeRoot, `dependency ${alias} must resolve to exactly one Job Order`);
    return null;
  }
  const file = path.join(jobOrdersRoot, names[0], "JOB_ORDER.md");
  let stat;
  let bytes;
  try {
    stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > FILE_LIMIT) throw new Error("unsafe");
    bytes = readFileSync(file);
  } catch {
    add(errors, "dependency.load", path.relative(path.dirname(specDir), file).split(path.sep).join("/"), `dependency ${alias} packet is unavailable or unsafe`);
    return null;
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes) || bytes.includes(0)) {
    add(errors, "dependency.load", path.relative(path.dirname(specDir), file).split(path.sep).join("/"), `dependency ${alias} packet must be UTF-8 text`);
    return null;
  }
  const relative = path.relative(path.dirname(specDir), file).split(path.sep).join("/");
  scanSensitiveContent(text, relative, errors);
  const fields = parseFields(text, ["Job Order FUID", "Revision", "Status", "Owning Spec", "Ticket"], relative, errors);
  const fuid = alias.slice(3);
  if (fields["Job Order FUID"] !== fuid) add(errors, "dependency.identity-mismatch", relative, `dependency ${alias} header identity does not match`);
  if (fields["Owning Spec"] !== `${specId} / ${specFuid}` || !(fields.Ticket || "").startsWith(`${specId}/TK-`)) {
    add(errors, "dependency.identity-mismatch", relative, `dependency ${alias} must belong to the selected Spec`);
  }
  const issuance = `Canon Issuance — Job Order ${fuid} / ${fields.Revision}`;
  if (exactHeadingCount(specText, issuance) !== 1) {
    add(errors, "dependency.issuance-missing", relative, `dependency ${alias} lacks one exact Canon issuance`);
  } else {
    const ticket = (fields.Ticket || "").match(/^(S-\d{3}\/TK-\d{3}) \/ ([0-9A-Z]{6})$/);
    const expected = `Issue \`${names[0]}\` for ${ticket?.[1]} / ${ticket?.[2]} exactly as its packet defines. No Claim, Run, implementation, or ref movement is created.`;
    const actual = normalizedParagraphs(sectionBody(specText, issuance))[0] || "";
    if (!ticket || actual !== expected) add(errors, "dependency.issuance-mismatch", relative, `dependency ${alias} Canon identity does not exact-match its packet`);
  }
  const home = path.relative(path.dirname(specDir), file).split(path.sep).join("/");
  validateRegistryEntity(registry, fuid, { type: "job-order", parent: specFuid, home }, relative, errors);
  return { alias, status: fields.Status, relative };
}

function validateDependencyGraph({ specDir, specText, specId, specFuid, registry, selectedAlias, lifecycle, relative, errors }) {
  const loaded = new Map([[selectedAlias, { alias: selectedAlias, lifecycle, relative }]]);
  const visiting = new Set();
  const visited = new Set();
  function visit(alias) {
    if (visiting.has(alias)) {
      add(errors, "dependency.cycle", relative, `dependency graph for ${selectedAlias} contains a cycle`);
      return;
    }
    if (visited.has(alias)) return;
    visiting.add(alias);
    let node = loaded.get(alias);
    if (!node) {
      const raw = loadDependencyNode({ specDir, specText, specId, specFuid, registry, alias, errors });
      if (!raw) {
        visiting.delete(alias);
        visited.add(alias);
        return;
      }
      const nestedErrors = [];
      const parsed = raw.status === "closed-complete" || (/^accepted\b/.test(raw.status || "") && /\blanded\b/.test(raw.status || ""))
        ? { status: raw.status, dependencies: [], launchEligible: false }
        : parseLaunchStatus(raw.status, raw.relative, nestedErrors);
      errors.push(...nestedErrors);
      node = { ...raw, lifecycle: parsed };
      loaded.set(alias, node);
    }
    for (const dependency of node.lifecycle.dependencies) visit(dependency);
    visiting.delete(alias);
    visited.add(alias);
  }
  visit(selectedAlias);
  if (lifecycle.status === "blocked") {
    for (const alias of lifecycle.dependencies) {
      const dependency = loaded.get(alias);
      const resolved = dependency && (dependency.status === "closed-complete" || (/^accepted\b/.test(dependency.status || "") && /\blanded\b/.test(dependency.status || "")));
      if (!resolved) add(errors, "dependency.held", relative, `dependency ${alias} is not accepted and landed`);
    }
  }
}

function normalizeLaunchModel({ orderFile, specFile, specDir, specText, specId, specFuid, ticket, jobOrder, orderFuid, orderFields, orderDir, registry, errors }) {
  if (TERMINAL.has(orderFields.Status)) {
    return { modelVersion: TERMINAL_HISTORY_SCHEMA, launchModel: null };
  }
  if (/^(?:accepted|claimed|in-progress|delivered)\b/.test(orderFields.Status || "")) {
    return { modelVersion: "gpt-os.job-order-workspace.v1", launchModel: null };
  }
  const lifecycle = parseLaunchStatus(orderFields.Status, orderFile.relative, errors);
  const scope = sectionBody(orderFile.text, "Scope And Repository");
  const repository = exactBullet(scope, "Repository", orderFile.relative, errors, "repository.missing").replace(/ only$/, "");
  const allowed = exactBullet(scope, "Allowed writes", orderFile.relative, errors, "scope.missing");
  const destinationText = exactBullet(scope, "Destination", orderFile.relative, errors, "destination.missing");
  const destinationMatch = /^(private .+) `([A-Za-z0-9._/-]+)` only; `main` is excluded$/.exec(destinationText);
  const destination = destinationMatch
    ? { repository: destinationMatch[1], branch: destinationMatch[2] }
    : { repository: "", branch: "" };
  if (destinationText && !destinationMatch) add(errors, "destination.schema", orderFile.relative, "Destination must use the exact private repository, branch, and main-exclusion form");
  if (destinationMatch && destination.repository !== repository) add(errors, "destination.repository-mismatch", orderFile.relative, "Destination repository must exactly match Repository");
  if (destinationMatch && destination.branch !== "integration") add(errors, "destination.prohibited", orderFile.relative, "launch destination must be private integration and never main or master");
  const proofGates = normalizedSectionEntries(sectionBody(orderFile.text, "Required Gates And Proof"));
  if (!proofGates.length) add(errors, "proof.missing", orderFile.relative, "Required Gates And Proof must be non-empty");
  const exclusions = normalizedSectionEntries(sectionBody(orderFile.text, "Exclusions And Stop Conditions"));
  if (!exclusions.length) add(errors, "exclusion.missing", orderFile.relative, "Exclusions And Stop Conditions must be non-empty");
  if (!exclusions.some((line) => /`main`\s+(?:mutation|write)/.test(line))) {
    add(errors, "exclusion.main-required", orderFile.relative, "exclusions must explicitly prohibit main mutation or write");
  }
  const exactIssuance = `Canon Issuance — Job Order ${orderFuid} / ${orderFields.Revision}`;
  if (exactHeadingCount(specText, exactIssuance) !== 1) {
    if ([...specText.matchAll(new RegExp(`^## Canon Issuance — Job Order ${orderFuid} / R[1-9][0-9]*\\s*$`, "gm"))].length) {
      add(errors, "issuance.revision-mismatch", specFile.relative, "selected revision does not match the exact Canon issuance");
    }
  } else {
    const issuanceParagraph = normalizedParagraphs(sectionBody(specText, `Canon Issuance — Job Order ${orderFuid} / ${orderFields.Revision}`))[0] || "";
    const expected = `Issue \`${path.basename(orderDir)}\` for ${ticket?.[1]} / ${ticket?.[2]} exactly as its packet defines.`;
    const expectedParagraph = `${expected} No Claim, Run, implementation, or ref movement is created.`;
    if (issuanceParagraph !== expectedParagraph) add(errors, "issuance.schema", specFile.relative, "exact launch Canon must use the binding issuance sentence without prose-token inference");
  }
  validateDependencyGraph({ specDir, specText, specId, specFuid, registry, selectedAlias: jobOrder, lifecycle, relative: orderFile.relative, errors });
  if (lifecycle.status === "blocked") {
    add(errors, "lifecycle.blocked", orderFile.relative, "a dependency-held Job Order is not launch eligible until Canon updates its status");
  }
  return {
    modelVersion: LAUNCH_MODEL_SCHEMA,
    launchModel: {
      schema: LAUNCH_MODEL_SCHEMA,
      jobOrder: { alias: jobOrder, fuid: orderFuid, revision: orderFields.Revision },
      spec: { id: specId, fuid: specFuid },
      ticket: { alias: ticket?.[1] || "", fuid: ticket?.[2] || "" },
      lifecycle,
      repository,
      allowedScope: allowed ? [allowed] : [],
      proofGates,
      destination,
      exclusions,
    },
  };
}

function validateContext(text, relative, errors) {
  const required = ["append-only", "not authority", "second task board", "proof archive", "transcript", "secret store"];
  for (const phrase of required) {
    if (!text.toLowerCase().includes(phrase)) {
      add(errors, "context.contract", relative, `missing bounded Context disclaimer: ${phrase}`);
    }
  }
  if (/\b(?:this\s+)?(?:context|folder|handoff)\s+(?:authorizes?|grants?\s+(?:authority|scope)|opens?\s+(?:a\s+)?claim)\b/i.test(text)) {
    add(errors, "context.authority", relative, "Context may not make a positive authority claim");
  }
  if (/^#{1,6}\s+(?:authority|authorization)\b/im.test(text)) {
    add(errors, "context.authority", relative, "Context may not contain an authority section");
  }
  if (/^- \[[ xX]\]/m.test(text) || /^#{1,6}\s+(?:tasks?|taskboard|backlog|to-?do)\b/im.test(text)) {
    add(errors, "context.second-tracker", relative, "Context may not contain a second task tracker");
  }
  if (/^#{1,6}\s+(?:proof|evidence)\s+archive\b/im.test(text)) {
    add(errors, "context.proof-archive", relative, "Context may not become a proof archive");
  }
  if (/^#{1,6}\s+(?:transcript|chat)\b/im.test(text) || /^(?:User|Assistant):\s/m.test(text)) {
    add(errors, "context.transcript", relative, "Context may not contain a conversation transcript");
  }
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  for (const heading of headings) {
    if (!/^\d{4}-\d{2}-\d{2} — .+/.test(heading)) {
      add(errors, "context.section", relative, "Context append sections must use a dated heading");
    }
  }
}

function validateClaim(fields, receipts, relative, errors) {
  if (fields["Decision mode"] !== "Steward-serialized; not machine-atomic") {
    add(errors, "claim.decision-mode", relative, "Decision mode must remain Steward-serialized and not machine-atomic");
  }
  const disposition = fields.Disposition;
  const claimant = fields.Claimant;
  const run = fields["Run FUID"];
  const lane = fields["Writer lane"];
  const receipt = fields["Accepted handoff receipt"];
  const digest = fields["Accepted handoff digest"];
  if (disposition === "unclaimed") {
    if ([claimant, run, lane, receipt, digest].some((value) => value !== "none")) {
      add(errors, "claim.unclaimed-inconsistent", relative, "an unclaimed record must leave claimant, run, lane, receipt, and digest as none");
    }
  } else {
    const populated = [claimant, run, lane].map((value) => value && value !== "none");
    if (!populated.every(Boolean) && populated.some(Boolean)) {
      add(errors, "claim.claimant-inconsistent", relative, "claimant, run, and writer lane must be populated together");
    }
    if (run !== "none" && !/^[0-9A-Z]{6}$/.test(run)) {
      add(errors, "claim.run-invalid", relative, "Run FUID must be none or six uppercase base36 characters");
    }
  }
  if ((receipt === "none") !== (digest === "none")) {
    add(errors, "claim.receipt-pair", relative, "accepted receipt and digest must be both none or both populated");
    return;
  }
  if (receipt !== "none" && digest !== "none") {
    const accepted = receipts.get(receipt);
    if (!accepted) {
      add(errors, "claim.receipt-missing", relative, "accepted receipt must name an existing safe handoff basename");
    } else if (digest !== sha256(accepted.bytes)) {
      add(errors, "claim.digest-mismatch", relative, "accepted handoff digest does not match the exact receipt bytes");
    }
  }
}

function loadRegistry(root, errors) {
  const registryPath = path.join(root, "fuid-registry.json");
  try {
    return JSON.parse(readFileSync(registryPath, "utf8"));
  } catch {
    add(errors, "registry.load", "fuid-registry.json", "identity registry could not be parsed");
    return { entities: {} };
  }
}

function validateRegistryEntity(registry, id, expected, relative, errors) {
  const entity = registry.entities?.[id];
  if (!entity) {
    add(errors, "registry.missing", relative, `registry entity ${id} is missing`);
    return;
  }
  if (entity.type !== expected.type) add(errors, "registry.type-mismatch", relative, `${id} must have type ${expected.type}`);
  if (expected.parent !== undefined && entity.parent !== expected.parent) add(errors, "registry.parent-mismatch", relative, `${id} has the wrong parent`);
  if (expected.home !== undefined && entity.home !== expected.home) add(errors, "registry.home-mismatch", relative, `${id} has the wrong home`);
}

function trustedCanonArchiveTempRoot() {
  const stat = lstatSync(CANON_ARCHIVE_GIT_TEMP_ROOT);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("trusted temp root must be a plain directory");
  const root = realpathSync(CANON_ARCHIVE_GIT_TEMP_ROOT);
  if (root !== CANON_ARCHIVE_GIT_TEMP_ROOT) throw new Error("trusted temp root must not resolve through a symlink");
  return root;
}

function canonArchiveGitBoundary() {
  const tempRoot = trustedCanonArchiveTempRoot();
  const created = mkdtempSync(path.join(tempRoot, CANON_ARCHIVE_GIT_TEMP_PREFIX));
  try {
    const stat = lstatSync(created);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("trusted git cwd must be a plain directory");
    const cwd = realpathSync(created);
    if (cwd !== created) throw new Error("trusted git cwd must not resolve through a symlink");
    return {
      cwd,
      cleanup() {
        rmSync(cwd, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(created, { recursive: true, force: true });
    throw error;
  }
}

function canonArchiveGitEnv(cwd) {
  const env = {};
  for (const key of CANON_ARCHIVE_GIT_ENV_KEYS) env[key] = cwd;
  env.GH_CONFIG_DIR = path.join(userInfo().homedir, ".config", "gh");
  env.GH_PROMPT_DISABLED = "1";
  env.GIT_CONFIG_COUNT = "0";
  env.GIT_CONFIG_SYSTEM = devNull;
  env.GIT_CONFIG_GLOBAL = devNull;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_DISCOVERY_ACROSS_FILESYSTEM = "0";
  env.GIT_CEILING_DIRECTORIES = cwd;
  return env;
}

function exactRefGitEnv(cwd) {
  const env = canonArchiveGitEnv(cwd);
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}

function canonArchiveAuthorityDependencies() {
  return {
    gitPath: realpathSync(CANON_ARCHIVE_GIT_PATH),
    spawn: spawnSync,
  };
}

function exactRefGitDependencies() {
  return {
    gitPath: realpathSync(CANON_ARCHIVE_GIT_PATH),
    spawn: spawnSync,
  };
}

function canonArchiveAuthorityPlan() {
  const boundary = canonArchiveGitBoundary();
  try {
    const env = canonArchiveGitEnv(boundary.cwd);
    const { gitPath, spawn } = canonArchiveAuthorityDependencies();
    return {
      args: [...CANON_ARCHIVE_GIT_ARGS, CANON_ARCHIVE_REMOTE, CANON_ARCHIVE_REF],
      cleanup: boundary.cleanup,
      cwd: boundary.cwd,
      env,
      gitPath,
      spawn,
    };
  } catch (error) {
    boundary.cleanup();
    throw error;
  }
}

export function describeTrustedCanonArchiveAuthority() {
  const plan = canonArchiveAuthorityPlan();
  try {
    const { args, cwd, env, gitPath } = plan;
    return { args, cwd, env: { ...env }, gitPath };
  } finally {
    plan.cleanup();
  }
}

function verifyCanonArchiveReadback({ expectedSha, ref, status, stdout, relative, errors }) {
  if (status !== 0) {
    add(errors, "archive.pin-readback", relative, "archived Canon live ref could not be read");
    return false;
  }
  const lines = stdout.split("\n").filter(Boolean);
  if (lines.length !== 1) {
    add(errors, "archive.pin-readback", relative, "archived Canon live ref must resolve exactly once");
    return false;
  }
  const parts = lines[0].trim().split(/\s+/);
  if (parts.length !== 2) {
    add(errors, "archive.pin-readback", relative, "archived Canon live ref read-back is malformed");
    return false;
  }
  const [readbackSha, readbackRef] = parts;
  if (!FULL_SHA.test(readbackSha || "") || readbackRef !== ref) {
    add(errors, "archive.pin-readback", relative, "archived Canon live ref read-back is malformed");
    return false;
  }
  if (readbackSha !== expectedSha) {
    add(errors, "archive.pin-mismatch", relative, "archived Canon live ref read-back does not match the trusted expected SHA");
    return false;
  }
  return true;
}

export function diagnoseCanonArchiveReadback({ expectedSha, ref = CANON_ARCHIVE_REF, stdout = "", status = 0 } = {}) {
  const errors = [];
  const ok = verifyCanonArchiveReadback({
    expectedSha,
    ref,
    status,
    stdout,
    relative: ".",
    errors,
  });
  return { ok, errors: sorted(errors) };
}

function verifyCanonArchiveAuthority({ expectedSha, remote, ref, root, relative, errors }) {
  if (!expectedSha || !remote || !ref) {
    add(errors, "archive.pin-required", relative, "archived Canon requires a trusted expected SHA, explicit remote, and explicit remote ref");
    return false;
  }
  if (!FULL_SHA.test(expectedSha)) {
    add(errors, "archive.pin-sha-invalid", relative, "archived Canon expected SHA must be a full lowercase 40-hex value");
    return false;
  }
  if (remote !== CANON_ARCHIVE_REMOTE) {
    add(errors, "archive.pin-remote-invalid", relative, "archived Canon remote must be the exact canonical GitHub WORKSPACE remote");
    return false;
  }
  if (ref !== CANON_ARCHIVE_REF) {
    add(errors, "archive.pin-ref-invalid", relative, "archived Canon ref must be the exact canonical integration branch ref");
    return false;
  }
  let plan;
  try {
    plan = canonArchiveAuthorityPlan();
  } catch {
    add(errors, "archive.pin-readback", relative, "archived Canon live ref could not be read");
    return false;
  }
  try {
    const outcome = plan.spawn(plan.gitPath, plan.args, {
      cwd: plan.cwd,
      encoding: "utf8",
      env: plan.env,
      shell: false,
    });
    return verifyCanonArchiveReadback({ expectedSha, ref, status: outcome.status, stdout: outcome.stdout, relative, errors });
  } finally {
    plan.cleanup();
  }
}

function validateReceipts({ receiptFiles, orderFuid, revision, specId, specFuid, ticketAlias, ticketFuid, registry, errors }) {
  const receipts = new Map();
  const parsed = [];
  for (const file of receiptFiles) {
    const name = path.basename(file.relative);
    if (name === "README.md") continue;
    const filename = RECEIPT_NAME.exec(name);
    if (!filename) {
      add(errors, "handoff.name", file.relative, "receipt filename does not match the ordered flight schema");
      continue;
    }
    const fields = parseFields(file.text, RECEIPT_FIELDS, file.relative, errors);
    const [sequence, runFuid, from, next, receiptFuid] = filename.slice(1);
    if (fields.Sequence !== sequence) add(errors, "handoff.identity-mismatch", file.relative, "Sequence does not match the filename");
    if (fields["Run FUID"] !== runFuid) add(errors, "handoff.identity-mismatch", file.relative, "Run FUID does not match the filename");
    if (fields.From !== from || fields.Next !== next) add(errors, "handoff.identity-mismatch", file.relative, "From/Next stages do not match the filename");
    if (fields["Receipt FUID"] !== receiptFuid) add(errors, "handoff.identity-mismatch", file.relative, "Receipt FUID does not match the filename");
    if (fields["Job Order"] !== `${orderFuid} / ${revision}`) add(errors, "handoff.identity-mismatch", file.relative, "Job Order identity does not match the workspace");
    if (fields.Spec !== `${specId} / ${specFuid}`) add(errors, "handoff.identity-mismatch", file.relative, "Spec identity does not match the workspace");
    if (fields.Ticket !== `${ticketAlias} / ${ticketFuid}`) add(errors, "handoff.identity-mismatch", file.relative, "Ticket identity does not match the workspace");
    if (!STAGES.includes(fields.From) || !STAGES.includes(fields.Next)) add(errors, "handoff.unknown-stage", file.relative, "receipt fields must name settled flight stages");
    const home = file.relative.replace(/^specs\//, "");
    validateRegistryEntity(registry, receiptFuid, { type: "passage-receipt", parent: orderFuid, home }, file.relative, errors);
    parsed.push({ name, sequence: Number(sequence), fields, file });
    receipts.set(name, file);
  }
  parsed.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  for (let index = 0; index < parsed.length; index += 1) {
    const current = parsed[index];
    if (current.sequence !== index + 1) add(errors, "handoff.sequence-gap", current.file.relative, "receipt sequence must be contiguous from 001");
    if (index === 0) {
      if (current.fields["Prior receipt"] !== "none" || current.fields["Prior digest"] !== "none") {
        add(errors, "handoff.prior-mismatch", current.file.relative, "the first receipt must have no prior receipt or digest");
      }
    } else {
      const prior = parsed[index - 1];
      if (prior.fields.Next !== current.fields.From) add(errors, "handoff.stage-discontinuity", current.file.relative, "the prior Next stage must equal the current From stage");
      if (current.fields["Prior receipt"] !== prior.name) add(errors, "handoff.prior-mismatch", current.file.relative, "Prior receipt must name the immediately preceding receipt");
      if (current.fields["Prior digest"] !== sha256(prior.file.bytes)) add(errors, "handoff.prior-digest-mismatch", current.file.relative, "Prior digest does not match the immediately preceding receipt bytes");
    }
  }
  return receipts;
}

export function validateJobOrderWorkspace({
  root,
  specId,
  jobOrder,
  canonArchiveExpectedSha = null,
  canonArchiveRemote = null,
  canonArchiveRef = null,
}) {
  const errors = [];
  const normalizedRoot = path.resolve(root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."));
  if (!/^S-\d{3}$/.test(specId || "") || !/^JO-[0-9A-Z]{6}$/.test(jobOrder || "")) {
    add(errors, "usage.alias", ".", "--spec must be S-### and --job-order must be JO-XXXXXX");
    return result({ spec: specId || null, jobOrder: jobOrder || null, errors });
  }
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(normalizedRoot);
  } catch {
    add(errors, "path.root", ".", "repository root does not exist");
    return result({ spec: specId, jobOrder, errors });
  }
  // A historic checkout declares no manifest and keeps `specs/`; a V3 tree
  // declares `workbench/specs`. Resolving per-root keeps both validatable.
  const specsLane = laneRelative(canonicalRoot, "specs");
  const specsRoot = path.join(canonicalRoot, specsLane);
  if (!requirePlainDirectory(specsRoot, canonicalRoot, errors, specsLane)) {
    return result({ spec: specId, jobOrder, errors });
  }
  const specDir = resolveUniqueDirectory(specsRoot, specId, errors, "Spec");
  if (!specDir) return result({ spec: specId, jobOrder, errors });
  if (!requirePlainDirectory(specDir, canonicalRoot, errors, "Spec")) {
    return result({ spec: specId, jobOrder, errors });
  }
  const jobOrdersRoot = path.join(specDir, "job-orders");
  if (!requirePlainDirectory(jobOrdersRoot, specDir, errors, "job-orders")) {
    return result({ spec: specId, jobOrder, errors });
  }
  const orderDir = resolveUniqueDirectory(jobOrdersRoot, jobOrder, errors, "Job Order");
  if (!orderDir) return result({ spec: specId, jobOrder, errors });
  if (!requirePlainDirectory(orderDir, specDir, errors, "Job Order")
      || !safeRelative(canonicalRoot, specDir)
      || !safeRelative(specDir, orderDir)) {
    add(errors, "path.escape", path.relative(canonicalRoot, orderDir), "resolved workspace escapes its repository or Spec parent");
    return result({ spec: specId, jobOrder, errors });
  }

  const orderRelative = path.relative(canonicalRoot, orderDir).split(path.sep).join("/");
  const entries = readdirSync(orderDir).sort();
  for (const required of REQUIRED_ORDER_FILES) {
    if (!entries.includes(required)) add(errors, "structure.missing", `${orderRelative}/${required}`, "required Job Order entry is missing");
  }
  for (const entry of entries) {
    if (!REQUIRED_ORDER_FILES.has(entry)) add(errors, "structure.unexpected-entry", `${orderRelative}/${entry}`, "unexpected Job Order entry; arbitrary payload stores are prohibited");
  }
  const byteState = { total: 0 };
  const specFile = readBoundedFile(path.join(specDir, "SPEC.md"), canonicalRoot, errors, byteState);
  const orderFile = readBoundedFile(path.join(orderDir, "JOB_ORDER.md"), canonicalRoot, errors, byteState);
  const contextFile = readBoundedFile(path.join(orderDir, "CONTEXT.md"), canonicalRoot, errors, byteState);
  const claimFile = readBoundedFile(path.join(orderDir, "CLAIM.md"), canonicalRoot, errors, byteState);
  const handoffsDir = path.join(orderDir, "handoffs");
  const receiptFiles = [];
  try {
    const stat = lstatSync(handoffsDir);
    if (stat.isSymbolicLink()) add(errors, "path.symlink", `${orderRelative}/handoffs`, "handoffs may not be a symbolic link");
    else if (!stat.isDirectory()) add(errors, "path.special", `${orderRelative}/handoffs`, "handoffs must be a directory");
    else {
      const handoffNames = readdirSync(handoffsDir).sort();
      if (!handoffNames.includes("README.md")) add(errors, "structure.missing", `${orderRelative}/handoffs/README.md`, "handoff schema README is missing");
      for (const name of handoffNames) {
        if (name !== "README.md" && !name.endsWith(".md")) {
          add(errors, "structure.unexpected-entry", `${orderRelative}/handoffs/${name}`, "handoffs may contain only README.md and receipt Markdown files");
          continue;
        }
        const loaded = readBoundedFile(path.join(handoffsDir, name), canonicalRoot, errors, byteState);
        if (loaded) receiptFiles.push(loaded);
      }
    }
  } catch {
    // The required-entry finding above is sufficient when the directory is absent.
  }
  if (specFile) {
    try {
      specFile.evidence = loadSpecEvidence({ root: canonicalRoot, specFilePath: path.join(specDir, "SPEC.md") });
      byteState.total += specFile.evidence.archiveBytes;
    } catch (error) {
      add(errors, error.code || "archive.load", specFile.relative, error.message || "archived evidence could not be validated");
    }
  }
  if (byteState.total > WORKSPACE_LIMIT) add(errors, "content.workspace-too-large", orderRelative, `workspace exceeds ${WORKSPACE_LIMIT} bytes`);
  if (!specFile || !orderFile || !contextFile || !claimFile) {
    return result({ spec: specId, jobOrder, errors, structure: true });
  }

  const orderFields = parseFields(orderFile.text, ["Job Order FUID", "Revision", "Status", "Plane", "Owning Spec", "Ticket", "Responsible party", "Created"], orderFile.relative, errors);
  const orderFuid = jobOrder.slice(3);
  const expectedIssuance = `Canon Issuance — Job Order ${orderFuid} / ${orderFields.Revision}`;
  const hotSpecText = specFile.text;
  const hasCanonArchive = specFile.evidence?.declarations?.some((item) => item.kind === "canon") ?? hotSpecText.includes("canon-archive:");
  const hotHasExpectedIssuance = exactHeadingCount(hotSpecText, expectedIssuance) === 1;
  let authorityReady = true;
  let specText = specFile.evidence?.logicalText ?? hotSpecText;
  if (hasCanonArchive && !hotHasExpectedIssuance) {
    authorityReady = verifyCanonArchiveAuthority({
      expectedSha: canonArchiveExpectedSha,
      remote: canonArchiveRemote,
      ref: canonArchiveRef,
      root: canonicalRoot,
      relative: specFile.relative,
      errors,
    });
    specText = authorityReady && specFile.evidence ? specFile.evidence.logicalText : hotSpecText;
  }

  const specFields = parseFields(specText, ["Spec ID", "FUID"], specFile.relative, errors);
  for (const heading of REQUIRED_ORDER_HEADINGS) {
    if (exactHeadingCount(orderFile.text, heading) !== 1) add(errors, "heading.invalid", orderFile.relative, `heading ${heading} must appear exactly once`);
  }
  const orderDirFuid = path.basename(orderDir).match(/^JO-([0-9A-Z]{6})(?:-|$)/)?.[1];
  if (orderFields["Job Order FUID"] !== orderDirFuid || orderFields["Job Order FUID"] !== orderFuid) {
    add(errors, "identity.order-directory-mismatch", orderFile.relative, "Job Order header, alias, and directory FUID must match");
  }
  if (!/^R[1-9][0-9]*$/.test(orderFields.Revision || "")) add(errors, "identity.revision", orderFile.relative, "revision must match R1 or a later positive revision");
  if (specFields["Spec ID"] !== specId) add(errors, "identity.spec-mismatch", specFile.relative, "Spec ID does not match the selected directory");
  const owning = (orderFields["Owning Spec"] || "").match(/^(S-\d{3}) \/ ([0-9A-Z]{6})$/);
  const ticket = (orderFields.Ticket || "").match(/^(S-\d{3}\/TK-\d{3}) \/ ([0-9A-Z]{6})$/);
  const specFuid = specFields.FUID;
  if (!owning || owning[1] !== specId || owning[2] !== specFuid) add(errors, "identity.spec-mismatch", orderFile.relative, "Owning Spec must match the selected Spec ID and FUID");
  if (!ticket || !ticket[1].startsWith(`${specId}/`)) add(errors, "identity.ticket-mismatch", orderFile.relative, "Ticket must belong to the selected Spec");
  if (ticket && !new RegExp(`^\\| ${ticket[1].split("/")[1]} \\| ${ticket[2]} \\|`, "m").test(specText)) {
    add(errors, "identity.ticket-mismatch", specFile.relative, "Ticket identity must exist in the Spec table");
  }
  if (!hasCanonArchive || hotHasExpectedIssuance || authorityReady) {
    if (exactHeadingCount(specText, expectedIssuance) !== 1) add(errors, "issuance.missing", specFile.relative, "owning Spec must contain the exact Canon issuance heading");
    const issuanceStart = exactHeadingStart(specText, expectedIssuance);
    const issuanceEnd = issuanceStart < 0 ? -1 : specText.indexOf("\n## ", issuanceStart + 4);
    const issuance = issuanceStart < 0 ? "" : specText.slice(issuanceStart, issuanceEnd < 0 ? undefined : issuanceEnd);
    for (const required of [path.basename(orderDir), ticket?.[1], ticket?.[2], orderFields.Revision]) {
      if (required && !issuance.includes(required)) add(errors, "issuance.identity-mismatch", specFile.relative, `Canon issuance must name ${required}`);
    }
  }
  if (!/(?:folder\s+does|they\s+do)\s+not\s+grant\s+authority\s+by\s+existing/i.test(orderFile.text)) {
    add(errors, "issuance.folder-authority", orderFile.relative, "Job Order must state that its folder grants no authority by existing");
  }
  if (TERMINAL.has(orderFields.Status) && orderFields.Plane !== "Enduring Context") add(errors, "terminal.plane", orderFile.relative, "a terminal Job Order must be Enduring Context");
  if (!TERMINAL.has(orderFields.Status) && orderFields.Plane !== "Intent") add(errors, "identity.plane", orderFile.relative, "a nonterminal Job Order must remain Intent");

  const registry = loadRegistry(canonicalRoot, errors);
  const specHome = path.relative(specsRoot, path.join(specDir, "SPEC.md")).split(path.sep).join("/");
  const orderHome = path.relative(specsRoot, path.join(orderDir, "JOB_ORDER.md")).split(path.sep).join("/");
  validateRegistryEntity(registry, specFuid, { type: "spec", home: specHome }, specFile.relative, errors);
  if (ticket) validateRegistryEntity(registry, ticket[2], { type: "ticket", parent: specFuid, home: specHome }, specFile.relative, errors);
  validateRegistryEntity(registry, orderFuid, { type: "job-order", parent: specFuid, home: orderHome }, orderFile.relative, errors);

  const normalized = normalizeLaunchModel({
    orderFile,
    specFile,
    specDir,
    specText,
    specId,
    specFuid,
    ticket,
    jobOrder,
    orderFuid,
    orderFields,
    orderDir,
    registry,
    errors,
  });

  validateContext(contextFile.text, contextFile.relative, errors);
  const receipts = validateReceipts({
    receiptFiles,
    orderFuid,
    revision: orderFields.Revision,
    specId,
    specFuid,
    ticketAlias: ticket?.[1] || "",
    ticketFuid: ticket?.[2] || "",
    registry,
    errors,
  });
  const claimFields = parseFields(claimFile.text, CLAIM_FIELDS, claimFile.relative, errors);
  validateClaim(claimFields, receipts, claimFile.relative, errors);
  if (specId === "S-023" && jobOrder === "JO-00007U") {
    try {
      lstatSync(path.join(specDir, "evidence"));
      validateTk013Evidence(canonicalRoot, specDir, errors);
    } catch {
      // R10 intentionally permits the accepted pre-completion state without a receipt.
    }
  }

  return result({
    spec: specId,
    jobOrder,
    errors,
    structure: true,
    ...normalized,
    launchModel: errors.length ? null : normalized.launchModel,
  });
}

function exactRefGitContext(root) {
  const boundary = canonArchiveGitBoundary();
  try {
    const env = exactRefGitEnv(boundary.cwd);
    const { gitPath, spawn } = exactRefGitDependencies();
    const canonicalRoot = realpathSync(path.resolve(root));
    return {
      argvPrefix: ["-C", canonicalRoot],
      cleanup: boundary.cleanup,
      cwd: boundary.cwd,
      env,
      gitPath,
      root: canonicalRoot,
      spawn,
    };
  } catch (error) {
    boundary.cleanup();
    throw error;
  }
}

export function describeTrustedExactRefGit(root) {
  const context = exactRefGitContext(root);
  try {
    const { argvPrefix, cwd, env, gitPath, root: canonicalRoot } = context;
    return {
      argvPrefix: [...argvPrefix],
      cwd,
      env: { ...env },
      gitPath,
      root: canonicalRoot,
    };
  } finally {
    context.cleanup();
  }
}

function exactRefGit(context, args, { encoding = "utf8", error = "git object could not be read" } = {}) {
  const outcome = context.spawn(context.gitPath, [...context.argvPrefix, ...args], {
    cwd: context.cwd,
    encoding,
    env: context.env,
    shell: false,
  });
  if (outcome.status !== 0) throw new Error(error);
  return outcome.stdout;
}

function treeMap(context, revision, prefix) {
  const output = exactRefGit(context, ["ls-tree", "-r", "--name-only", revision, "--", prefix]);
  const map = new Map();
  for (const name of output.split("\n").filter(Boolean).sort()) {
    map.set(name, exactRefGit(context, ["show", `${revision}:${name}`], {
      encoding: null,
      error: "git blob could not be read",
    }));
  }
  return map;
}

function fieldFromBytes(bytes, name) {
  return parseAllFields(bytes.toString("utf8"))[name];
}

function evidenceSectionBounds(spec) {
  if (!spec) return null;
  const heading = Buffer.from("## Append-Only Evidence And Execution Log");
  const start = spec.indexOf(heading);
  if (start < 0) return null;
  const nextHeading = spec.indexOf(Buffer.from("\n## "), start + heading.length);
  return { start, end: nextHeading < 0 ? spec.length : nextHeading };
}

function completeLines(bytes) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    lines.push(bytes.subarray(start, index + 1));
    start = index + 1;
  }
  return { lines, remainder: bytes.subarray(start) };
}

function isEvidenceRow(line) {
  try {
    parseEvidenceTableRow(line.toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

function isEvidenceSeparator(line) {
  return line.equals(Buffer.from("\n")) || line.equals(Buffer.from("\r\n"));
}

function evidenceRowIdentity(line) {
  let end = line.length;
  if (end > 0 && line[end - 1] === 0x0a) end -= 1;
  if (end > 0 && line[end - 1] === 0x0d) end -= 1;
  while (end > 0 && (line[end - 1] === 0x20 || line[end - 1] === 0x09)) end -= 1;
  return line.subarray(0, end).toString("base64");
}

function evidenceRowKeys(bytes) {
  return new Set(completeLines(bytes).lines.filter(isEvidenceRow).map(evidenceRowIdentity));
}

function lawfulNovelEvidenceAppends(appended, establishedRows) {
  if (appended.length === 0) return true;
  const { lines, remainder } = completeLines(appended);
  if (remainder.length !== 0 || !lines.some(isEvidenceRow)) return false;
  for (const line of lines) {
    if (isEvidenceSeparator(line)) continue;
    if (!isEvidenceRow(line)) return false;
    const identity = evidenceRowIdentity(line);
    if (establishedRows.has(identity)) return false;
    establishedRows.add(identity);
  }
  return true;
}

function preservesArchiveIntroduction(baseSpec, candidateSpec, declaration, archive) {
  if (!archive?.length) return false;
  const candidateText = candidateSpec.toString("utf8");
  const declarationStart = Buffer.byteLength(candidateText.slice(0, declaration.lineStart));
  const declarationEnd = Buffer.byteLength(candidateText.slice(0, declaration.lineEnd));
  const baseBounds = evidenceSectionBounds(baseSpec);
  const candidateBounds = evidenceSectionBounds(candidateSpec);
  if (!baseBounds || !candidateBounds
      || declarationStart < candidateBounds.start
      || declarationEnd > candidateBounds.end) return false;

  const baseEvidence = baseSpec.subarray(baseBounds.start, baseBounds.end);
  const candidateEvidence = candidateSpec.subarray(candidateBounds.start, candidateBounds.end);
  const archiveOffset = declarationStart - candidateBounds.start;
  const afterDeclarationOffset = declarationEnd - candidateBounds.start;
  if (archiveOffset > baseEvidence.length || afterDeclarationOffset > candidateEvidence.length) return false;

  const basePrefix = baseEvidence.subarray(0, archiveOffset);
  const baseArchiveEnd = archiveOffset + archive.length;
  if (baseArchiveEnd > baseEvidence.length
      || !candidateEvidence.subarray(0, archiveOffset).equals(basePrefix)
      || !baseEvidence.subarray(archiveOffset, baseArchiveEnd).equals(archive)) return false;

  const baseSuffix = baseEvidence.subarray(baseArchiveEnd);
  const afterDeclaration = candidateEvidence.subarray(afterDeclarationOffset);
  if (afterDeclaration.length < baseSuffix.length
      || !afterDeclaration.subarray(0, baseSuffix.length).equals(baseSuffix)) return false;

  const laterAppends = afterDeclaration.subarray(baseSuffix.length);
  const establishedRows = evidenceRowKeys(baseEvidence);
  for (const key of evidenceRowKeys(archive)) establishedRows.add(key);
  return lawfulNovelEvidenceAppends(laterAppends, establishedRows);
}

function canonArchiveIdentities(bytes) {
  const text = bytes.toString("utf8");
  return [...text.matchAll(/^## Canon Issuance — Job Order ([0-9A-Z]{6}) \/ (R[1-9]\d*)$/gm)]
    .map((match) => `JO-${match[1]}/${match[2]}`);
}

function preservesCanonArchiveIntroduction(baseSpec, candidateSpec, declaration, archive, baseDeclarations, candidateDeclarations) {
  if (declaration.kind !== "canon" || !archive?.length) return false;
  if (archive.length !== declaration.bytes
      || createHash("sha256").update(archive).digest("hex") !== declaration.sha256) return false;
  const identities = canonArchiveIdentities(archive);
  if (!identities.length
      || identities[0] !== declaration.first
      || identities.at(-1) !== declaration.last
      || new Set(identities).size !== identities.length) return false;
  const baseStart = baseSpec.indexOf(archive);
  if (baseStart < 0 || baseSpec.indexOf(archive, baseStart + 1) >= 0 || candidateSpec.indexOf(archive) >= 0) return false;
  const candidateText = candidateSpec.toString("utf8");
  const declarationStart = Buffer.byteLength(candidateText.slice(0, declaration.lineStart));
  const declarationEnd = Buffer.byteLength(candidateText.slice(0, declaration.lineEnd));
  const ticketStart = candidateSpec.indexOf(Buffer.from("## Vertical Implementation Slices"));
  if (ticketStart < 0 || declarationStart >= ticketStart) return false;
  const nextEstablished = candidateDeclarations.find((item) => item.lineStart > declaration.lineStart
    && baseDeclarations.some((baseItem) => baseItem.line === item.line));
  const baseAnchor = nextEstablished && baseDeclarations.find((item) => item.line === nextEstablished.line);
  if (!nextEstablished || !baseAnchor) return false;
  const baseText = baseSpec.toString("utf8");
  const baseAnchorStart = Buffer.byteLength(baseText.slice(0, baseAnchor.lineStart));
  const candidateAnchorStart = Buffer.byteLength(candidateText.slice(0, nextEstablished.lineStart));
  if (baseStart + archive.length !== baseAnchorStart
      || !/^\s*$/.test(candidateSpec.subarray(declarationEnd, candidateAnchorStart).toString("utf8"))) return false;
  const hotBeforeDeclaration = candidateSpec.subarray(0, declarationStart);
  const hotIdentities = canonArchiveIdentities(hotBeforeDeclaration);
  return hotIdentities.length > 0 && !identities.some((identity) => hotIdentities.includes(identity));
}

function classifyArchiveEvolution({ baseDeclarations, candidateDeclarations, baseTree, candidateTree, specPrefix }) {
  if (candidateDeclarations.length !== baseDeclarations.length + 1) return { establishedChanged: true, introduced: null };
  let baseIndex = 0;
  const introduced = [];
  for (const candidateItem of candidateDeclarations) {
    const baseItem = baseDeclarations[baseIndex];
    if (baseItem && candidateItem.line === baseItem.line) {
      const baseArchive = baseTree.get(`${specPrefix}/${baseItem.path}`);
      const candidateArchive = candidateTree.get(`${specPrefix}/${candidateItem.path}`);
      if (!baseArchive || !candidateArchive || !candidateArchive.equals(baseArchive)) {
        return { establishedChanged: true, introduced: null };
      }
      baseIndex += 1;
    } else {
      introduced.push(candidateItem);
    }
  }
  if (baseIndex !== baseDeclarations.length || introduced.length !== 1) {
    return { establishedChanged: true, introduced: null };
  }
  const item = introduced[0];
  if (baseDeclarations.some((baseItem) => baseItem.path === item.path)) {
    return { establishedChanged: true, introduced: null };
  }
  return { establishedChanged: false, introduced: item };
}

export function validateJobOrderEvolution({ root, specId, jobOrder, base, candidate }) {
  const errors = [];
  if (!FULL_SHA.test(base || "") || !FULL_SHA.test(candidate || "")) {
    add(errors, "usage.ref", ".", "base and candidate must both be full lowercase 40-hex SHAs");
    return result({ spec: specId, jobOrder, errors });
  }
  const normalizedRoot = path.resolve(root);
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(normalizedRoot);
  } catch {
    add(errors, "path.root", ".", "repository root does not exist");
    return result({ spec: specId, jobOrder, errors });
  }
  let gitContext;
  try {
    try {
      gitContext = exactRefGitContext(canonicalRoot);
      const checkedOut = exactRefGit(gitContext, ["rev-parse", "HEAD"]).trim();
      if (checkedOut !== candidate) {
        add(errors, "evolution.candidate-not-checked-out", ".", "the exact candidate must be checked out before evolution validation");
      }
      if (exactRefGit(gitContext, ["status", "--porcelain", "--untracked-files=all"]).trim()) {
        add(errors, "evolution.candidate-worktree-dirty", ".", "the checked-out candidate worktree must be clean");
      }
    } catch {
      add(errors, "evolution.candidate-checkout", ".", "the exact candidate checkout could not be verified");
    }
    if (errors.length) return result({ spec: specId, jobOrder, errors });
    const specsLane = laneRelative(canonicalRoot, "specs");
    const specsRoot = path.join(canonicalRoot, specsLane);
    if (!requirePlainDirectory(specsRoot, canonicalRoot, errors, specsLane)) return result({ spec: specId, jobOrder, errors });
    const specDir = resolveUniqueDirectory(specsRoot, specId, errors, "Spec");
    if (specDir && !requirePlainDirectory(specDir, canonicalRoot, errors, "Spec")) return result({ spec: specId, jobOrder, errors });
    const jobOrdersRoot = specDir ? path.join(specDir, "job-orders") : null;
    if (jobOrdersRoot && !requirePlainDirectory(jobOrdersRoot, specDir, errors, "job-orders")) return result({ spec: specId, jobOrder, errors });
    const orderDir = jobOrdersRoot ? resolveUniqueDirectory(jobOrdersRoot, jobOrder, errors, "Job Order") : null;
    if (orderDir && !requirePlainDirectory(orderDir, specDir, errors, "Job Order")) return result({ spec: specId, jobOrder, errors });
    if (!specDir || !orderDir) return result({ spec: specId, jobOrder, errors });
    const specPrefix = path.relative(canonicalRoot, specDir).split(path.sep).join("/");
    const prefix = path.relative(canonicalRoot, orderDir).split(path.sep).join("/");
    let baseTree;
    let candidateTree;
    try {
      baseTree = treeMap(gitContext, base, specPrefix);
      candidateTree = treeMap(gitContext, candidate, specPrefix);
    } catch {
      add(errors, "evolution.load", prefix, "exact Git trees could not be loaded");
      return result({ spec: specId, jobOrder, errors });
    }
    const contextPath = `${prefix}/CONTEXT.md`;
    const baseContext = baseTree.get(contextPath);
    const candidateContext = candidateTree.get(contextPath);
    if (baseContext && (!candidateContext || !candidateContext.subarray(0, baseContext.length).equals(baseContext))) {
      add(errors, "append.context-overwrite", contextPath, "candidate Context must preserve the exact base bytes as a prefix");
    }
    const handoffPrefix = `${prefix}/handoffs/`;
    for (const [name, bytes] of baseTree) {
      if (!name.startsWith(handoffPrefix) || name.endsWith("/README.md")) continue;
      const next = candidateTree.get(name);
      if (!next || !next.equals(bytes)) add(errors, "append.handoff-modified", name, "an existing handoff receipt was changed, removed, or renamed");
    }
    const specPath = `${specPrefix}/SPEC.md`;
    const baseSpec = baseTree.get(specPath);
    const candidateSpec = candidateTree.get(specPath);
    if (baseSpec && candidateSpec) {
      let baseDeclaration = null;
      let candidateDeclaration = null;
      try { baseDeclaration = parseSpecEvidenceDeclaration(baseSpec.toString("utf8")); } catch {}
      try { candidateDeclaration = parseSpecEvidenceDeclaration(candidateSpec.toString("utf8")); } catch {}
      const baseDeclarations = baseDeclaration ? (Array.isArray(baseDeclaration) ? baseDeclaration : [baseDeclaration]) : [];
      const candidateDeclarations = candidateDeclaration ? (Array.isArray(candidateDeclaration) ? candidateDeclaration : [candidateDeclaration]) : [];
      if (baseDeclarations.length) {
        const unchanged = candidateDeclarations.length === baseDeclarations.length
          && baseDeclarations.every((item, index) => {
            const candidateItem = candidateDeclarations[index];
            const baseArchive = baseTree.get(`${specPrefix}/${item.path}`);
            const candidateArchive = candidateItem && candidateTree.get(`${specPrefix}/${candidateItem.path}`);
            return candidateItem?.line === item.line && baseArchive && candidateArchive && candidateArchive.equals(baseArchive);
          });
        const insertion = unchanged ? null : classifyArchiveEvolution({
          baseDeclarations,
          candidateDeclarations,
          baseTree,
          candidateTree,
          specPrefix,
        });
        if (!unchanged && insertion.establishedChanged) {
          add(errors, "append.archive-modified", specPath, "declared archived evidence is immutable after introduction");
        } else if (!unchanged) {
          const introduced = insertion.introduced;
          const introducedArchive = candidateTree.get(`${specPrefix}/${introduced.path}`);
          const validIntroduction = introduced.kind === "canon"
            ? preservesCanonArchiveIntroduction(baseSpec, candidateSpec, introduced, introducedArchive, baseDeclarations, candidateDeclarations)
            : candidateDeclarations.at(-1) === introduced
              && preservesArchiveIntroduction(baseSpec, candidateSpec, introduced, introducedArchive);
          if (!validIntroduction) {
            add(errors, "append.archive-introduction-mismatch", specPath, "new archived evidence must exactly replace its original evidence bytes at the declaration location");
          }
        } else {
          const baseBounds = evidenceSectionBounds(baseSpec);
          const candidateBounds = evidenceSectionBounds(candidateSpec);
          const baseEvidence = baseBounds && baseSpec.subarray(baseBounds.start, baseBounds.end);
          const candidateEvidence = candidateBounds && candidateSpec.subarray(candidateBounds.start, candidateBounds.end);
          if (!baseEvidence || !candidateEvidence
              || candidateEvidence.length < baseEvidence.length
              || !candidateEvidence.subarray(0, baseEvidence.length).equals(baseEvidence)) {
            add(errors, "append.evidence-prefix-modified", specPath, "candidate evidence must preserve the complete base physical evidence section as an exact byte prefix");
          } else {
            const appended = candidateEvidence.subarray(baseEvidence.length);
            const establishedRows = evidenceRowKeys(baseEvidence);
            for (const item of baseDeclarations) {
              for (const key of evidenceRowKeys(baseTree.get(`${specPrefix}/${item.path}`) || Buffer.alloc(0))) establishedRows.add(key);
            }
            const { lines, remainder } = completeLines(appended);
            if (appended.length && (remainder.length
                || !lines.some(isEvidenceRow)
                || lines.some((line) => !isEvidenceRow(line) && !isEvidenceSeparator(line)))) {
              add(errors, "append.evidence-prefix-modified", specPath, "candidate evidence may add only complete terminal Grounding rows");
            } else if (!lawfulNovelEvidenceAppends(appended, establishedRows)) {
              add(errors, "append.archive-row-reintroduced", specPath, "a later Grounding row may not repeat any archived or established evidence row byte-for-byte");
            }
          }
        }
      } else if (candidateDeclarations.length) {
        const introduced = candidateDeclarations[0];
        const candidateArchive = candidateTree.get(`${specPrefix}/${introduced.path}`);
        if (candidateDeclarations.length !== 1 || !preservesArchiveIntroduction(baseSpec, candidateSpec, introduced, candidateArchive)) {
          add(errors, "append.archive-introduction-mismatch", specPath, "new archived evidence must exactly replace its original evidence bytes at the declaration location");
        }
      }
    }
    const baseOrder = baseTree.get(`${prefix}/JOB_ORDER.md`);
    const terminal = baseOrder ? TERMINAL.has(fieldFromBytes(baseOrder, "Status")) : false;
    if (terminal) {
      const names = new Set(
        [...baseTree.keys(), ...candidateTree.keys()].filter((name) => name.startsWith(`${prefix}/`)),
      );
      if ([...names].some((name) => !baseTree.get(name)?.equals(candidateTree.get(name)))) {
        add(errors, "terminal.freeze-violation", prefix, "a terminal Job Order tree must remain byte-identical");
      }
    }
    return result({ spec: specId, jobOrder, errors, appendOnly: true, terminalFreeze: terminal });
  } finally {
    gitContext?.cleanup?.();
  }
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write("usage: job-order-workspace.mjs validate --spec S-### --job-order JO-XXXXXX [--root PATH] [--base SHA --candidate SHA] [--canon-archive-expected-sha SHA --canon-archive-remote URL_OR_PATH --canon-archive-ref REFS/HEADS/NAME] [--json]\n");
  return 2;
}

function parseArgs(argv) {
  if (argv[0] !== "validate") throw new Error("validate is the only supported command");
  const values = { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      values.json = true;
      continue;
    }
    if (!["--root", "--spec", "--job-order", "--base", "--candidate", "--canon-archive-expected-sha", "--canon-archive-remote", "--canon-archive-ref"].includes(arg) || index + 1 >= argv.length) {
      throw new Error(`invalid argument ${arg}`);
    }
    const key = arg === "--spec" ? "specId"
      : arg === "--canon-archive-expected-sha" ? "canonArchiveExpectedSha"
        : arg === "--canon-archive-remote" ? "canonArchiveRemote"
          : arg === "--canon-archive-ref" ? "canonArchiveRef"
            : arg.slice(2).replace("job-order", "jobOrder");
    values[key] = argv[index + 1];
    index += 1;
  }
  if (!values.specId || !values.jobOrder) throw new Error("--spec and --job-order are required");
  if ((values.base && !values.candidate) || (!values.base && values.candidate)) throw new Error("--base and --candidate must be supplied together");
  const canonInputs = [values.canonArchiveExpectedSha, values.canonArchiveRemote, values.canonArchiveRef].filter(Boolean).length;
  if (canonInputs !== 0 && canonInputs !== 3) {
    throw new Error("--canon-archive-expected-sha, --canon-archive-remote, and --canon-archive-ref must be supplied together");
  }
  if (values.base && (!FULL_SHA.test(values.base) || !FULL_SHA.test(values.candidate))) throw new Error("exact refs must be full lowercase 40-hex SHAs");
  return values;
}

function printHuman(value) {
  if (value.ok) {
    process.stdout.write(`Job Order workspace valid: ${value.spec} ${value.jobOrder}\n`);
    return;
  }
  for (const error of value.errors) process.stderr.write(`${error.code}: ${error.path}: ${error.detail}\n`);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.exitCode = usage(error.message);
    return;
  }
  let value = validateJobOrderWorkspace(args);
  if (args.base) {
    const evolution = validateJobOrderEvolution(args);
    const errors = [...value.errors, ...evolution.errors];
    value = result({
      spec: args.specId,
      jobOrder: args.jobOrder,
      errors,
      structure: value.checked.structure,
      appendOnly: evolution.checked.appendOnly,
      terminalFreeze: evolution.checked.terminalFreeze,
      modelVersion: value.modelVersion,
      launchModel: errors.length ? null : value.launchModel,
    });
  }
  if (args.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else printHuman(value);
  process.exitCode = value.ok ? 0 : 1;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) main();
