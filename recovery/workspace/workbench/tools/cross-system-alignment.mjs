#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA_VERSION = "1.0";
export const FIVE_SEAT_ROSTER = [
  { id: "the owner", kind: "owner" },
  { id: "Servitor-1A", host: 1, model: "A", hostName: "Mac Mini", modelName: "Codex" },
  { id: "Servitor-2A", host: 2, model: "A", hostName: "Windows PC", modelName: "Codex" },
  { id: "Servitor-1B", host: 1, model: "B", hostName: "Mac Mini", modelName: "Claude" },
  { id: "Servitor-2B", host: 2, model: "B", hostName: "Windows PC", modelName: "Claude" },
];
export const SHARED_CONTROL_FILES = [
  "AGENTS.md",
  "BLUEPRINT.md",
  "CLAUDE.md",
  "README.md",
  "RUNBOOK.md",
  "LEXICON.md",
  "Projects/INDEX.md",
];

const ROLE_FILES = ["Captain", "Scout", "Designer", "Planner", "Engineer", "Auditor"];
const AUTHORITY_ORDER = [
  "verified live project controls and runtime",
  "stable specs",
  "Blueprint and shared vocabulary",
  "maintained Wiki",
  "derived indexes or reports",
];
const SYSTEM_ROLES = ["WORKSPACE", "LLM Workbench", "OpenBrain", "Command Information Center", "Wiki"];
const VERIFICATION_STATUSES = new Set(["collected", "passed", "failed", "stale", "unverifiable"]);
const HANDOFF_STATUSES = new Set(["ready", "in-progress", "blocked", "completed"]);
const FRESHNESS_STATUSES = new Set(["current", "dirty", "stale", "unverifiable"]);
const GIT_STATUSES = new Set(["clean-published", "clean-unpublished", "dirty", "unverifiable"]);
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DEFAULT_MAX_AGE_SECONDS = 900;
const HANDOFF_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function exactKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`unknown ${label} key: ${key}`);
  }
}

export function hashNormalized(value) {
  return createHash("sha256").update(value.replaceAll("\r\n", "\n")).digest("hex");
}

function redact(value) {
  return String(value || "")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+)\b/g, "[REDACTED TOKEN]")
    .replace(/\b(Authorization\s*:\s*)(?:Bearer|Basic)\s+\S+/gi, "$1[REDACTED]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*[:=]\s*["']?[^\s,"';}]+["']?/g,
      "$1=[REDACTED]",
    )
    .replace(/\bssh-(?:rsa|ed25519)\s+[A-Za-z0-9+/=]+(?:\s+\S+)?/g, "[REDACTED SSH KEY]");
}

function containsCredentialMaterial(value) {
  return /"?(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AWS_SESSION_TOKEN|[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)"?\s*[:=]\s*["']?(?!\[REDACTED\])[^\s,"'}]+/.test(
    String(value || ""),
  );
}

function validPeerHost(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(value);
}

function peerPlatform(root) {
  if (typeof root !== "string") return null;
  if (/^(?:\/[A-Za-z0-9._ -]+)+\/WORKSPACE$/.test(root)) return "darwin";
  if (/^[A-Za-z]:\\(?:[A-Za-z0-9._ -]+\\)*WORKSPACE$/i.test(root)) return "win32";
  return null;
}

function peerScriptPath(root) {
  const platform = peerPlatform(root);
  if (platform === "darwin") return posix.join(root, "tools", "cross-system-alignment.mjs");
  if (platform === "win32") return win32.join(root, "tools", "cross-system-alignment.mjs");
  return null;
}

function knownSeat(id) {
  return FIVE_SEAT_ROSTER.find((participant) => participant.id === id && participant.kind !== "owner") || null;
}

function allowedGitArgs(args) {
  const fixed = new Set([
    "branch --show-current",
    "rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
    "status --porcelain",
    "rev-parse HEAD",
    "rev-list --left-right --count HEAD...@{upstream}",
    "--version",
  ]);
  if (fixed.has(args.join(" "))) return true;
  return args.length === 3
    && args[0] === "ls-remote"
    && args[1] === "origin"
    && /^refs\/heads\/[A-Za-z0-9._/-]+$/.test(args[2])
    && !args[2].includes("..");
}

function allowedSshArgs(args) {
  if (
    args.length !== 12
    || args.slice(0, 4).join(" ") !== "-o BatchMode=yes -o ConnectTimeout=10"
    || !validPeerHost(args[4])
    || args[5] !== "node"
    || args[7] !== "snapshot"
    || args[8] !== "--root"
    || args[10] !== "--seat"
  ) return false;
  const root = args[9];
  const seat = knownSeat(args[11]);
  return Boolean(seat)
    && args[6] === peerScriptPath(root)
    && ((seat.host === 1 && peerPlatform(root) === "darwin") || (seat.host === 2 && peerPlatform(root) === "win32"));
}

export function runReadOnlyCommand(command, args, options = {}) {
  const allowed = (command === "git" && allowedGitArgs(args))
    || (command === "node" && args.length === 1 && args[0] === "--version")
    || (command === "hostname" && args.length === 0)
    || (command === "ssh" && allowedSshArgs(args));
  if (!allowed) throw new Error(`unsupported read-only command: ${command}`);

  const executor = options.executor || spawnSync;
  let result;
  try {
    result = executor(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      timeout: options.timeout ?? 10_000,
      maxBuffer: 64 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: redact(error.message),
      exitCode: null,
      timedOut: false,
      classification: "spawn-error",
    };
  }

  const timedOut = result?.error?.code === "ETIMEDOUT";
  const exitCode = Number.isInteger(result?.status) ? result.status : null;
  const classification = timedOut
    ? "timeout"
    : result?.error
      ? "spawn-error"
      : exitCode === 0
        ? "ok"
        : "exit-error";
  return {
    ok: classification === "ok",
    stdout: redact(result?.stdout).trim().slice(0, 64 * 1024),
    stderr: redact(result?.stderr || result?.error?.message).trim().slice(0, 4 * 1024),
    exitCode,
    timedOut,
    classification,
  };
}

function commandResult(command, args, root, options = {}) {
  return runReadOnlyCommand(command, args, { ...options, cwd: root });
}

function commandValue(command, args, root, options = {}) {
  const result = commandResult(command, args, root, options);
  return result.ok ? result.stdout : null;
}

function readRequired(root, relative) {
  const file = join(root, relative);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function snapshotFreshness(collectedAt, now, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  const ageSeconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(collectedAt)) / 1000));
  const stale = ageSeconds > maxAgeSeconds;
  return {
    status: stale ? "stale" : "current",
    ageSeconds,
    maxAgeSeconds,
    reason: stale ? "snapshot exceeds max age" : null,
  };
}

function timedEvidence(checkedAt, now, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS) {
  if (!isoDate(checkedAt) || !isoDate(now)) {
    return { freshness: "unverifiable", ageSeconds: null, maxAgeSeconds };
  }
  const rawAgeSeconds = Math.floor((Date.parse(now) - Date.parse(checkedAt)) / 1000);
  if (rawAgeSeconds < -60) {
    return { freshness: "unverifiable", ageSeconds: null, maxAgeSeconds };
  }
  const ageSeconds = Math.max(0, rawAgeSeconds);
  return {
    freshness: ageSeconds > maxAgeSeconds ? "stale" : "current",
    ageSeconds,
    maxAgeSeconds,
  };
}

function collectGit(root, options = {}) {
  const branch = commandValue("git", ["branch", "--show-current"], root, options);
  const upstream = commandValue(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    root,
    options,
  );
  const porcelain = commandValue("git", ["status", "--porcelain"], root, options);
  const head = commandValue("git", ["rev-parse", "HEAD"], root, options);
  const counts = commandValue("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], root, options);
  const [ahead, behind] = counts?.split(/\s+/).map(Number) || [null, null];
  const remote = branch && !branch.includes("..")
    ? commandResult("git", ["ls-remote", "origin", `refs/heads/${branch}`], root, options)
    : null;
  const remoteSha = remote?.ok ? remote.stdout.split(/\s+/)[0] || null : null;
  const dirty = porcelain === null ? null : porcelain.length > 0;
  const remoteContainsHead = remote?.ok && SHA1.test(remoteSha) && SHA1.test(head)
    ? remoteSha === head
    : remote?.ok
      ? false
      : null;
  const publishedBranch = remoteContainsHead ? `origin/${branch}` : null;
  const status = dirty === null || !SHA1.test(head || "") || !Number.isInteger(ahead) || !Number.isInteger(behind)
    ? "unverifiable"
    : dirty
      ? "dirty"
      : remoteContainsHead === true
        ? "clean-published"
        : remoteContainsHead === false
          ? "clean-unpublished"
          : "unverifiable";
  return {
    branch,
    upstream,
    dirty,
    head: SHA1.test(head || "") ? head : null,
    ahead: Number.isInteger(ahead) ? ahead : null,
    behind: Number.isInteger(behind) ? behind : null,
    remoteContainsHead,
    publishedBranch,
    status,
  };
}

export function deriveRecoveryRef(git) {
  if (
    !isObject(git)
    || git.status !== "clean-published"
    || git.dirty !== false
    || git.remoteContainsHead !== true
    || typeof git.publishedBranch !== "string"
    || git.publishedBranch !== `origin/${git.branch}`
    || !SHA1.test(git.head || "")
  ) return null;
  return `${git.publishedBranch}@${git.head}`;
}

export function deriveHandoffFreshness(evidence, options = {}) {
  const now = options.now || new Date().toISOString();
  const maxAgeSeconds = options.maxAgeSeconds || HANDOFF_MAX_AGE_SECONDS;
  const timing = timedEvidence(evidence?.evidenceAt, now, maxAgeSeconds);
  const reasons = [];
  if (timing.freshness === "stale") reasons.push("owning spec evidence is stale");
  if (timing.freshness === "unverifiable") reasons.push("owning spec evidence time is unverifiable");
  if (!isoDate(evidence?.sourceUpdated)) reasons.push("owning spec Updated date is missing");
  if (typeof evidence?.latestEvent !== "string" || !evidence.latestEvent.trim()) {
    reasons.push("owning spec latest event is missing");
  }
  if (
    typeof evidence?.proof !== "string"
    || !evidence.proof.trim()
    || /^(?:pending|tbd|todo|snapshot and comparator pending)[.!]?$/i.test(evidence.proof.trim())
  ) reasons.push("ticket proof is pending");
  const status = timing.freshness === "stale"
    ? "stale"
    : reasons.length
      ? "unverifiable"
      : "current";
  return {
    status,
    sourceUpdated: evidence?.sourceUpdated || null,
    latestEvent: evidence?.latestEvent || null,
    evidenceAt: evidence?.evidenceAt || null,
    ageSeconds: timing.ageSeconds,
    maxAgeSeconds,
    reason: reasons.length ? reasons.join("; ") : null,
  };
}

export function collectHandoffs(root, git, now) {
  const specs = join(root, "specs");
  if (!existsSync(specs)) return [];
  const recoveryRef = deriveRecoveryRef(git);
  const handoffs = [];
  for (const entry of readdirSync(specs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const owningSpec = posix.join("specs", entry.name, "SPEC.md");
    const content = readRequired(root, owningSpec);
    if (!content) continue;
    const specId = content.match(/^\*\*Spec ID:\*\*\s*(S-\d+)/m)?.[1];
    const sourceUpdated = content.match(/^\*\*Updated:\*\*\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || null;
    const latestEvent = content.match(/^\*\*Latest event:\*\*\s*(.+)$/m)?.[1]?.trim() || null;
    if (!specId) continue;
    for (const line of content.split(/\r?\n/)) {
      const cells = line.trim().startsWith("|")
        ? line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
        : [];
      if (!/^TK-\d+$/.test(cells[0] || "") || !HANDOFF_STATUSES.has((cells[2] || "").toLowerCase())) continue;
      const evidenceRows = content.split(/\r?\n/)
        .map((candidate) => candidate.trim().startsWith("|")
          ? candidate.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
          : [])
        .filter((candidate) => /^\d{4}-\d{2}-\d{2}$/.test(candidate[0] || "") && candidate[1] === cells[0]);
      const evidenceDate = evidenceRows.at(-1)?.[0] || null;
      const freshness = deriveHandoffFreshness({
        sourceUpdated,
        latestEvent,
        evidenceAt: evidenceDate ? `${evidenceDate}T00:00:00.000Z` : null,
        proof: cells[4] || null,
      }, { now });
      handoffs.push({
        specId,
        ticketId: cells[0],
        status: cells[2].toLowerCase(),
        owningSpec,
        proof: cells[4] || null,
        publishedBranch: recoveryRef ? git.publishedBranch : null,
        recoveryRef,
        freshness: freshness.status,
        sourceUpdated: freshness.sourceUpdated,
        latestEvent: freshness.latestEvent,
        evidenceAt: freshness.evidenceAt,
        ageSeconds: freshness.ageSeconds,
        maxAgeSeconds: freshness.maxAgeSeconds,
        freshnessReason: freshness.reason,
      });
    }
  }
  return handoffs.sort((left, right) =>
    `${left.specId}/${left.ticketId}`.localeCompare(`${right.specId}/${right.ticketId}`));
}

function pushError(errors, condition, message) {
  if (!condition) errors.push(message);
}

// A timed evidence record carries ages as measured at collection time. Later
// validation accepts any recorded age that is internally consistent and does
// not exceed the truly elapsed time; a record that was current at collection
// may have become stale by validation time, but never the reverse.
function timedRecordConsistent(record, timing) {
  if (record.freshness === "unverifiable") {
    return timing.freshness === "unverifiable" && record.ageSeconds === null;
  }
  return Number.isInteger(record.ageSeconds)
    && record.ageSeconds >= 0
    && Number.isInteger(timing.ageSeconds)
    && record.ageSeconds <= timing.ageSeconds + 60
    && record.freshness === (record.ageSeconds > record.maxAgeSeconds ? "stale" : "current")
    && !(record.freshness === "stale" && timing.freshness === "current");
}

function validateFreshness(snapshot, options, errors) {
  const freshness = snapshot?.freshness;
  pushError(errors, isObject(freshness), "missing freshness");
  if (!isObject(freshness)) return;
  exactKeys(
    freshness,
    ["status", "ageSeconds", "maxAgeSeconds", "reason"],
    "freshness",
    errors,
  );
  pushError(errors, new Set(["current", "stale", "unverifiable"]).has(freshness.status), "invalid freshness status");
  pushError(errors, Number.isInteger(freshness.maxAgeSeconds) && freshness.maxAgeSeconds > 0, "invalid freshness max age");
  pushError(errors, Number.isInteger(freshness.ageSeconds) && freshness.ageSeconds >= 0, "invalid freshness age");
  if (!isoDate(snapshot.collectedAt) || !isoDate(options.now) || !Number.isInteger(freshness.ageSeconds)) return;
  const rawAge = Math.floor((Date.parse(options.now) - Date.parse(snapshot.collectedAt)) / 1000);
  pushError(errors, rawAge >= -60, "collectedAt is implausibly in the future");
  const actualAge = Math.max(0, rawAge);
  pushError(errors, freshness.ageSeconds <= actualAge + 60, "freshness age exceeds elapsed time");
  const recordedStatus = freshness.ageSeconds > freshness.maxAgeSeconds ? "stale" : "current";
  pushError(errors, freshness.status === recordedStatus, "inconsistent freshness status");
  pushError(
    errors,
    recordedStatus === "stale" ? typeof freshness.reason === "string" : freshness.reason === null,
    "inconsistent freshness reason",
  );
}

function validateControlPlane(controlPlane, now, errors) {
  pushError(errors, isObject(controlPlane), "missing controlPlane");
  if (!isObject(controlPlane)) return;
  exactKeys(
    controlPlane,
    [
      "revision", "files", "taskboard", "authorityOrder", "systemRoles",
      "agentRoles", "projectRoutingHash", "wikiRoutingHash",
    ],
    "controlPlane",
    errors,
  );
  pushError(errors, controlPlane.revision === null || SHA1.test(controlPlane.revision), "invalid controlPlane revision");
  pushError(errors, isObject(controlPlane.files), "missing controlPlane files");
  if (isObject(controlPlane.files)) {
    pushError(
      errors,
      same(Object.keys(controlPlane.files).sort(), [...SHARED_CONTROL_FILES].sort()),
      "invalid shared control file set",
    );
    for (const [file, digest] of Object.entries(controlPlane.files)) {
      pushError(errors, SHA256.test(digest), `invalid shared control hash: ${file}`);
    }
  }
  const taskboard = controlPlane.taskboard;
  pushError(errors, isObject(taskboard), "invalid Taskboard freshness evidence");
  if (isObject(taskboard)) {
    exactKeys(
      taskboard,
      ["hash", "checkedAt", "freshness", "ageSeconds", "maxAgeSeconds"],
      "Taskboard",
      errors,
    );
    pushError(
      errors,
      taskboard.hash === null || SHA256.test(taskboard.hash),
      "invalid Taskboard hash",
    );
    pushError(
      errors,
      taskboard.checkedAt === null || isoDate(taskboard.checkedAt),
      "invalid Taskboard checkedAt",
    );
    const timing = timedEvidence(taskboard.checkedAt, now, taskboard.maxAgeSeconds);
    pushError(
      errors,
      Number.isInteger(taskboard.maxAgeSeconds) && taskboard.maxAgeSeconds > 0,
      "invalid Taskboard max age",
    );
    pushError(
      errors,
      timedRecordConsistent(taskboard, timing),
      "inconsistent Taskboard freshness",
    );
    pushError(
      errors,
      taskboard.hash === null
        ? taskboard.freshness === "unverifiable"
        : SHA256.test(taskboard.hash),
      "Taskboard existence does not prove freshness",
    );
  }
  pushError(errors, same(controlPlane.authorityOrder, AUTHORITY_ORDER), "invalid authority order");
  pushError(errors, same(controlPlane.systemRoles, SYSTEM_ROLES), "invalid system roles");
  pushError(errors, same(controlPlane.agentRoles, ROLE_FILES), "invalid agent roles");
  pushError(errors, SHA256.test(controlPlane.projectRoutingHash || ""), "invalid project routing hash");
  pushError(errors, SHA256.test(controlPlane.wikiRoutingHash || ""), "invalid Wiki routing hash");
  if (isObject(controlPlane.files)) {
    pushError(
      errors,
      controlPlane.projectRoutingHash === controlPlane.files["Projects/INDEX.md"],
      "project routing hash does not match shared control hash",
    );
  }
}

function validateGit(git, errors) {
  pushError(errors, isObject(git), "missing git");
  if (!isObject(git)) return;
  exactKeys(
    git,
    [
      "branch", "upstream", "dirty", "head", "ahead", "behind",
      "remoteContainsHead", "publishedBranch", "status",
    ],
    "git",
    errors,
  );
  pushError(errors, git.branch === null || typeof git.branch === "string", "invalid git branch");
  pushError(errors, git.upstream === null || typeof git.upstream === "string", "invalid git upstream");
  pushError(errors, git.dirty === null || typeof git.dirty === "boolean", "invalid git dirty state");
  pushError(errors, git.head === null || SHA1.test(git.head), "invalid git head");
  pushError(errors, git.ahead === null || (Number.isInteger(git.ahead) && git.ahead >= 0), "invalid git ahead");
  pushError(errors, git.behind === null || (Number.isInteger(git.behind) && git.behind >= 0), "invalid git behind");
  pushError(errors, git.remoteContainsHead === null || typeof git.remoteContainsHead === "boolean", "invalid remote containment");
  pushError(errors, git.publishedBranch === null || /^origin\/[A-Za-z0-9._/-]+$/.test(git.publishedBranch), "invalid published branch");
  pushError(errors, GIT_STATUSES.has(git.status), "invalid git status");
  if (git.status === "clean-published") {
    pushError(
      errors,
      git.dirty === false
        && git.remoteContainsHead === true
        && git.publishedBranch === `origin/${git.branch}`,
      "inconsistent published branch or git state",
    );
  }
  if (git.status === "dirty") pushError(errors, git.dirty === true, "inconsistent dirty git state");
  if (git.status === "clean-unpublished") {
    pushError(errors, git.dirty === false && git.remoteContainsHead === false && git.publishedBranch === null, "inconsistent unpublished git state");
  }
}

function validateVerification(verification, now, errors) {
  pushError(errors, isObject(verification), "missing verification");
  if (!isObject(verification)) return;
  exactKeys(verification, ["controlPlane", "projectIndex", "wiki"], "verification", errors);
  for (const name of ["controlPlane", "projectIndex", "wiki"]) {
    const result = verification[name];
    pushError(errors, isObject(result), `missing verification ${name}`);
    if (!isObject(result)) continue;
    exactKeys(
      result,
      ["status", "checkedAt", "freshness", "ageSeconds", "maxAgeSeconds"],
      `verification ${name}`,
      errors,
    );
    pushError(errors, VERIFICATION_STATUSES.has(result.status), `invalid verification status: ${name}`);
    pushError(errors, result.checkedAt === null || isoDate(result.checkedAt), `invalid verification timestamp: ${name}`);
    pushError(
      errors,
      result.status === "unverifiable" ? result.checkedAt === null : isoDate(result.checkedAt),
      `inconsistent verification evidence: ${name}`,
    );
    const timing = timedEvidence(result.checkedAt, now, result.maxAgeSeconds);
    pushError(
      errors,
      Number.isInteger(result.maxAgeSeconds) && result.maxAgeSeconds > 0,
      `invalid verification max age: ${name}`,
    );
    pushError(
      errors,
      timedRecordConsistent(result, timing),
      `inconsistent verification freshness: ${name}`,
    );
  }
}

function validateHandoffs(handoffs, git, now, errors) {
  pushError(errors, Array.isArray(handoffs), "missing handoffs");
  if (!Array.isArray(handoffs)) return;
  const expectedRecovery = deriveRecoveryRef(git);
  for (const [index, handoff] of handoffs.entries()) {
    const prefix = `handoff ${index}`;
    pushError(errors, isObject(handoff), `invalid ${prefix}`);
    if (!isObject(handoff)) continue;
    exactKeys(
      handoff,
      [
        "specId", "ticketId", "status", "owningSpec", "proof",
        "publishedBranch", "recoveryRef", "freshness", "sourceUpdated",
        "latestEvent", "evidenceAt", "ageSeconds", "maxAgeSeconds",
        "freshnessReason",
      ],
      prefix,
      errors,
    );
    pushError(errors, /^S-\d+$/.test(handoff.specId || ""), `invalid ${prefix} spec`);
    pushError(errors, /^TK-\d+$/.test(handoff.ticketId || ""), `invalid ${prefix} ticket`);
    pushError(errors, HANDOFF_STATUSES.has(handoff.status), `invalid ${prefix} status`);
    pushError(
      errors,
      typeof handoff.owningSpec === "string"
        && /^specs\/[^/]+\/SPEC\.md$/.test(handoff.owningSpec)
        && !handoff.owningSpec.includes(".."),
      `invalid ${prefix} owning spec`,
    );
    pushError(errors, handoff.proof === null || typeof handoff.proof === "string", `invalid ${prefix} proof`);
    pushError(errors, handoff.publishedBranch === null || handoff.publishedBranch === git.publishedBranch, `invalid ${prefix} published branch`);
    pushError(errors, handoff.recoveryRef === expectedRecovery, `invalid ${prefix} recovery ref`);
    pushError(errors, FRESHNESS_STATUSES.has(handoff.freshness), `invalid ${prefix} freshness`);
    const derived = deriveHandoffFreshness({
      sourceUpdated: handoff.sourceUpdated,
      latestEvent: handoff.latestEvent,
      evidenceAt: handoff.evidenceAt,
      proof: handoff.proof,
    }, { now, maxAgeSeconds: handoff.maxAgeSeconds });
    const becameStale = handoff.freshness === "current" && derived.status === "stale";
    pushError(
      errors,
      becameStale
        ? Number.isInteger(handoff.ageSeconds)
          && Number.isInteger(derived.ageSeconds)
          && handoff.ageSeconds <= derived.ageSeconds + 60
          && handoff.freshnessReason === null
        : handoff.freshness === derived.status
          && handoff.freshnessReason === derived.reason
          && (
            handoff.ageSeconds === derived.ageSeconds
            || (
              Number.isInteger(handoff.ageSeconds)
              && Number.isInteger(derived.ageSeconds)
              && handoff.ageSeconds <= derived.ageSeconds + 60
            )
          ),
      `inconsistent ${prefix} owning-spec freshness`,
    );
    if (!expectedRecovery) {
      pushError(errors, handoff.recoveryRef === null && handoff.publishedBranch === null, `false ${prefix} recovery evidence`);
    }
  }
}

export function validateSnapshot(snapshot, options = {}) {
  const now = options.now || new Date().toISOString();
  const errors = [];
  pushError(errors, isObject(snapshot), "snapshot must be an object");
  if (!isObject(snapshot)) return { valid: false, errors };
  exactKeys(
    snapshot,
    [
      "schemaVersion", "collectedAt", "freshness", "seat", "roster",
      "host", "controlPlane", "tools", "git", "verification", "handoffs",
    ],
    "snapshot",
    errors,
  );
  pushError(errors, snapshot.schemaVersion === SCHEMA_VERSION, "unsupported schema version");
  pushError(errors, isoDate(snapshot.collectedAt), "invalid collectedAt");
  validateFreshness(snapshot, { now }, errors);

  const seat = knownSeat(snapshot?.seat?.id);
  pushError(errors, Boolean(seat) && same(snapshot.seat, seat), "invalid Servitor seat mapping");
  pushError(errors, same(snapshot.roster, FIVE_SEAT_ROSTER), "invalid five-seat roster mapping");
  pushError(errors, isObject(snapshot.host), "missing host");
  if (seat && isObject(snapshot.host)) {
    exactKeys(snapshot.host, ["device", "platform", "root"], "host", errors);
    const platform = seat.host === 1 ? "darwin" : "win32";
    pushError(errors, snapshot.host.platform === platform, "seat and host platform are inconsistent");
    pushError(errors, peerPlatform(snapshot.host.root) === platform, "host root and platform are inconsistent");
    pushError(errors, typeof snapshot.host.device === "string" && snapshot.host.device.length > 0, "invalid host device");
  }

  validateControlPlane(snapshot.controlPlane, now, errors);
  pushError(errors, isObject(snapshot.tools), "missing tools");
  if (isObject(snapshot.tools)) {
    exactKeys(snapshot.tools, ["git", "node"], "tools", errors);
    for (const name of ["git", "node"]) {
      const tool = snapshot.tools[name];
      exactKeys(tool, ["available", "version", "status"], `tool ${name}`, errors);
      pushError(
        errors,
        isObject(tool)
          && typeof tool.available === "boolean"
          && (tool.version === null || typeof tool.version === "string")
          && new Set(["verified", "unverifiable"]).has(tool.status)
          && (tool.available
            ? tool.status === "verified" && typeof tool.version === "string" && tool.version.length > 0
            : tool.status === "unverifiable" && tool.version === null),
        `invalid tool evidence: ${name}`,
      );
    }
  }
  validateGit(snapshot.git, errors);
  validateVerification(snapshot.verification, now, errors);
  validateHandoffs(snapshot.handoffs, snapshot.git, now, errors);
  return { valid: errors.length === 0, errors };
}

export function collectSnapshot({
  root = process.cwd(),
  seat,
  now = new Date().toISOString(),
  maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  commandOptions = {},
} = {}) {
  const absoluteRoot = resolve(root);
  const seatRecord = knownSeat(seat);
  if (!seatRecord) throw new Error("--seat must name one of the four Servitor seats");
  const expectedPlatform = seatRecord.host === 1 ? "darwin" : "win32";
  if (process.platform !== expectedPlatform) throw new Error(`seat ${seat} is inconsistent with platform ${process.platform}`);

  const contents = Object.fromEntries(
    SHARED_CONTROL_FILES.map((relative) => [relative, readRequired(absoluteRoot, relative)]),
  );
  const missing = Object.entries(contents).filter(([, content]) => content === null).map(([relative]) => relative);
  if (missing.length) throw new Error(`required control files missing: ${missing.join(", ")}`);

  const git = collectGit(absoluteRoot, commandOptions);
  const wiki = readRequired(absoluteRoot, "Wiki/MEMORY.md");
  const taskboard = readRequired(absoluteRoot, "TASKBOARD.md");
  const taskboardCheckedAt = taskboard
    ? statSync(join(absoluteRoot, "TASKBOARD.md")).mtime.toISOString()
    : null;
  const taskboardTiming = timedEvidence(taskboardCheckedAt, now, maxAgeSeconds);
  const gitVersion = commandValue("git", ["--version"], absoluteRoot, commandOptions);
  const nodeVersion = commandValue("node", ["--version"], absoluteRoot, commandOptions);
  const collectedTiming = timedEvidence(now, now, maxAgeSeconds);
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    collectedAt: now,
    freshness: snapshotFreshness(now, now, maxAgeSeconds),
    seat: seatRecord,
    roster: FIVE_SEAT_ROSTER,
    host: {
      device: commandValue("hostname", [], absoluteRoot, commandOptions),
      platform: process.platform,
      root: absoluteRoot,
    },
    controlPlane: {
      revision: git.head,
      files: Object.fromEntries(
        Object.entries(contents).map(([relative, content]) => [relative, hashNormalized(content)]),
      ),
      taskboard: {
        hash: taskboard ? hashNormalized(taskboard) : null,
        checkedAt: taskboardCheckedAt,
        freshness: taskboardTiming.freshness,
        ageSeconds: taskboardTiming.ageSeconds,
        maxAgeSeconds: taskboardTiming.maxAgeSeconds,
      },
      authorityOrder: AUTHORITY_ORDER,
      systemRoles: SYSTEM_ROLES,
      agentRoles: ROLE_FILES.filter((role) => existsSync(join(absoluteRoot, "Roles", `${role}.md`))),
      projectRoutingHash: hashNormalized(contents["Projects/INDEX.md"]),
      wikiRoutingHash: wiki ? hashNormalized(wiki) : null,
    },
    tools: {
      git: { available: gitVersion !== null, version: gitVersion, status: gitVersion !== null ? "verified" : "unverifiable" },
      node: { available: nodeVersion !== null, version: nodeVersion, status: nodeVersion !== null ? "verified" : "unverifiable" },
    },
    git,
    verification: {
      controlPlane: { status: "collected", checkedAt: now, ...collectedTiming },
      projectIndex: { status: "collected", checkedAt: now, ...collectedTiming },
      wiki: wiki
        ? { status: "collected", checkedAt: now, ...collectedTiming }
        : {
            status: "unverifiable",
            checkedAt: null,
            freshness: "unverifiable",
            ageSeconds: null,
            maxAgeSeconds,
          },
    },
    handoffs: [],
  };
  snapshot.handoffs = collectHandoffs(absoluteRoot, git, now);
  return snapshot;
}

const SHARED_FIELDS = [
  "schemaVersion",
  "roster",
  "controlPlane.revision",
  "controlPlane.files",
  "controlPlane.authorityOrder",
  "controlPlane.systemRoles",
  "controlPlane.agentRoles",
  "controlPlane.projectRoutingHash",
  "controlPlane.wikiRoutingHash",
];
const EXPECTED_FIELDS = [
  "freshness",
  "seat",
  "host",
  "controlPlane.taskboard",
  "tools",
  "git",
  "verification",
  "handoffs",
];

function get(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function evidenceUnverifiable(field, left, right, context = {}) {
  const now = context.now || new Date().toISOString();
  if (field === "freshness") {
    return [[left, context.local], [right, context.peer]].some(([side, source]) =>
      side?.status !== "current"
      || timedEvidence(source?.collectedAt, now, side?.maxAgeSeconds).freshness !== "current");
  }
  if (field === "controlPlane.taskboard") {
    return [left, right].some((side) =>
      side?.freshness !== "current"
      || timedEvidence(side?.checkedAt, now, side?.maxAgeSeconds).freshness !== "current");
  }
  if (field === "git") return left?.status === "unverifiable" || right?.status === "unverifiable";
  if (field === "verification") {
    return [left, right].some((side) =>
      Object.values(side || {}).some((result) =>
        result?.freshness !== "current"
        || timedEvidence(result?.checkedAt, now, result?.maxAgeSeconds).freshness !== "current"
        || new Set(["failed", "stale", "unverifiable"]).has(result?.status)));
  }
  if (field === "handoffs") {
    return [left, right].some((side) =>
      (side || []).some((handoff) =>
        new Set(["stale", "unverifiable"]).has(handoff?.freshness)
        || new Set(["stale", "unverifiable"]).has(deriveHandoffFreshness({
          sourceUpdated: handoff?.sourceUpdated,
          latestEvent: handoff?.latestEvent,
          evidenceAt: handoff?.evidenceAt,
          proof: handoff?.proof,
        }, { now, maxAgeSeconds: handoff?.maxAgeSeconds }).status)));
  }
  return left === null || left === undefined || right === null || right === undefined;
}

export function compareSnapshots(local, peer, options = {}) {
  const now = options.now || new Date().toISOString();
  const localValidation = validateSnapshot(local, { ...options, now });
  const peerValidation = validateSnapshot(peer, { ...options, now });
  const fields = {};
  for (const field of [...SHARED_FIELDS, ...EXPECTED_FIELDS]) {
    const left = get(local, field);
    const right = get(peer, field);
    fields[field] = {
      classification: evidenceUnverifiable(field, left, right, { now, local, peer })
        ? "unverifiable"
        : same(left, right)
          ? "aligned"
          : SHARED_FIELDS.includes(field)
            ? "drift"
            : "expected-divergence",
      local: left,
      peer: right,
    };
  }
  if (!localValidation.valid || !peerValidation.valid) {
    fields.snapshot = {
      classification: "unverifiable",
      local: localValidation.errors,
      peer: peerValidation.errors,
    };
  }
  if (local?.seat?.id && local?.seat?.id === peer?.seat?.id) {
    fields.seatIdentity = {
      classification: "unverifiable",
      local: local.seat.id,
      peer: peer.seat.id,
    };
  }
  const classifications = Object.values(fields).map((field) => field.classification);
  const overall = classifications.includes("unverifiable")
    ? "unverifiable"
    : classifications.includes("drift")
      ? "drift"
      : "aligned";
  return {
    schemaVersion: SCHEMA_VERSION,
    overall,
    fields,
    localSeat: local?.seat?.id ?? null,
    peerSeat: peer?.seat?.id ?? null,
  };
}

export function summarizeComparison(result) {
  const counts = Object.values(result.fields).reduce((summary, field) => {
    summary[field.classification] = (summary[field.classification] || 0) + 1;
    return summary;
  }, {});
  const material = Object.entries(result.fields)
    .filter(([, field]) => new Set(["drift", "unverifiable"]).has(field.classification))
    .map(([field]) => field);
  return `${result.localSeat ?? "local"} vs ${result.peerSeat ?? "peer"}: ${result.overall}; `
    + `${counts.aligned || 0} aligned, ${counts["expected-divergence"] || 0} expected differences, `
    + `${counts.drift || 0} drift, ${counts.unverifiable || 0} unverifiable.`
    + (material.length ? ` Check ${material.join(", ")}.` : "");
}

function sanitizedSnapshot(snapshot) {
  const verification = Object.fromEntries(
    ["controlPlane", "projectIndex", "wiki"].map((name) => [
      name,
      {
        status: snapshot.verification[name].status,
        checkedAt: snapshot.verification[name].checkedAt,
        freshness: snapshot.verification[name].freshness,
        ageSeconds: snapshot.verification[name].ageSeconds,
        maxAgeSeconds: snapshot.verification[name].maxAgeSeconds,
      },
    ]),
  );
  return {
    schemaVersion: snapshot.schemaVersion,
    collectedAt: snapshot.collectedAt,
    freshness: {
      status: snapshot.freshness.status,
      ageSeconds: snapshot.freshness.ageSeconds,
      maxAgeSeconds: snapshot.freshness.maxAgeSeconds,
      reason: snapshot.freshness.reason,
    },
    seat: { ...snapshot.seat },
    roster: snapshot.roster.map((participant) => ({ ...participant })),
    host: {
      device: snapshot.host.device,
      platform: snapshot.host.platform,
      root: snapshot.host.root,
    },
    controlPlane: {
      revision: snapshot.controlPlane.revision,
      files: Object.fromEntries(
        SHARED_CONTROL_FILES.map((file) => [file, snapshot.controlPlane.files[file]]),
      ),
      taskboard: {
        hash: snapshot.controlPlane.taskboard.hash,
        checkedAt: snapshot.controlPlane.taskboard.checkedAt,
        freshness: snapshot.controlPlane.taskboard.freshness,
        ageSeconds: snapshot.controlPlane.taskboard.ageSeconds,
        maxAgeSeconds: snapshot.controlPlane.taskboard.maxAgeSeconds,
      },
      authorityOrder: [...snapshot.controlPlane.authorityOrder],
      systemRoles: [...snapshot.controlPlane.systemRoles],
      agentRoles: [...snapshot.controlPlane.agentRoles],
      projectRoutingHash: snapshot.controlPlane.projectRoutingHash,
      wikiRoutingHash: snapshot.controlPlane.wikiRoutingHash,
    },
    tools: {
      git: { ...snapshot.tools.git },
      node: { ...snapshot.tools.node },
    },
    git: { ...snapshot.git },
    verification,
    handoffs: snapshot.handoffs.map((handoff) => ({
      specId: handoff.specId,
      ticketId: handoff.ticketId,
      status: handoff.status,
      owningSpec: handoff.owningSpec,
      proof: handoff.proof,
      publishedBranch: handoff.publishedBranch,
      recoveryRef: handoff.recoveryRef,
      freshness: handoff.freshness,
      sourceUpdated: handoff.sourceUpdated,
      latestEvent: handoff.latestEvent,
      evidenceAt: handoff.evidenceAt,
      ageSeconds: handoff.ageSeconds,
      maxAgeSeconds: handoff.maxAgeSeconds,
      freshnessReason: handoff.freshnessReason,
    })),
  };
}

export function requestPeerSnapshot({
  peer,
  peerRoot,
  seat,
  execute = runReadOnlyCommand,
  now = new Date().toISOString(),
} = {}) {
  const platform = peerPlatform(peerRoot);
  const seatRecord = knownSeat(seat);
  if (!validPeerHost(peer)) throw new Error("invalid peer host");
  if (!platform) throw new Error("peer root must be an absolute approved WORKSPACE root");
  if (!seatRecord || (seatRecord.host === 1 ? "darwin" : "win32") !== platform) {
    throw new Error("peer seat and root platform are inconsistent");
  }
  const script = peerScriptPath(peerRoot);
  const args = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    peer,
    "node", script,
    "snapshot", "--root", peerRoot,
    "--seat", seat,
  ];
  const result = execute("ssh", args, { timeout: 15_000 });
  if (!result?.ok) {
    throw new Error(`peer snapshot unavailable (${result?.classification || "unknown"}): ${result?.stderr || ""}`.trim());
  }
  if (containsCredentialMaterial(result.stdout)) {
    throw new Error("peer snapshot rejected: credential-shaped material");
  }
  let snapshot;
  try {
    snapshot = JSON.parse(result.stdout);
  } catch {
    throw new Error("invalid peer snapshot JSON");
  }
  const validation = validateSnapshot(snapshot, { now });
  if (!validation.valid || snapshot.seat.id !== seat || snapshot.host.root !== peerRoot) {
    throw new Error(`invalid peer snapshot: ${validation.errors.join("; ") || "identity mismatch"}`);
  }
  return sanitizedSnapshot(snapshot);
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index].startsWith("--") || !args[index + 1]) {
      throw new Error(`invalid argument: ${args[index] || ""}`);
    }
    values[args[index].slice(2)] = args[index + 1];
  }
  return values;
}

function readJson(file) {
  return JSON.parse(readFileSync(resolve(file), "utf8"));
}

function main(args) {
  const [command, ...rest] = args;
  const values = parseArgs(rest);
  if (command === "snapshot") {
    process.stdout.write(`${JSON.stringify(collectSnapshot({ root: values.root, seat: values.seat }), null, 2)}\n`);
    return;
  }
  if (command === "compare") {
    const result = compareSnapshots(readJson(values.local), readJson(values.peer));
    process.stdout.write(`${JSON.stringify({ ...result, summary: summarizeComparison(result) }, null, 2)}\n`);
    return;
  }
  if (command === "request-peer") {
    process.stdout.write(`${JSON.stringify(requestPeerSnapshot({
      peer: values.peer,
      peerRoot: values["peer-root"],
      seat: values.seat,
    }), null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: snapshot --root ROOT --seat SERVITOR | compare --local FILE --peer FILE "
    + "| request-peer --peer HOST --peer-root ROOT --seat SERVITOR",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`cross-system-alignment: ${error.message}\n`);
    process.exitCode = 1;
  }
}
