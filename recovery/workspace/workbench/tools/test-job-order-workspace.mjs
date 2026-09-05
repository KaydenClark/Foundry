#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeTrustedCanonArchiveAuthority,
  describeTrustedExactRefGit,
  diagnoseCanonArchiveReadback,
  validateTk013Accounting,
  validateTk013Receipt,
  validateJobOrderEvolution,
  validateJobOrderWorkspace,
} from "./job-order-workspace.mjs";
import { laneRelative } from "./workspace-paths.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// The tools lane moved under `workbench/`; spawn the entrypoint where it is.
const TOOL_REL = `${laneRelative(REPO_ROOT, "tools")}/job-order-workspace.mjs`;
const CANON_ARCHIVE_REMOTE = "https://github.com/example/workspace.git";
const CANON_ARCHIVE_REF = "refs/heads/integration";
const CANON_ARCHIVE_GIT_PATH = "/usr/bin/git";
const CANON_ARCHIVE_GH_PATH = "/opt/homebrew/bin/gh";
const CANON_ARCHIVE_GIT_ARGS = [
  "-c",
  "credential.helper=",
  "-c",
  `credential.https://github.com.helper=!${CANON_ARCHIVE_GH_PATH} auth git-credential`,
  "ls-remote",
  "--refs",
];
const cleanup = [];
let checks = 0;

function test(name, fn) {
  fn();
  checks += 1;
  process.stdout.write(`  ok - ${name}\n`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function write(file, body) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, "utf8");
}

function registry(receipts = []) {
  const entities = {
    ABC123: {
      id: "ABC123", type: "spec", name: "Fixture Spec",
      home: "S-900-fixture/SPEC.md", aliases: ["WORKSPACE/S-900", "S-900"],
      parent: "000J", created: "2026-08-19", lastWorked: "2026-08-19",
    },
    ABC124: {
      id: "ABC124", type: "ticket", name: "Fixture ticket",
      home: "S-900-fixture/SPEC.md", aliases: ["WORKSPACE/S-900/TK-001", "S-900/TK-001"],
      parent: "ABC123", created: "2026-08-19", lastWorked: "2026-08-19",
    },
    ABC125: {
      id: "ABC125", type: "job-order", name: "Fixture validator R1",
      home: "S-900-fixture/job-orders/JO-ABC125-validator/JOB_ORDER.md",
      aliases: ["WORKSPACE/S-900/JO-ABC125", "S-900/JO-ABC125", "JO-ABC125"],
      parent: "ABC123",
    },
  };
  for (const receipt of receipts) {
    entities[receipt.fuid] = {
      id: receipt.fuid,
      type: "passage-receipt",
      name: `Fixture receipt ${receipt.fuid}`,
      home: `S-900-fixture/job-orders/JO-ABC125-validator/handoffs/${receipt.name}`,
      aliases: [`S-900/JO-ABC125/${receipt.fuid}`],
      parent: "ABC125",
    };
  }
  return {
    schemaVersion: "1.0",
    artifact: "foundry-instance-identity-registry",
    allocators: { "4": { width: 4, lastIssued: "000J" }, "6": { width: 6, lastIssued: receipts.at(-1)?.fuid || "ABC125" } },
    entities: {
      "000J": { id: "000J", type: "workshop", name: "WORKSPACE", home: ".", aliases: ["WORKSPACE"] },
      ...entities,
    },
    bindings: {},
    retired: {},
  };
}

function specBody({ archiveDeclaration = "" } = {}) {
  return `# S-900 - Fixture Spec

**Spec ID:** S-900
**FUID:** ABC123
**Status:** active
**Created:** 2026-08-19
**Last worked:** 2026-08-19
**Updated:** 2026-08-19

## Canon Issuance — Job Order ABC125 / R1

Issue \`JO-ABC125-validator\` for S-900/TK-001 / ABC124 exactly as its packet
defines. No Claim, Run, implementation, or ref movement is created.

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
| TK-001 | ABC124 | Validate fixture order. | ready | none | 2026-08-19 | 2026-08-19 | red/green |

## Append-Only Evidence And Execution Log

| Date | Ticket | Event | Verification | Docs | Remaining gap |
|---|---|---|---|---|---|
${archiveDeclaration}
`;
}

function archiveLine(bytes, archivePath = "GROUNDING_PRE_R5.md") {
  const lines = bytes.toString("utf8").replace(/\n$/, "").split("\n").length;
  return `<!-- grounding-archive:v1 path=${archivePath} rows=${lines} bytes=${bytes.length} sha256=${createHash("sha256").update(bytes).digest("hex")} -->`;
}

function archiveLineV2(bytes, archivePath, first, last) {
  const rows = bytes.toString("utf8").trimEnd().split("\n").length;
  return `<!-- grounding-archive:v2 path=${archivePath} rows=${rows} bytes=${bytes.length} sha256=${createHash("sha256").update(bytes).digest("hex")} first=${first} last=${last} -->`;
}

function canonArchiveLine(bytes, archivePath = "CANON_PRE_R7.md", first = "JO-ABC125/R1", last = "JO-ABC125/R1") {
  return `<!-- canon-archive:v1 path=${archivePath} bytes=${bytes.length} sha256=${createHash("sha256").update(bytes).digest("hex")} first=${first} last=${last} -->`;
}

function orderBody({ status = "ready", plane = "Intent" } = {}) {
  return `# Job Order ABC125 — Fixture Validator

**Job Order FUID:** ABC125
**Revision:** R1
**Status:** ${status}
**Plane:** ${plane}
**Owning Spec:** S-900 / ABC123
**Ticket:** S-900/TK-001 / ABC124
**Responsible party:** one Steward-accepted Engineer
**Created:** 2026-08-19

## Canon Issuance

S-900 \`## Canon Issuance — Job Order ABC125 / R1\` is the authority grant.
This folder does not grant authority by existing.

## Intended Result

Validate one fixture workspace without mutation.

## Scope And Repository

- Repository: private WORKSPACE fixture.
- Allowed writes: fixture validation only.
- Destination: private WORKSPACE fixture \`integration\` only; \`main\` is excluded.

## Required Gates And Proof

1. Red/green fixtures and exact recovery.

## Recovery

Checkpoint and explicitly push incomplete work.

## Exclusions And Stop Conditions

- No credentials, deployment, destructive action, public release, or \`main\` mutation.
`;
}

const contextBody = `# Job Order Context — ABC125 / R1

This append-only message board is bounded to important verified facts,
questions, decisions, and warnings for this Job Order. It is not authority, a
second task board, a proof archive, a transcript, or a secret store.

## 2026-08-19 — Issuance

- Verified: fixture created for deterministic validation.
`;

function claimBody(overrides = {}) {
  const fields = {
    Disposition: "unclaimed",
    Claimant: "none",
    "Run FUID": "none",
    "Current stage": "awaiting Preflight",
    "Writer lane": "none",
    "Accepted handoff receipt": "none",
    "Accepted handoff digest": "none",
    "Decision mode": "Steward-serialized; not machine-atomic",
    "Waiting on Kayden": "no",
    ...overrides,
  };
  return `# Steward Claim — Job Order ABC125 / R1\n\n${Object.entries(fields).map(([key, value]) => `**${key}:** ${value}`).join("\n")}\n`;
}

function receiptBody({ sequence, receiptFuid, runFuid = "ABC128", from, next, prior = "none", priorDigest = "none" }) {
  return `# Flight Handoff ${String(sequence).padStart(3, "0")}

**Job Order:** ABC125 / R1
**Spec:** S-900 / ABC123
**Ticket:** S-900/TK-001 / ABC124
**Sequence:** ${String(sequence).padStart(3, "0")}
**Receipt FUID:** ${receiptFuid}
**Run FUID:** ${runFuid}
**Claimant:** Fixture Engineer
**From:** ${from}
**Next:** ${next}
**Outgoing role:** Steward
**Receiving role:** Engineer
**Prior receipt:** ${prior}
**Prior digest:** ${priorDigest}
**Repository:** private fixture
**Worktree:** isolated fixture
**Branch:** fixture/job-order
**Base SHA:** ${"1".repeat(40)}
**Candidate SHA:** ${"2".repeat(40)}
**Target SHA:** ${"1".repeat(40)}
**Allowed scope:** fixture only
**Prohibited scope:** credentials and main
**Checks:** fixture validation
**Gates:** Canon issuance
**Unknowns:** none
**Freshness fingerprint:** opaque-fixture
**Invalidation conditions:** candidate or target movement
**Next action:** invoke next fixture stage
**Resume phrase:** Resume fixture validation.
**Exclusions:** no authority or private payload
`;
}

function fixture({ withReceipts = false, withArchive = false, archiveBody = "| 2026-07-01 | spec | Archived event | verified | docs | none |\n" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "job-order-workspace-"));
  cleanup.push(root);
  const spec = path.join(root, "specs/S-900-fixture");
  const order = path.join(spec, "job-orders/JO-ABC125-validator");
  const archiveBytes = Buffer.from(archiveBody);
  write(path.join(spec, "SPEC.md"), specBody({ archiveDeclaration: withArchive ? archiveLine(archiveBytes) : "" }));
  if (withArchive) writeFileSync(path.join(spec, "GROUNDING_PRE_R5.md"), archiveBytes);
  write(path.join(order, "JOB_ORDER.md"), orderBody());
  write(path.join(order, "CONTEXT.md"), contextBody);
  write(path.join(order, "CLAIM.md"), claimBody());
  write(path.join(order, "handoffs/README.md"), "# Ordered Flight Handoffs\n");

  let receipts = [];
  if (withReceipts) {
    const first = { fuid: "ABC126", name: "001-ABC128-sitrep-to-preflight-ABC126.md" };
    const firstBody = receiptBody({ sequence: 1, receiptFuid: first.fuid, from: "sitrep", next: "preflight" });
    write(path.join(order, "handoffs", first.name), firstBody);
    const second = { fuid: "ABC127", name: "002-ABC128-preflight-to-launch-flight-ABC127.md" };
    const secondBody = receiptBody({
      sequence: 2,
      receiptFuid: second.fuid,
      from: "preflight",
      next: "launch-flight",
      prior: first.name,
      priorDigest: sha256(Buffer.from(firstBody)),
    });
    write(path.join(order, "handoffs", second.name), secondBody);
    write(path.join(order, "CLAIM.md"), claimBody({
      Disposition: "claimed",
      Claimant: "Fixture Engineer",
      "Run FUID": "ABC128",
      "Writer lane": "fixture/job-order",
      "Accepted handoff receipt": second.name,
      "Accepted handoff digest": sha256(Buffer.from(secondBody)),
    }));
    receipts = [first, second];
  }
  write(path.join(root, "fuid-registry.json"), `${JSON.stringify(registry(receipts), null, 2)}\n`);
  return { root, spec, order, receipts, archive: path.join(spec, "GROUNDING_PRE_R5.md") };
}

function historicalCanonArchive({
  orderFuid = "ABC125",
  revision = "R1",
  orderSlug = "JO-ABC125-validator",
  ticketAlias = "S-900/TK-001",
  ticketFuid = "ABC124",
  extraLines = [],
} = {}) {
  return Buffer.from([
    `## Canon Issuance — Job Order ${orderFuid} / ${revision}`,
    "",
    `This Spec issues \`${orderSlug}\` revision \`${revision}\` for ${ticketAlias} (\`${ticketFuid}\`) only.`,
    "Historical archived [canon](missing-canon-archive-ref.md) remains logical only.",
    ...extraLines,
    "",
  ].join("\n"));
}

function historicalCanonFixture({
  archiveBytes = historicalCanonArchive(),
  first = "JO-ABC125/R1",
  last = "JO-ABC125/R1",
  currentOrderFuid = "ABC130",
  currentRevision = "R2",
} = {}) {
  const f = fixture();
  const archivePath = path.join(f.spec, "CANON_PRE_R7.md");
  writeFileSync(archivePath, archiveBytes);
  write(
    path.join(f.spec, "SPEC.md"),
    specBody().replace(
      /## Canon Issuance — Job Order ABC125 \/ R1[\s\S]*?(?=\n## Vertical Implementation Slices\n)/,
      [
        `## Canon Issuance — Job Order ${currentOrderFuid} / ${currentRevision}`,
        "",
        "Current hot Canon remains visible.",
        "",
        canonArchiveLine(archiveBytes, path.basename(archivePath), first, last),
        "",
      ].join("\n"),
    ),
  );
  return { ...f, canonArchive: archivePath };
}

function multiCanonEvolutionFixture(mutateCandidate = () => {}) {
  const f = fixture({ withArchive: true });
  const oldCanonArchive = historicalCanonArchive({ orderFuid: "ABC120" });
  const oldCanonPath = path.join(f.spec, "CANON_PRE_R1.md");
  writeFileSync(oldCanonPath, oldCanonArchive);
  const r1 = historicalCanonArchive();
  const r2 = historicalCanonArchive({ revision: "R2" });
  const historicalSlice = Buffer.concat([r1, r2]);
  const oldDeclaration = canonArchiveLine(oldCanonArchive, path.basename(oldCanonPath), "JO-ABC120/R1", "JO-ABC120/R1");
  write(
    path.join(f.spec, "SPEC.md"),
    specBody({ archiveDeclaration: archiveLine(readFileSync(f.archive)) }).replace(
      /## Canon Issuance — Job Order ABC125 \/ R1[\s\S]*?(?=\n## Vertical Implementation Slices\n)/,
      `${historicalSlice.toString("utf8")}${oldDeclaration}\n`,
    ),
  );
  write(path.join(f.order, "JOB_ORDER.md"), orderBody().replaceAll("R1", "R3"));
  write(path.join(f.order, "CLAIM.md"), claimBody().replaceAll("R1", "R3"));
  const base = initFixtureRepo(f.root, "multi-Canon evolution base");
  const newCanonPath = path.join(f.spec, "CANON_R1_THROUGH_R2.md");
  writeFileSync(newCanonPath, historicalSlice);
  const current = [
    "## Canon Issuance — Job Order ABC125 / R3",
    "",
    "Current hot Canon remains visible before both archive declarations.",
    "",
    canonArchiveLine(historicalSlice, path.basename(newCanonPath), "JO-ABC125/R1", "JO-ABC125/R2"),
    "",
  ].join("\n");
  write(
    path.join(f.spec, "SPEC.md"),
    readFileSync(path.join(f.spec, "SPEC.md"), "utf8").replace(historicalSlice.toString("utf8"), current),
  );
  mutateCandidate({ ...f, newCanonPath, oldCanonPath, oldDeclaration });
  const candidate = commitAll(f.root, "introduce second Canon archive");
  return { ...f, base, candidate, newCanonPath, oldCanonPath, oldDeclaration };
}

function validate(f) {
  return validateJobOrderWorkspace({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125" });
}

function replaceIn(file, from, to) {
  const before = readFileSync(file, "utf8");
  assert.ok(before.includes(from), `fixture source must contain ${from}`);
  write(file, before.replace(from, to));
}

function addDependencyOrder(f, orderFuid, status) {
  const source = f.order;
  const target = path.join(path.dirname(source), `JO-${orderFuid}-dependency`);
  cpSync(source, target, { recursive: true });
  for (const relative of ["JOB_ORDER.md", "CONTEXT.md", "CLAIM.md"]) {
    const file = path.join(target, relative);
    write(file, readFileSync(file, "utf8").replaceAll("ABC125", orderFuid));
  }
  replaceIn(path.join(target, "JOB_ORDER.md"), "**Status:** ready", `**Status:** ${status}`);
  const specFile = path.join(f.spec, "SPEC.md");
  replaceIn(
    specFile,
    "\n## Vertical Implementation Slices\n",
    `\n## Canon Issuance — Job Order ${orderFuid} / R1\n\nIssue \`JO-${orderFuid}-dependency\` for S-900/TK-001 / ABC124 exactly as its packet defines.\n\n## Vertical Implementation Slices\n`,
  );
  const registryFile = path.join(f.root, "fuid-registry.json");
  const value = JSON.parse(readFileSync(registryFile, "utf8"));
  value.entities[orderFuid] = {
    id: orderFuid,
    type: "job-order",
    name: "Fixture dependency",
    home: `S-900-fixture/job-orders/JO-${orderFuid}-dependency/JOB_ORDER.md`,
    aliases: [`WORKSPACE/S-900/JO-${orderFuid}`, `S-900/JO-${orderFuid}`, `JO-${orderFuid}`],
    parent: "ABC123",
  };
  write(registryFile, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

function initFixtureRepo(root, message = "fixture base") {
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

function commitAll(root, message) {
  git(root, "add", ".");
  git(root, "commit", "-qm", message);
  return git(root, "rev-parse", "HEAD");
}

function createBareRemote(root, ref = "refs/heads/integration") {
  const remote = mkdtempSync(path.join(tmpdir(), "job-order-workspace-remote-"));
  cleanup.push(remote);
  git(remote, "init", "--bare", "-q");
  const expectedSha = git(root, "rev-parse", "HEAD");
  git(root, "push", remote, `HEAD:${ref}`);
  return { remote, ref, expectedSha };
}

function seedArchiveRewriteRepo(root, remote) {
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q");
  git(root, "config", `url.file://${remote}/.insteadOf`, CANON_ARCHIVE_REMOTE);
  return realpathSync(root);
}

function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, Object.hasOwn(process.env, key) ? process.env[key] : undefined);
    if (value === null || value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function withFakeGitOnPath({ stdout = "", status = 0 }, fn) {
  const binDir = mkdtempSync(path.join(tmpdir(), "job-order-workspace-git-path-"));
  cleanup.push(binDir);
  const gitPath = path.join(binDir, "git");
  const stdoutPath = path.join(binDir, "ls-remote.stdout");
  const markerPath = path.join(binDir, "git-invoked");
  writeFileSync(stdoutPath, stdout);
  writeFileSync(
    gitPath,
    [
      "#!/bin/sh",
      `printf invoked > ${JSON.stringify(markerPath)}`,
      `cat ${JSON.stringify(stdoutPath)}`,
      `exit ${status}`,
      "",
    ].join("\n"),
  );
  chmodSync(gitPath, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = previousPath ? `${binDir}${path.delimiter}${previousPath}` : binDir;
  try {
    return fn({ binDir, gitPath, markerPath });
  } finally {
    process.env.PATH = previousPath;
  }
}

function withDelegatingGitOnPath(fn) {
  const binDir = mkdtempSync(path.join(tmpdir(), "job-order-workspace-git-delegate-"));
  cleanup.push(binDir);
  const gitPath = path.join(binDir, "git");
  const markerPath = path.join(binDir, "git-invoked");
  writeFileSync(
    gitPath,
    [
      "#!/bin/sh",
      `printf invoked > ${JSON.stringify(markerPath)}`,
      `exec ${CANON_ARCHIVE_GIT_PATH} \"$@\"`,
      "",
    ].join("\n"),
  );
  chmodSync(gitPath, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = previousPath ? `${binDir}${path.delimiter}${previousPath}` : binDir;
  try {
    return fn({ markerPath });
  } finally {
    process.env.PATH = previousPath;
  }
}

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function expectCode(result, code) {
  assert.equal(result.ok, false, `expected ${code} to fail`);
  assert.ok(codes(result).has(code), `expected ${code}; got ${[...codes(result)].join(", ")}`);
}

function treeDigest(root) {
  const entries = [];
  function walk(current) {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.relative(root, absolute);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isSymbolicLink()) entries.push(`${relative}:symlink`);
      else entries.push(`${relative}:${sha256(readFileSync(absolute))}:${stat.mode}`);
    }
  }
  walk(root);
  return sha256(Buffer.from(entries.join("\n")));
}

function validTk013Receipt() {
  return {
    schema: "gpt-os.preflight-receipt.v1",
    ticket: "TK-012",
    observations: [
      {
        provenance: "authoritative-historical-pre-claim",
        checkedAt: "2026-08-28T11:44:27.986Z",
        status: "pass", exitCode: 0, freshnessRecords: 36,
        counts: { blocking: 0, reconcilable: 0, findings: 0, failures: 0, freshnessErrors: 0 },
        artifactBytesIncludingFinalLf: 18941,
        artifactSha256WithoutFinalLf: "f2e89983ae68587a38fc0cfc277b28b61c9407c3120f87e495dad8af60855b68",
        rawArtifactAvailable: false,
        rawArtifactUnavailableReason: "temporary proof root was removed after capture",
      },
      {
        provenance: "corroborating-corrected-candidate-replay",
        status: "pass", exitCode: 0, freshnessRecords: 37,
        counts: { blocking: 0, reconcilable: 0, findings: 0, failures: 0, freshnessErrors: 0 },
        artifactBytesIncludingFinalLf: 19424,
        artifactSha256WithoutFinalLf: "2ef6b49ff12b71cf3ae0dbf89dbf282e819a34fdd6189e03bbf1bd74b2e05f1f",
        rawArtifactAvailable: false,
        rawArtifactUnavailableReason: "temporary proof root was removed after capture",
      },
    ],
    replayEquivalent: false,
    projection: {
      status: "pass",
      digests: [
        "f2e89983ae68587a38fc0cfc277b28b61c9407c3120f87e495dad8af60855b68",
        "2ef6b49ff12b71cf3ae0dbf89dbf282e819a34fdd6189e03bbf1bd74b2e05f1f",
      ],
      freshnessRecords: [36, 37],
      errorCounts: [0, 0],
    },
  };
}

test("rejects malformed or privacy-unsafe TK-013 receipts", () => {
  assert.deepEqual(validateTk013Receipt(validTk013Receipt(), 2048), []);
  for (const [mutate, code] of [
    [(value) => { value.schema = "wrong"; }, "receipt.schema"],
    [(value) => { value.observations.pop(); }, "receipt.provenance"],
    [(value) => { value.observations[0].freshnessRecords = -1; }, "receipt.count"],
    [(value) => { value.observations[0].artifactSha256WithoutFinalLf = "bad"; }, "receipt.digest"],
    [(value) => { value.observations[0].rawArtifactAvailable = true; }, "receipt.raw-availability"],
    [(value) => { value.replayEquivalent = true; }, "receipt.replay-equivalence"],
    [(value) => { value.host = "build-host"; }, "receipt.privacy"],
    [(value) => { value.url = "https://example.invalid/proof"; }, "receipt.privacy"],
    [(value) => { value.path = "/private/tmp/proof"; }, "receipt.privacy"],
    [(value) => { value.refInventory = ["refs/remotes/private/topic"]; }, "receipt.privacy"],
  ]) {
    const value = validTk013Receipt();
    mutate(value);
    assert.ok(validateTk013Receipt(value, 2048).some((error) => error.code === code), code);
  }
  assert.ok(validateTk013Receipt(validTk013Receipt(), 4097).some((error) => error.code === "receipt.file-too-large"));
});

test("rejects every TK-013 projection mutation and cross-checks observations", () => {
  const digestA = "f2e89983ae68587a38fc0cfc277b28b61c9407c3120f87e495dad8af60855b68";
  const digestB = "2ef6b49ff12b71cf3ae0dbf89dbf282e819a34fdd6189e03bbf1bd74b2e05f1f";
  const mutations = [
    ["status single field", (v) => { v.projection.status = "fail"; }, "receipt.projection-status"],
    ["status wrong type", (v) => { v.projection.status = 0; }, "receipt.projection-status"],
    ["first digest single field", (v) => { v.projection.digests[0] = "0".repeat(64); }, "receipt.projection-digest"],
    ["second digest single field", (v) => { v.projection.digests[1] = "0".repeat(64); }, "receipt.projection-digest"],
    ["digests swapped", (v) => { v.projection.digests = [digestB, digestA]; }, "receipt.projection-digest"],
    ["digest wrong type", (v) => { v.projection.digests[0] = 7; }, "receipt.projection-digest"],
    ["digest wrong length", (v) => { v.projection.digests[1] = "a".repeat(63); }, "receipt.projection-digest"],
    ["digest array wrong length", (v) => { v.projection.digests.pop(); }, "receipt.projection-digest"],
    ["first freshness count", (v) => { v.projection.freshnessRecords[0] = 37; }, "receipt.projection-freshness-records"],
    ["second freshness count", (v) => { v.projection.freshnessRecords[1] = 36; }, "receipt.projection-freshness-records"],
    ["freshness counts swapped", (v) => { v.projection.freshnessRecords = [37, 36]; }, "receipt.projection-freshness-records"],
    ["freshness wrong type", (v) => { v.projection.freshnessRecords[0] = "36"; }, "receipt.projection-freshness-records"],
    ["freshness wrong length", (v) => { v.projection.freshnessRecords.push(38); }, "receipt.projection-freshness-records"],
    ["first error count", (v) => { v.projection.errorCounts[0] = 1; }, "receipt.projection-error-count"],
    ["second error count", (v) => { v.projection.errorCounts[1] = 1; }, "receipt.projection-error-count"],
    ["error count wrong type", (v) => { v.projection.errorCounts[0] = "0"; }, "receipt.projection-error-count"],
    ["error count wrong length", (v) => { v.projection.errorCounts = [0]; }, "receipt.projection-error-count"],
    ["missing projection", (v) => { delete v.projection; }, "receipt.projection-schema"],
    ["missing projection field", (v) => { delete v.projection.status; }, "receipt.projection-schema"],
    ["extra projection field", (v) => { v.projection.override = true; }, "receipt.projection-schema"],
    ["joint self-consistent-looking tampering", (v) => {
      v.observations[0].artifactSha256WithoutFinalLf = "0".repeat(64);
      v.observations[0].freshnessRecords = 99;
      v.projection.digests[0] = "0".repeat(64);
      v.projection.freshnessRecords[0] = 99;
    }, "receipt.digest"],
  ];
  for (const [name, mutate, code] of mutations) {
    const value = validTk013Receipt();
    mutate(value);
    const errors = validateTk013Receipt(value, Buffer.byteLength(JSON.stringify(value)));
    assert.ok(errors.some((error) => error.code === code), `${name}: expected ${code}; got ${errors.map((error) => error.code).join(", ")}`);
  }

  const duplicate = JSON.stringify(validTk013Receipt()).replace(
    '"projection":{"status":"pass"',
    '"projection":{"status":"pass","status":"pass"',
  );
  assert.ok(validateTk013Receipt(JSON.parse(duplicate), Buffer.byteLength(duplicate), duplicate)
    .some((error) => error.code === "receipt.projection-duplicate"));
});

test("counts the TK-013 receipt exactly once and enforces exact aggregate components", () => {
  const components = [
    ["SPEC", 23642, 24000], ["JOB_ORDER", 26974, 27000], ["CLAIM", 7786, 7800],
    ["CONTEXT", 12827, 12900], ["GROUNDING_PRE_R5", 19795, 19795],
    ["GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR", 44224, 44224],
  ].map(([name, baselineBytes, actualBytes]) => ({ name, baselineBytes, actualBytes }));
  const valid = validateTk013Accounting({ components, receiptBytes: 2048 });
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.formulaTotal, valid.actualTotal);
  for (const [changed, code] of [
    [components.slice(1), "accounting.component-missing"],
    [[...components, components[0]], "accounting.component-duplicate"],
    [[...components, { name: "EXTRA", baselineBytes: 0, actualBytes: 1 }], "accounting.component-extra"],
    [components.map((item, index) => ({ ...item, actualBytes: index ? item.actualBytes : 65536 })), "accounting.file-too-large"],
  ]) assert.ok(validateTk013Accounting({ components: changed, receiptBytes: 2048 }).errors.some((error) => error.code === code), code);
  assert.ok(validateTk013Accounting({ components, receiptBytes: 600000 }).errors.some((error) => error.code === "accounting.workspace-too-large"));
  assert.ok(validateTk013Accounting({ components, receiptBytes: 2048, receiptCount: 2 }).errors.some((error) => error.code === "accounting.receipt-count"));
});

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }).trim();
}

test("accepts the issued fixture and all live S-037 Job Orders without mutation", () => {
  const f = fixture();
  const before = treeDigest(f.root);
  const validation = validate(f);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  assert.equal(treeDigest(f.root), before);
  if (process.env.JOB_ORDER_FIXTURES_ONLY !== "1") {
    assert.equal(validateJobOrderWorkspace({ root: REPO_ROOT, specId: "S-037", jobOrder: "JO-00007S" }).ok, true);
  }
});

test("emits one strict normalized v2 model for the exact selected launch order", () => {
  const f = fixture();
  const before = treeDigest(f.root);
  const value = validate(f);
  assert.equal(value.ok, true, JSON.stringify(value.errors));
  assert.deepEqual(value.launchModel, {
    schema: "gpt-os.job-order-launch.v2",
    jobOrder: { alias: "JO-ABC125", fuid: "ABC125", revision: "R1" },
    spec: { id: "S-900", fuid: "ABC123" },
    ticket: { alias: "S-900/TK-001", fuid: "ABC124" },
    lifecycle: { status: "ready", dependencies: [], launchEligible: true },
    repository: "private WORKSPACE fixture",
    allowedScope: ["fixture validation only"],
    proofGates: ["Red/green fixtures and exact recovery."],
    destination: { repository: "private WORKSPACE fixture", branch: "integration" },
    exclusions: ["No credentials, deployment, destructive action, public release, or `main` mutation."],
  });
  assert.equal(treeDigest(f.root), before);
});

test("rejects exact-order launch identity, lifecycle, scope, proof, destination, and prose inference without mutation", () => {
  const cases = [
    ["stale revision", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "**Revision:** R1", "**Revision:** R2"), "issuance.revision-mismatch"],
    ["invalid lifecycle", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** issued"), "lifecycle.status"],
    ["repository", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "- Repository: private WORKSPACE fixture.\n", ""), "repository.missing"],
    ["scope", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "- Allowed writes: fixture validation only.\n", "Allowed writes are mentioned only in prose.\n"), "scope.missing"],
    ["proof", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "Red/green fixtures and exact recovery.\n", "\n"), "proof.missing"],
    ["destination repository", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "- Destination: private WORKSPACE fixture", "- Destination: private shared skills"), "destination.repository-mismatch"],
    ["destination branch", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "`integration` only", "`main` only"), "destination.prohibited"],
    ["exclusion", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "or `main` mutation", "or unrelated mutation"), "exclusion.main-required"],
    ["privacy", (f) => replaceIn(path.join(f.order, "JOB_ORDER.md"), "fixture validation only", "api_token: secret-value"), "content.credential"],
  ];
  for (const [name, mutate, code] of cases) {
    const f = fixture();
    mutate(f);
    const before = treeDigest(f.root);
    const result = validate(f);
    expectCode(result, code);
    assert.equal(result.launchModel, null, `${name} failure exposed a launch model`);
    assert.equal(treeDigest(f.root), before, `${name} failure mutated its input tree`);
  }
});

test("rejects missing, held, and cyclic exact dependencies deterministically", () => {
  const missing = fixture();
  replaceIn(path.join(missing.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** blocked — depends on JO-ABC130 accepted and landed");
  const missingBefore = treeDigest(missing.root);
  expectCode(validate(missing), "dependency.missing");
  assert.equal(treeDigest(missing.root), missingBefore);

  const held = fixture();
  addDependencyOrder(held, "ABC130", "ready");
  replaceIn(path.join(held.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** blocked — depends on JO-ABC130 accepted and landed");
  const heldBefore = treeDigest(held.root);
  expectCode(validate(held), "dependency.held");
  assert.equal(treeDigest(held.root), heldBefore);

  const staleBlocked = fixture();
  addDependencyOrder(staleBlocked, "ABC130", "accepted — independently audited and landed");
  replaceIn(path.join(staleBlocked.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** blocked — depends on JO-ABC130 accepted and landed");
  const staleBefore = treeDigest(staleBlocked.root);
  const staleResult = validate(staleBlocked);
  expectCode(staleResult, "lifecycle.blocked");
  assert.equal(codes(staleResult).has("dependency.held"), false);
  assert.equal(treeDigest(staleBlocked.root), staleBefore);

  const cyclic = fixture();
  const dependency = addDependencyOrder(cyclic, "ABC130", "blocked — depends on JO-ABC125 accepted and landed");
  replaceIn(path.join(cyclic.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** blocked — depends on JO-ABC130 accepted and landed");
  const cyclicBefore = treeDigest(cyclic.root);
  expectCode(validate(cyclic), "dependency.cycle");
  assert.equal(treeDigest(cyclic.root), cyclicBefore);
  assert.ok(existsSync(dependency));
});

test("preserves terminal v1 packet history without retrofitting a launch model", () => {
  const f = fixture();
  replaceIn(path.join(f.order, "JOB_ORDER.md"), "**Status:** ready", "**Status:** closed-complete");
  replaceIn(path.join(f.order, "JOB_ORDER.md"), "**Plane:** Intent", "**Plane:** Enduring Context");
  const before = treeDigest(f.root);
  const value = validate(f);
  assert.equal(value.ok, true, JSON.stringify(value.errors));
  assert.equal(value.modelVersion, "gpt-os.job-order-workspace.v1-terminal-history");
  assert.equal(value.launchModel, null);
  assert.equal(treeDigest(f.root), before);
});

test("accepts archived Canon only through the canonical GitHub integration ref", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon fixture");
  const expectedSha = git(historical.root, "rev-parse", "HEAD");
  assert.equal(
    diagnoseCanonArchiveReadback({
      expectedSha,
      ref: CANON_ARCHIVE_REF,
      stdout: `${expectedSha}\t${CANON_ARCHIVE_REF}\n`,
    }).ok,
    true,
    "a trusted external SHA plus a fresh exact canonical read-back tuple may authorize archived Canon",
  );

  expectCode(
    validateJobOrderWorkspace({ root: historical.root, specId: "S-900", jobOrder: "JO-ABC125" }),
    "archive.pin-required",
  );
  expectCode(
    validateJobOrderWorkspace({
      root: historical.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
      canonArchiveExpectedSha: "refs/remotes/origin/integration",
      canonArchiveRemote: CANON_ARCHIVE_REMOTE,
      canonArchiveRef: CANON_ARCHIVE_REF,
    }),
    "archive.pin-sha-invalid",
  );
  const localBare = createBareRemote(historical.root);
  for (const remote of [
    "origin",
    localBare.remote,
    path.relative(historical.root, localBare.remote),
    `file://${localBare.remote}`,
    "ssh://github.com/example/workspace.git",
    "https://www.github.com/example/workspace.git",
    "https://github.com/example/workspace",
    "https://github.com/example/workspace.git/",
    "https://github.com/example/workspace.git/archive",
    "https://github.com/SomeoneElse/WORKSPACE.git",
    "https://github.com/example/foundry.git",
    "https://example.com/example/workspace.git",
    "https://fixture:secret@github.com/example/workspace.git",
    "https://github.com/example/workspace.git?ref=integration",
    "https://github.com/example/workspace.git#integration",
    "git@github.com:example/workspace.git",
  ]) {
    expectCode(
      validateJobOrderWorkspace({
        root: historical.root,
        specId: "S-900",
        jobOrder: "JO-ABC125",
        canonArchiveExpectedSha: expectedSha,
        canonArchiveRemote: remote,
        canonArchiveRef: CANON_ARCHIVE_REF,
      }),
      "archive.pin-remote-invalid",
    );
  }
  for (const ref of [
    "refs/remotes/origin/integration",
    "refs/heads/main",
    "refs/heads/codex/s037-r8-storage-schema-2026-08-29",
    `${CANON_ARCHIVE_REF}/moved`,
  ]) {
    expectCode(
      validateJobOrderWorkspace({
        root: historical.root,
        specId: "S-900",
        jobOrder: "JO-ABC125",
        canonArchiveExpectedSha: expectedSha,
        canonArchiveRemote: CANON_ARCHIVE_REMOTE,
        canonArchiveRef: ref,
      }),
      "archive.pin-ref-invalid",
    );
  }

  for (const stdout of [
    "",
    `${expectedSha}\t${CANON_ARCHIVE_REF}\n${expectedSha}\t${CANON_ARCHIVE_REF}\n`,
    `${expectedSha}\t${CANON_ARCHIVE_REF}\textra\n`,
    `${expectedSha}\trefs/heads/main\n`,
  ]) {
    expectCode(
      diagnoseCanonArchiveReadback({
        expectedSha,
        ref: CANON_ARCHIVE_REF,
        stdout,
      }),
      "archive.pin-readback",
    );
  }

  const moved = historicalCanonFixture();
  initFixtureRepo(moved.root, "historical Canon moved remote base");
  const staleExpectedSha = git(moved.root, "rev-parse", "HEAD");
  write(path.join(moved.spec, "SPEC.md"), `${readFileSync(path.join(moved.spec, "SPEC.md"), "utf8")}\n<!-- hot drift -->\n`);
  const movedSha = commitAll(moved.root, "move remote integration");
  expectCode(
    diagnoseCanonArchiveReadback({
      expectedSha: staleExpectedSha,
      ref: CANON_ARCHIVE_REF,
      stdout: `${movedSha}\t${CANON_ARCHIVE_REF}\n`,
    }),
    "archive.pin-mismatch",
  );

  const protectedSection = historicalCanonFixture({
    archiveBytes: historicalCanonArchive({
      extraLines: ["## Acceptance Criteria", "", "- [ ] Hidden protected section."],
    }),
  });
  initFixtureRepo(protectedSection.root, "historical Canon protected section");
  expectCode(
    validateJobOrderWorkspace({
      root: protectedSection.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
    }),
    "archive.protected-section",
  );

  const currentIssuance = historicalCanonFixture({
    archiveBytes: historicalCanonArchive({
      orderFuid: "ABC130",
      revision: "R2",
      orderSlug: "JO-ABC130-current",
    }),
    first: "JO-ABC130/R2",
    last: "JO-ABC130/R2",
  });
  initFixtureRepo(currentIssuance.root, "historical Canon current issuance capture");
  expectCode(
    validateJobOrderWorkspace({
      root: currentIssuance.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
    }),
    "archive.protected-section",
  );
});

test("exported workspace validation ignores caller-supplied archive authority overrides", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon exported override fixture");
  const expectedSha = git(historical.root, "rev-parse", "HEAD");
  const forged = validateJobOrderWorkspace({
    root: historical.root,
    specId: "S-900",
    jobOrder: "JO-ABC125",
    canonArchiveExpectedSha: expectedSha,
    canonArchiveRemote: CANON_ARCHIVE_REMOTE,
    canonArchiveRef: CANON_ARCHIVE_REF,
  }, {
    canonArchiveAuthority: {
      gitPath: CANON_ARCHIVE_GIT_PATH,
      spawnSync: () => ({ status: 0, stdout: `${expectedSha}\t${CANON_ARCHIVE_REF}\n`, stderr: "" }),
    },
  });
  assert.equal(forged.ok, false, "exported workspace validation must ignore caller-supplied archive authority overrides");
  const actualCodes = codes(forged);
  assert.ok(
    actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
    `expected trusted live read-back failure or mismatch; got ${[...actualCodes].join(", ")}`,
  );
});

test("isolates archived Canon read-back from ambient git config, repo discovery, and transport overrides", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon env isolation fixture");
  const localBare = createBareRemote(historical.root);
  const rewriteKey = `url.file://${localBare.remote}.insteadOf`;
  const rewriteValue = CANON_ARCHIVE_REMOTE;
  const fakeHome = mkdtempSync(path.join(tmpdir(), "job-order-workspace-home-"));
  const fakeXdg = mkdtempSync(path.join(tmpdir(), "job-order-workspace-xdg-"));
  const fakeSystem = path.join(mkdtempSync(path.join(tmpdir(), "job-order-workspace-system-")), "gitconfig");
  const fakeGlobal = path.join(mkdtempSync(path.join(tmpdir(), "job-order-workspace-global-")), "gitconfig");
  cleanup.push(fakeHome, fakeXdg, path.dirname(fakeSystem), path.dirname(fakeGlobal));
  writeFileSync(fakeSystem, `[url "file://${localBare.remote}"]\n\tinsteadOf = ${CANON_ARCHIVE_REMOTE}\n`);
  writeFileSync(fakeGlobal, `[http]\n\tproxy = http://127.0.0.1:9\n`);
  const result = withEnv({
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: rewriteKey,
    GIT_CONFIG_VALUE_0: rewriteValue,
    GIT_CONFIG_PARAMETERS: `'url.file://${localBare.remote}.insteadOf=${CANON_ARCHIVE_REMOTE}'`,
    GIT_CONFIG_SYSTEM: fakeSystem,
    GIT_CONFIG_GLOBAL: fakeGlobal,
    HOME: fakeHome,
    XDG_CONFIG_HOME: fakeXdg,
    GIT_DIR: path.join(historical.root, ".git"),
    GIT_WORK_TREE: historical.root,
    GIT_COMMON_DIR: path.join(historical.root, ".git"),
    GIT_NAMESPACE: "fixture",
    GIT_SSH: "/tmp/fake-ssh",
    GIT_SSH_COMMAND: "ssh -F /tmp/fake-ssh-config",
    GIT_PROXY_COMMAND: "/tmp/fake-proxy",
    GIT_ASKPASS: "/tmp/fake-askpass",
    SSH_ASKPASS: "/tmp/fake-ssh-askpass",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "socks5://127.0.0.1:9",
    NO_PROXY: "github.com",
  }, () => ({
    validation: validateJobOrderWorkspace({
      root: historical.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
      canonArchiveExpectedSha: localBare.expectedSha,
      canonArchiveRemote: CANON_ARCHIVE_REMOTE,
      canonArchiveRef: CANON_ARCHIVE_REF,
    }),
    plan: describeTrustedCanonArchiveAuthority(),
  }));

  assert.equal(result.validation.ok, false, "poisoned ambient git env must not authorize archived Canon");
  const actualCodes = codes(result.validation);
  assert.ok(
    actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
    `expected trusted live read-back failure or mismatch; got ${[...actualCodes].join(", ")}`,
  );
  assert.deepEqual(
    result.plan.args,
    [...CANON_ARCHIVE_GIT_ARGS, CANON_ARCHIVE_REMOTE, CANON_ARCHIVE_REF],
    "read-back must preserve the safe credential-helper prefix plus the exact canonical argument tuple",
  );
  assert.equal(result.plan.gitPath, realpathSync(CANON_ARCHIVE_GIT_PATH), "read-back must bind the trusted absolute git executable");
  assert.notEqual(result.plan.cwd, historical.root, "read-back must not run from the repository root");
  assert.ok(
    !result.plan.cwd.startsWith(`${historical.root}${path.sep}`),
    "read-back must run from a neutral non-repository cwd",
  );
  assert.ok(path.isAbsolute(result.plan.env.GH_CONFIG_DIR), "gh config dir must be explicit and absolute");
  assert.equal(result.plan.env.GH_PROMPT_DISABLED, "1", "gh prompting must be disabled");
  assert.equal(result.plan.env.GIT_CONFIG_COUNT, "0", "ambient env config entries must be zeroed");
  assert.equal(result.plan.env.GIT_CONFIG_NOSYSTEM, "1", "system git config must be disabled");
  assert.equal(result.plan.env.GIT_CONFIG_SYSTEM, devNull, "system git config path must be neutralized");
  assert.equal(result.plan.env.GIT_CONFIG_GLOBAL, devNull, "global git config path must be neutralized");
  assert.equal(result.plan.env.GIT_TERMINAL_PROMPT, "0", "interactive git prompting must be disabled");
  assert.equal(result.plan.env.GIT_DISCOVERY_ACROSS_FILESYSTEM, "0", "git repo discovery must stay bounded");
  assert.equal(result.plan.env.GIT_CEILING_DIRECTORIES, result.plan.cwd, "repo discovery ceiling must bind to the neutral cwd");
  for (const key of [
    "HOME",
    "XDG_CONFIG_HOME",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_PARAMETERS",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "GIT_PROXY_COMMAND",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
  ]) {
    assert.equal(Object.hasOwn(result.plan.env, key), false, `${key} must not reach git ls-remote`);
  }
});

test("archived Canon validation ignores caller-controlled TMPDIR repos at the old derived authority cwd", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon TMPDIR poison fixture");
  const forgedRemote = createBareRemote(historical.root);
  const poisonRoot = mkdtempSync(path.join(tmpdir(), "job-order-workspace-tmpdir-poison-"));
  cleanup.push(poisonRoot);
  const poisonedCwd = seedArchiveRewriteRepo(path.join(poisonRoot, "gpt-os-canon-archive-authority"), forgedRemote.remote);

  const result = withEnv({
    TMPDIR: poisonRoot,
    TMP: poisonRoot,
    TEMP: poisonRoot,
  }, () => ({
    validation: validateJobOrderWorkspace({
      root: historical.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
      canonArchiveExpectedSha: forgedRemote.expectedSha,
      canonArchiveRemote: CANON_ARCHIVE_REMOTE,
      canonArchiveRef: CANON_ARCHIVE_REF,
    }),
    plan: describeTrustedCanonArchiveAuthority(),
  }));

  assert.equal(result.validation.ok, false, "a poisoned caller TMPDIR repo must not authorize archived Canon");
  const actualCodes = codes(result.validation);
  assert.ok(
    actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
    `expected trusted live read-back failure or mismatch; got ${[...actualCodes].join(", ")}`,
  );
  assert.notEqual(result.plan.cwd, poisonedCwd, "the trusted authority cwd must not be derived from caller TMPDIR");
  assert.match(result.plan.cwd, /^\/private\/tmp\/gpt-os-canon-archive-authority-/);
  assert.equal(result.plan.env.TMPDIR, result.plan.cwd, "trusted TMPDIR must be rebound to the fresh neutral cwd");
  assert.equal(result.plan.env.TMP, result.plan.cwd, "trusted TMP must be rebound to the fresh neutral cwd");
  assert.equal(result.plan.env.TEMP, result.plan.cwd, "trusted TEMP must be rebound to the fresh neutral cwd");
  assert.equal(existsSync(result.plan.cwd), false, "the fresh trusted authority cwd must be cleaned after description");
});

test("archived Canon validation ignores caller-controlled TMPDIR parent repos", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon TMPDIR parent poison fixture");
  const forgedRemote = createBareRemote(historical.root);
  const poisonRepo = mkdtempSync(path.join(tmpdir(), "job-order-workspace-tmpdir-parent-"));
  cleanup.push(poisonRepo);
  seedArchiveRewriteRepo(poisonRepo, forgedRemote.remote);
  const poisonTmpdir = path.join(poisonRepo, "nested");
  mkdirSync(poisonTmpdir, { recursive: true });

  const result = withEnv({
    TMPDIR: poisonTmpdir,
    TMP: poisonTmpdir,
    TEMP: poisonTmpdir,
  }, () =>
    validateJobOrderWorkspace({
      root: historical.root,
      specId: "S-900",
      jobOrder: "JO-ABC125",
      canonArchiveExpectedSha: forgedRemote.expectedSha,
      canonArchiveRemote: CANON_ARCHIVE_REMOTE,
      canonArchiveRef: CANON_ARCHIVE_REF,
    }));

  assert.equal(result.ok, false, "a caller TMPDIR nested under a repo must not authorize archived Canon");
  const actualCodes = codes(result);
  assert.ok(
    actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
    `expected trusted live read-back failure or mismatch; got ${[...actualCodes].join(", ")}`,
  );
});

test("production CLI ignores caller-controlled TMPDIR repos at the old derived authority cwd", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon TMPDIR poison CLI fixture");
  const forgedRemote = createBareRemote(historical.root);
  const poisonRoot = mkdtempSync(path.join(tmpdir(), "job-order-workspace-tmpdir-cli-poison-"));
  cleanup.push(poisonRoot);
  seedArchiveRewriteRepo(path.join(poisonRoot, "gpt-os-canon-archive-authority"), forgedRemote.remote);
  const cliArgs = [
    path.join(REPO_ROOT, TOOL_REL),
    "validate",
    "--root", historical.root,
    "--spec", "S-900",
    "--job-order", "JO-ABC125",
    "--canon-archive-expected-sha", forgedRemote.expectedSha,
    "--canon-archive-remote", CANON_ARCHIVE_REMOTE,
    "--canon-archive-ref", CANON_ARCHIVE_REF,
    "--json",
  ];
  const outcome = withEnv({
    TMPDIR: poisonRoot,
    TMP: poisonRoot,
    TEMP: poisonRoot,
  }, () => spawnSync(process.execPath, cliArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: process.env,
    shell: false,
  }));

  assert.equal(outcome.status, 1, outcome.stderr || outcome.stdout);
  const validation = JSON.parse(outcome.stdout);
  assert.equal(validation.ok, false, "production CLI must not accept archived Canon through a poisoned TMPDIR repo");
  const actualCodes = new Set(validation.errors.map((error) => error.code));
  assert.ok(
    actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
    `expected trusted live read-back failure or mismatch; got ${validation.errors.map((error) => error.code).join(", ")}`,
  );
});

test("production CLI ignores fake git on PATH and does not accept executable override flags", () => {
  const historical = historicalCanonFixture();
  initFixtureRepo(historical.root, "historical Canon CLI path fixture");
  const expectedSha = git(historical.root, "rev-parse", "HEAD");
  withFakeGitOnPath({ stdout: `${expectedSha}\t${CANON_ARCHIVE_REF}\n` }, ({ markerPath }) => {
    const cliArgs = [
      path.join(REPO_ROOT, TOOL_REL),
      "validate",
      "--root", historical.root,
      "--spec", "S-900",
      "--job-order", "JO-ABC125",
      "--canon-archive-expected-sha", expectedSha,
      "--canon-archive-remote", CANON_ARCHIVE_REMOTE,
      "--canon-archive-ref", CANON_ARCHIVE_REF,
      "--json",
    ];
    const outcome = spawnSync(process.execPath, cliArgs, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
      shell: false,
    });
    assert.equal(existsSync(markerPath), false, "production CLI must not execute git resolved from ambient PATH");
    assert.equal(outcome.status, 1, outcome.stderr);
    const validation = JSON.parse(outcome.stdout);
    assert.equal(validation.ok, false, "production CLI must not accept archived Canon through a fake PATH git");
    const actualCodes = new Set(validation.errors.map((error) => error.code));
    assert.ok(
      actualCodes.has("archive.pin-readback") || actualCodes.has("archive.pin-mismatch"),
      `expected live read-back failure or mismatch; got ${validation.errors.map((error) => error.code).join(", ")}`,
    );

    const overrideAttempt = spawnSync(process.execPath, [...cliArgs.slice(0, -1), "--canon-archive-git", "/tmp/fake", "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
      shell: false,
    });
    assert.equal(existsSync(markerPath), false, "rejected CLI executable-override flags must not execute a fake PATH git");
    assert.equal(overrideAttempt.status, 2, overrideAttempt.stdout);
    assert.match(overrideAttempt.stderr, /invalid argument --canon-archive-git/);
  });
});

test("rejects missing, unexpected, and symlinked workspace entries", () => {
  const missing = fixture();
  rmSync(path.join(missing.order, "CONTEXT.md"));
  expectCode(validate(missing), "structure.missing");
  const unexpected = fixture();
  write(path.join(unexpected.order, "TASKBOARD.md"), "# second tracker\n");
  expectCode(validate(unexpected), "structure.unexpected-entry");
  const linked = fixture();
  rmSync(path.join(linked.order, "CONTEXT.md"));
  symlinkSync(path.join(linked.root, "fuid-registry.json"), path.join(linked.order, "CONTEXT.md"));
  expectCode(validate(linked), "path.symlink");
  const outside = fixture();
  const ancestorRoot = mkdtempSync(path.join(tmpdir(), "job-order-workspace-ancestor-"));
  cleanup.push(ancestorRoot);
  cpSync(path.join(outside.root, "fuid-registry.json"), path.join(ancestorRoot, "fuid-registry.json"));
  symlinkSync(path.join(outside.root, "specs"), path.join(ancestorRoot, "specs"));
  expectCode(validateJobOrderWorkspace({ root: ancestorRoot, specId: "S-900", jobOrder: "JO-ABC125" }), "path.symlink");
});

test("reconstructs one declared archive and fails closed on archive tampering and unsafe storage", () => {
  const valid = fixture({ withArchive: true });
  const before = treeDigest(valid.root);
  assert.equal(validate(valid).ok, true);
  assert.equal(treeDigest(valid.root), before, "archive validation must not mutate the workspace");

  const modified = fixture({ withArchive: true });
  write(modified.archive, "| 2026-07-01 | spec | Replaced event | verified | docs | none |\n");
  expectCode(validate(modified), "archive.hash-mismatch");

  const missing = fixture({ withArchive: true });
  rmSync(missing.archive);
  expectCode(validate(missing), "archive.missing");

  const reorderedBody = "| 2026-07-01 | spec | First | verified | docs | none |\n| 2026-07-02 | spec | Second | verified | docs | none |\n";
  const reordered = fixture({ withArchive: true, archiveBody: reorderedBody });
  write(reordered.archive, reorderedBody.split("\n").filter(Boolean).reverse().join("\n") + "\n");
  expectCode(validate(reordered), "archive.hash-mismatch");

  const multiple = fixture({ withArchive: true });
  write(path.join(multiple.spec, "SPEC.md"), `${readFileSync(path.join(multiple.spec, "SPEC.md"), "utf8")}\n${archiveLine(readFileSync(multiple.archive))}\n`);
  expectCode(validate(multiple), "archive.declaration-multiple");

  const escaped = fixture({ withArchive: true });
  write(path.join(escaped.spec, "SPEC.md"), readFileSync(path.join(escaped.spec, "SPEC.md"), "utf8").replace("path=GROUNDING_PRE_R5.md", "path=../GROUNDING_PRE_R5.md"));
  expectCode(validate(escaped), "archive.declaration-invalid");

  const linked = fixture({ withArchive: true });
  rmSync(linked.archive);
  symlinkSync(path.join(linked.root, "fuid-registry.json"), linked.archive);
  expectCode(validate(linked), "archive.symlink");

  const utf8 = fixture({ withArchive: true });
  writeFileSync(utf8.archive, Buffer.from([0xff, 0xfe]));
  expectCode(validate(utf8), "archive.invalid-utf8");

  const bomBody = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("| 2026-07-01 | spec | Private archived tuple | verified | docs | none |\n"),
  ]);
  const bom = fixture({ withArchive: true, archiveBody: bomBody });
  const bomResult = validate(bom);
  expectCode(bomResult, "archive.invalid-utf8");
  assert.doesNotMatch(JSON.stringify(bomResult), /Private archived tuple/, "invalid UTF-8 diagnostics must not echo archive content");

  const sensitiveBody = Buffer.from('api_key = "' + 'sk-' + 'example-sensitive-value-1234567890' + '"\n');
  const sensitive = fixture({ withArchive: true, archiveBody: sensitiveBody });
  expectCode(validate(sensitive), "content.credential");

  const oversizedBody = Buffer.alloc((64 * 1024) + 1, 0x61);
  const oversized = fixture({ withArchive: true, archiveBody: oversizedBody });
  expectCode(validate(oversized), "archive.file-too-large");

  const aggregateArchiveBody = "| 2026-07-01 | spec | Archived | verified | docs | none |\n".repeat(800);
  const aggregate = fixture({ withArchive: true, archiveBody: aggregateArchiveBody });
  for (let index = 0; index < 8; index += 1) write(path.join(aggregate.order, "handoffs", `extra-${index}.md`), "x".repeat(60_000));
  expectCode(validate(aggregate), "content.workspace-too-large");
});

test("reconstructs an ordered archive chain and rejects missing, extra, duplicate, and reordered archives", () => {
  const f = fixture({ withArchive: true });
  const secondPath = path.join(f.spec, "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md");
  const second = Buffer.from("| 2026-07-02 | TK-002 | Second archived event | verified | docs | none |\n");
  writeFileSync(secondPath, second);
  const specPath = path.join(f.spec, "SPEC.md");
  write(specPath, readFileSync(specPath, "utf8").replace(
    /<!-- grounding-archive:v1[^\n]+-->/,
    (line) => `${line}\n${archiveLineV2(second, path.basename(secondPath), "2026-07-02/TK-002", "2026-07-02/TK-002")}`,
  ));
  assert.equal(validate(f).ok, true, "a declaration-ordered two-archive chain must validate");

  const sameDayFirst = Buffer.from("| 2026-07-01 | TK-003 Preflight | Same-day first archived event | verified | docs | none |\n");
  const sameDay = fixture({ withArchive: true, archiveBody: sameDayFirst });
  const sameDaySecondPath = path.join(sameDay.spec, "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md");
  const sameDaySecond = Buffer.from("| 2026-07-01 | TK-003 Implementation | Same-day second archived event | verified | docs | none |\n");
  writeFileSync(sameDaySecondPath, sameDaySecond);
  const sameDaySpecPath = path.join(sameDay.spec, "SPEC.md");
  write(sameDaySpecPath, readFileSync(sameDaySpecPath, "utf8").replace(
    /<!-- grounding-archive:v1[^\n]+-->/,
    `${archiveLineV2(sameDayFirst, path.basename(sameDay.archive), "2026-07-01/TK-003-Preflight", "2026-07-01/TK-003-Preflight")}\n${archiveLineV2(sameDaySecond, path.basename(sameDaySecondPath), "2026-07-01/TK-003-Implementation", "2026-07-01/TK-003-Implementation")}`,
  ));
  assert.equal(validate(sameDay).ok, true, "same-day archives remain structurally valid in declaration order");

  const swapped = fixture({ withArchive: true });
  const swappedSecondPath = path.join(swapped.spec, "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md");
  writeFileSync(swappedSecondPath, second);
  const swappedSpecPath = path.join(swapped.spec, "SPEC.md");
  write(swappedSpecPath, readFileSync(swappedSpecPath, "utf8").replace(
    /<!-- grounding-archive:v1[^\n]+-->/,
    (line) => `${archiveLineV2(second, path.basename(swappedSecondPath), "2026-07-02/TK-002", "2026-07-02/TK-002")}\n${line}`,
  ));
  expectCode(validate(swapped), "archive.chain-reordered");

  const boundaryGap = fixture({ withArchive: true });
  const gapSecondPath = path.join(boundaryGap.spec, "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md");
  writeFileSync(gapSecondPath, second);
  write(path.join(boundaryGap.spec, "SPEC.md"), readFileSync(path.join(boundaryGap.spec, "SPEC.md"), "utf8").replace(
    /<!-- grounding-archive:v1[^\n]+-->/,
    (line) => `${line}\n${archiveLineV2(second, path.basename(gapSecondPath), "2026-07-03/TK-002", "2026-07-03/TK-002")}`,
  ));
  expectCode(validate(boundaryGap), "archive.boundary-mismatch");

  const boundaryOverlap = fixture({ withArchive: true });
  const overlapSecondPath = path.join(boundaryOverlap.spec, "GROUNDING_R5_THROUGH_TK012_LAUNCH_REPAIR.md");
  writeFileSync(overlapSecondPath, second);
  write(path.join(boundaryOverlap.spec, "SPEC.md"), readFileSync(path.join(boundaryOverlap.spec, "SPEC.md"), "utf8").replace(
    /<!-- grounding-archive:v1[^\n]+-->/,
    (line) => `${line}\n${archiveLineV2(second, path.basename(overlapSecondPath), "2026-07-02/TK-002", "2026-07-01/TK-001")}`,
  ));
  expectCode(validate(boundaryOverlap), "archive.boundary-mismatch");

  const missing = fixture({ withArchive: true });
  write(path.join(missing.spec, "SPEC.md"), `${readFileSync(path.join(missing.spec, "SPEC.md"), "utf8")}\n${archiveLineV2(second, path.basename(secondPath), "2026-07-02/TK-002", "2026-07-02/TK-002")}\n`);
  expectCode(validate(missing), "archive.missing");

  const extra = fixture({ withArchive: true });
  writeFileSync(path.join(extra.spec, "GROUNDING_EXTRA.md"), second);
  expectCode(validate(extra), "archive.undeclared");

  const duplicate = fixture({ withArchive: true });
  write(path.join(duplicate.spec, "SPEC.md"), readFileSync(path.join(duplicate.spec, "SPEC.md"), "utf8").replace(/<!-- grounding-archive:v1[^\n]+-->/, (line) => `${line}\n${line}`));
  expectCode(validate(duplicate), "archive.declaration-multiple");
});

test("binds directory, Spec, ticket, registry parent/home, and Canon issuance", () => {
  const identity = fixture();
  write(path.join(identity.order, "JOB_ORDER.md"), orderBody().replace("ABC125\n", "ABC129\n"));
  expectCode(validate(identity), "identity.order-directory-mismatch");
  const parent = fixture();
  const value = JSON.parse(readFileSync(path.join(parent.root, "fuid-registry.json")));
  value.entities.ABC125.parent = "ABC124";
  write(path.join(parent.root, "fuid-registry.json"), `${JSON.stringify(value, null, 2)}\n`);
  expectCode(validate(parent), "registry.parent-mismatch");
  const home = fixture();
  const homeRegistry = JSON.parse(readFileSync(path.join(home.root, "fuid-registry.json")));
  homeRegistry.entities.ABC125.home = "wrong/JOB_ORDER.md";
  write(path.join(home.root, "fuid-registry.json"), `${JSON.stringify(homeRegistry, null, 2)}\n`);
  expectCode(validate(home), "registry.home-mismatch");
  const issuance = fixture();
  write(path.join(issuance.spec, "SPEC.md"), specBody().replace("## Canon Issuance", "## Retired Issuance"));
  expectCode(validate(issuance), "issuance.missing");
});

test("rejects Context authority, tracking, proof archive, transcript, diff, and shaped secrets", () => {
  for (const [body, code] of [
    ["\n## 2026-08-19 — Bad\n\nThis Context authorizes execution.\n", "context.authority"],
    ["\n## Authority\n\nNone claimed.\n", "context.authority"],
    ["\n## 2026-08-19 — Bad\n\n- [ ] hidden task\n", "context.second-tracker"],
    ["\n## Proof Archive\n\ncommand output\n", "context.proof-archive"],
    ["\n## 2026-08-19 — Chat\n\nUser: do it\nAssistant: done\n", "context.transcript"],
    ["\n```diff\n+secret change\n```\n", "content.diff"],
    ["\napi_key = \"" + "sk-" + "example-sensitive-value-1234567890" + "\"\n", "content.credential"],
    ["\n## Private Payload\n\nCustomer export follows.\n", "content.private-payload"],
    ["\nHost store: /Users/fixture/.ssh/id_rsa\n", "content.host-private"],
  ]) {
    const f = fixture();
    write(path.join(f.order, "CONTEXT.md"), contextBody + body);
    expectCode(validate(f), code);
  }
});

test("rejects incoherent unclaimed and accepted-receipt Claim fields", () => {
  const unclaimed = fixture();
  write(path.join(unclaimed.order, "CLAIM.md"), claimBody({ Claimant: "Someone" }));
  expectCode(validate(unclaimed), "claim.unclaimed-inconsistent");
  const pair = fixture();
  write(path.join(pair.order, "CLAIM.md"), claimBody({ "Accepted handoff receipt": "missing.md" }));
  expectCode(validate(pair), "claim.receipt-pair");
  const digest = fixture({ withReceipts: true });
  write(path.join(digest.order, "CLAIM.md"), claimBody({
    Disposition: "claimed",
    Claimant: "Fixture Engineer",
    "Run FUID": "ABC128",
    "Writer lane": "fixture/job-order",
    "Accepted handoff receipt": digest.receipts[1].name,
    "Accepted handoff digest": `sha256:${"0".repeat(64)}`,
  }));
  expectCode(validate(digest), "claim.digest-mismatch");
});

test("accepts an ordered receipt chain and rejects gaps, unknown stages, and prior-digest drift", () => {
  const valid = fixture({ withReceipts: true });
  assert.equal(validate(valid).ok, true);
  const gap = fixture({ withReceipts: true });
  const oldName = gap.receipts[1].name;
  const gapName = oldName.replace(/^002-/, "003-");
  cpSync(path.join(gap.order, "handoffs", oldName), path.join(gap.order, "handoffs", gapName));
  rmSync(path.join(gap.order, "handoffs", oldName));
  write(path.join(gap.order, "CLAIM.md"), readFileSync(path.join(gap.order, "CLAIM.md"), "utf8").replaceAll(oldName, gapName));
  expectCode(validate(gap), "handoff.sequence-gap");
  const stage = fixture({ withReceipts: true });
  const stagePath = path.join(stage.order, "handoffs", stage.receipts[1].name);
  write(stagePath, readFileSync(stagePath, "utf8").replace("**Next:** launch-flight", "**Next:** invented-stage"));
  expectCode(validate(stage), "handoff.unknown-stage");
  const prior = fixture({ withReceipts: true });
  const priorPath = path.join(prior.order, "handoffs", prior.receipts[1].name);
  write(priorPath, readFileSync(priorPath, "utf8").replace(/\*\*Prior digest:\*\* .+/, `**Prior digest:** sha256:${"0".repeat(64)}`));
  expectCode(validate(prior), "handoff.prior-digest-mismatch");
  const continuity = fixture({ withReceipts: true });
  const firstPath = path.join(continuity.order, "handoffs", continuity.receipts[0].name);
  write(firstPath, readFileSync(firstPath, "utf8").replace("**Next:** preflight", "**Next:** in-flight"));
  expectCode(validate(continuity), "handoff.stage-discontinuity");
});

test("proves append-only Context and receipts against exact commits", () => {
  const f = fixture({ withReceipts: true });
  git(f.root, "init", "-q");
  git(f.root, "config", "user.name", "Fixture");
  git(f.root, "config", "user.email", "fixture@example.invalid");
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "base");
  const base = git(f.root, "rev-parse", "HEAD");
  write(path.join(f.order, "CONTEXT.md"), `${contextBody}\n## 2026-08-19 — Append\n\n- Verified: append only.\n`);
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "append context");
  const candidate = git(f.root, "rev-parse", "HEAD");
  assert.equal(validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate }).ok, true);

  const receipt = path.join(f.order, "handoffs", f.receipts[0].name);
  write(receipt, `${readFileSync(receipt, "utf8")}\nchanged\n`);
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "rewrite receipt");
  const rewritten = git(f.root, "rev-parse", "HEAD");
  expectCode(validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base: candidate, candidate: rewritten }), "append.handoff-modified");

  const archived = fixture({ withArchive: true });
  git(archived.root, "init", "-q");
  git(archived.root, "config", "user.name", "Fixture");
  git(archived.root, "config", "user.email", "fixture@example.invalid");
  git(archived.root, "add", ".");
  git(archived.root, "commit", "-qm", "archived base");
  const archivedBase = git(archived.root, "rev-parse", "HEAD");
  const replacement = Buffer.from("| 2026-07-01 | spec | Rewritten archive | verified | docs | none |\n");
  writeFileSync(archived.archive, replacement);
  write(path.join(archived.spec, "SPEC.md"), readFileSync(path.join(archived.spec, "SPEC.md"), "utf8").replace(/<!-- grounding-archive:v1[^\n]+-->/, archiveLine(replacement)));
  git(archived.root, "add", ".");
  git(archived.root, "commit", "-qm", "rewrite archived evidence");
  const archivedCandidate = git(archived.root, "rev-parse", "HEAD");
  assert.equal(validate(archived).ok, true, "self-consistent rewritten archive should isolate evolution enforcement");
  expectCode(validateJobOrderEvolution({ root: archived.root, specId: "S-900", jobOrder: "JO-ABC125", base: archivedBase, candidate: archivedCandidate }), "append.archive-modified");

  const historical = fixture();
  const historicalBytes = Buffer.from("| 2026-07-01 | spec | Historical event | verified | docs | none |\n");
  const appendedRows = "| 2026-07-02 | spec | Later event C | verified | docs | none |\n"
    + "| 2026-07-03 | spec | Later event D | verified | docs | none |\n";
  const historicalSpecPath = path.join(historical.spec, "SPEC.md");
  write(
    historicalSpecPath,
    `${readFileSync(historicalSpecPath, "utf8").replace(
      "## Append-Only Evidence And Execution Log",
      "Résumé π before evidence bytes.\n\n## Append-Only Evidence And Execution Log",
    )}${historicalBytes.toString("utf8")}`,
  );
  git(historical.root, "init", "-q");
  git(historical.root, "config", "user.name", "Fixture");
  git(historical.root, "config", "user.email", "fixture@example.invalid");
  git(historical.root, "add", ".");
  git(historical.root, "commit", "-qm", "historical evidence base");
  const historicalBase = git(historical.root, "rev-parse", "HEAD");
  writeFileSync(historical.archive, historicalBytes);
  write(
    historicalSpecPath,
    readFileSync(historicalSpecPath, "utf8").replace(
      historicalBytes.toString("utf8"),
      `${archiveLine(historicalBytes)}\n${appendedRows}`,
    ),
  );
  git(historical.root, "add", ".");
  git(historical.root, "commit", "-qm", "introduce archive from historical evidence");
  const historicalCandidate = git(historical.root, "rev-parse", "HEAD");
  assert.equal(
    validateJobOrderEvolution({ root: historical.root, specId: "S-900", jobOrder: "JO-ABC125", base: historicalBase, candidate: historicalCandidate }).ok,
    true,
    "first archive introduction must preserve the complete base evidence prefix and may append later rows",
  );

  function misplacedIntroduction(baseRows, archivedRow) {
    const misplaced = fixture();
    const specPath = path.join(misplaced.spec, "SPEC.md");
    write(specPath, `${readFileSync(specPath, "utf8")}${baseRows.join("")}`);
    git(misplaced.root, "init", "-q");
    git(misplaced.root, "config", "user.name", "Fixture");
    git(misplaced.root, "config", "user.email", "fixture@example.invalid");
    git(misplaced.root, "add", ".");
    git(misplaced.root, "commit", "-qm", "evidence base");
    const base = git(misplaced.root, "rev-parse", "HEAD");
    const archivedBytes = Buffer.from(archivedRow);
    writeFileSync(misplaced.archive, archivedBytes);
    write(
      specPath,
      readFileSync(specPath, "utf8").replace(baseRows.at(-1), `${archiveLine(archivedBytes)}\n`),
    );
    git(misplaced.root, "add", ".");
    git(misplaced.root, "commit", "-qm", "misplace first archive declaration");
    const candidate = git(misplaced.root, "rev-parse", "HEAD");
    return validateJobOrderEvolution({ root: misplaced.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate });
  }

  const rowA = "| 2026-07-01 | spec | Evidence row A | verified | docs | none |\n";
  const rowB = "| 2026-07-02 | spec | Evidence row B | verified | docs | none |\n";
  const misplacedDistinct = misplacedIntroduction([rowA, rowB], rowA);
  const misplacedDuplicate = misplacedIntroduction([rowA, rowA, rowB], rowA);
  assert.deepEqual(
    [misplacedDistinct.ok, misplacedDuplicate.ok],
    [false, false],
    "first introduction must bind archive bytes to their replacement location even when the archived row also occurs more than once",
  );
  expectCode(misplacedDistinct, "append.archive-introduction-mismatch");
  expectCode(misplacedDuplicate, "append.archive-introduction-mismatch");

  const inserted = fixture();
  const insertedSpecPath = path.join(inserted.spec, "SPEC.md");
  const insertedRows = `${rowA}${rowB}`;
  write(insertedSpecPath, `${readFileSync(insertedSpecPath, "utf8")}${insertedRows}`);
  git(inserted.root, "init", "-q");
  git(inserted.root, "config", "user.name", "Fixture");
  git(inserted.root, "config", "user.email", "fixture@example.invalid");
  git(inserted.root, "add", ".");
  git(inserted.root, "commit", "-qm", "two-row evidence base");
  const insertedBase = git(inserted.root, "rev-parse", "HEAD");
  const insertedArchive = Buffer.from(insertedRows);
  writeFileSync(inserted.archive, insertedArchive);
  write(
    insertedSpecPath,
    readFileSync(insertedSpecPath, "utf8").replace(rowA, `${archiveLine(insertedArchive)}\n${rowA}`),
  );
  git(inserted.root, "add", ".");
  git(inserted.root, "commit", "-qm", "insert declaration without replacing evidence");
  const insertedCandidate = git(inserted.root, "rev-parse", "HEAD");
  assert.equal(validate(inserted).ok, true, "reconstructed duplicate evidence remains structurally valid");
  expectCode(
    validateJobOrderEvolution({ root: inserted.root, specId: "S-900", jobOrder: "JO-ABC125", base: insertedBase, candidate: insertedCandidate }),
    "append.archive-introduction-mismatch",
  );

  const invented = fixture();
  const originalBytes = Buffer.from("| 2026-07-01 | spec | Original event | verified | docs | none |\n");
  const inventedBytes = Buffer.from("| 2026-07-01 | spec | Invented event | verified | docs | none |\n");
  const inventedSpecPath = path.join(invented.spec, "SPEC.md");
  write(
    inventedSpecPath,
    `${readFileSync(inventedSpecPath, "utf8")}${originalBytes.toString("utf8")}`,
  );
  git(invented.root, "init", "-q");
  git(invented.root, "config", "user.name", "Fixture");
  git(invented.root, "config", "user.email", "fixture@example.invalid");
  git(invented.root, "add", ".");
  git(invented.root, "commit", "-qm", "original evidence base");
  const inventedBase = git(invented.root, "rev-parse", "HEAD");
  writeFileSync(invented.archive, inventedBytes);
  write(
    inventedSpecPath,
    readFileSync(inventedSpecPath, "utf8").replace(
      originalBytes.toString("utf8"),
      `${archiveLine(inventedBytes)}\n`,
    ),
  );
  git(invented.root, "add", ".");
  git(invented.root, "commit", "-qm", "invent archive bytes with matching metadata");
  const inventedCandidate = git(invented.root, "rev-parse", "HEAD");
  expectCode(
    validateJobOrderEvolution({ root: invented.root, specId: "S-900", jobOrder: "JO-ABC125", base: inventedBase, candidate: inventedCandidate }),
    "append.archive-introduction-mismatch",
  );
});

test("permits exactly one immutable pre-ticket Canon declaration insertion", () => {
  const f = multiCanonEvolutionFixture();
  assert.equal(
    validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base: f.base, candidate: f.candidate }).ok,
    true,
    "one second Canon archive may be introduced without reordering established declarations",
  );

  for (const [name, mutate] of [
    ["old declaration mutation", ({ spec, oldDeclaration }) => {
      const specPath = path.join(spec, "SPEC.md");
      write(specPath, readFileSync(specPath, "utf8").replace(oldDeclaration, oldDeclaration.replace(/sha256=[0-9a-f]{64}/, `sha256=${"0".repeat(64)}`)));
    }],
    ["old declaration reorder", ({ spec, oldDeclaration }) => {
      const specPath = path.join(spec, "SPEC.md");
      const text = readFileSync(specPath, "utf8").replace(`${oldDeclaration}\n`, "");
      write(specPath, text.replace("## Append-Only Evidence And Execution Log", `## Append-Only Evidence And Execution Log\n\n${oldDeclaration}`));
    }],
    ["new declaration after the protected ticket boundary", ({ spec, newCanonPath }) => {
      const specPath = path.join(spec, "SPEC.md");
      const line = canonArchiveLine(readFileSync(newCanonPath), path.basename(newCanonPath), "JO-ABC125/R1", "JO-ABC125/R2");
      const text = readFileSync(specPath, "utf8").replace(`${line}\n`, "");
      write(specPath, text.replace("## Vertical Implementation Slices", `## Vertical Implementation Slices\n\n${line}`));
    }],
    ["second new declaration", ({ spec, newCanonPath }) => {
      const secondPath = path.join(spec, "CANON_DUPLICATE_R1_THROUGH_R2.md");
      cpSync(newCanonPath, secondPath);
      const line = canonArchiveLine(readFileSync(secondPath), path.basename(secondPath), "JO-ABC125/R1", "JO-ABC125/R2");
      const specPath = path.join(spec, "SPEC.md");
      write(specPath, readFileSync(specPath, "utf8").replace("## Vertical Implementation Slices", `${line}\n\n## Vertical Implementation Slices`));
    }],
  ]) {
    const rejected = multiCanonEvolutionFixture(mutate);
    expectCode(
      validateJobOrderEvolution({ root: rejected.root, specId: "S-900", jobOrder: "JO-ABC125", base: rejected.base, candidate: rejected.candidate }),
      "append.archive-modified",
    );
    assert.ok(name);
  }

  for (const [name, mutate] of [
    ["archive bytes", ({ newCanonPath }) => writeFileSync(newCanonPath, Buffer.concat([readFileSync(newCanonPath), Buffer.from("mutation\n")]))],
    ["archive tuple", ({ spec, newCanonPath }) => {
      const specPath = path.join(spec, "SPEC.md");
      const line = canonArchiveLine(readFileSync(newCanonPath), path.basename(newCanonPath), "JO-ABC125/R1", "JO-ABC125/R2");
      write(specPath, readFileSync(specPath, "utf8").replace(line, line.replace(/sha256=[0-9a-f]{64}/, `sha256=${"0".repeat(64)}`)));
    }],
    ["archive path", ({ spec, newCanonPath }) => {
      const movedPath = path.join(spec, "CANON_MOVED_R1_THROUGH_R2.md");
      cpSync(newCanonPath, movedPath);
      rmSync(newCanonPath);
      const specPath = path.join(spec, "SPEC.md");
      write(specPath, readFileSync(specPath, "utf8").replace(path.basename(newCanonPath), path.basename(movedPath)));
    }],
    ["archive kind", ({ spec }) => {
      const specPath = path.join(spec, "SPEC.md");
      write(specPath, readFileSync(specPath, "utf8").replace("<!-- canon-archive:v1 path=CANON_R1_THROUGH_R2.md", "<!-- grounding-archive:v1 path=CANON_R1_THROUGH_R2.md"));
    }],
  ]) {
    const immutable = multiCanonEvolutionFixture();
    const introducedBase = immutable.candidate;
    mutate(immutable);
    const changed = commitAll(immutable.root, `mutate introduced ${name}`);
    expectCode(
      validateJobOrderEvolution({ root: immutable.root, specId: "S-900", jobOrder: "JO-ABC125", base: introducedBase, candidate: changed }),
      "append.archive-modified",
    );
  }
});

test("freezes the complete physical evidence prefix and rejects archived rows in later appends", () => {
  const rowA = "| 2026-07-01 | spec | Archived row A | verified | docs | none |\n";
  const rowB = "| 2026-07-02 | spec | Archived row B | verified | docs | none |\n";
  const rowC = "| 2026-07-03 | spec | Archived row C | verified | docs | none |\n";
  const established = "| 2026-07-04 | spec | Established hot row | verified | docs | none |\n";
  const establishedSecond = "| 2026-07-04 | spec | Established hot row two | verified | docs | none |\n";
  const fresh = "| 2026-07-05 | spec | Genuinely new row | verified | docs | none |\n";

  function laterEvolution({ archiveRows = [rowA, rowB, rowC], mutate }) {
    const f = fixture();
    const archiveBytes = Buffer.from(archiveRows.join(""));
    const declaration = archiveLine(archiveBytes);
    writeFileSync(f.archive, archiveBytes);
    write(path.join(f.spec, "SPEC.md"), specBody({ archiveDeclaration: `${declaration}\n${established}${establishedSecond}` }));
    git(f.root, "init", "-q");
    git(f.root, "config", "user.name", "Fixture");
    git(f.root, "config", "user.email", "fixture@example.invalid");
    git(f.root, "add", ".");
    git(f.root, "commit", "-qm", "archived evidence base");
    const base = git(f.root, "rev-parse", "HEAD");
    write(path.join(f.spec, "SPEC.md"), mutate(readFileSync(path.join(f.spec, "SPEC.md"), "utf8"), declaration));
    git(f.root, "add", ".");
    git(f.root, "commit", "-qm", "later evidence evolution");
    const candidate = git(f.root, "rev-parse", "HEAD");
    assert.equal(validate(f).ok, true, "adversarial candidate must remain structurally valid");
    return validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate });
  }

  const archivedRowCases = [
    ["first archived row", rowA],
    ["last archived row", rowC],
    ["partial archived sequence", `${rowB}${rowC}`],
    ["archived row mixed with fresh appends", `${fresh}${rowB}`],
    ["byte-identical duplicate archived row", rowA, [rowA, rowA, rowB]],
    ["archived row converted from LF to CRLF", rowA.replace(/\n$/, "\r\n")],
    ["archived row with trailing spaces", rowA.replace(/\n$/, "   \n")],
    ["archived row with trailing tabs and CRLF", rowA.replace(/\n$/, "\t \t\r\n")],
  ];
  for (const [name, append, archiveRows] of archivedRowCases) {
    const result = laterEvolution({
      archiveRows,
      mutate: (text) => `${text}${append}`,
    });
    assert.equal(result.ok, false, `${name} must not return after archive introduction`);
    expectCode(result, "append.archive-row-reintroduced");
  }

  const prefixCases = [
    ["declaration relocated earlier", (text, declaration) => text
      .replace(`${declaration}\n`, "")
      .replace("## Append-Only Evidence And Execution Log\n\n", `## Append-Only Evidence And Execution Log\n\n${declaration}\n`)],
    ["declaration relocated later", (text, declaration) => text.replace(`${declaration}\n${established}`, `${established}${declaration}\n`)],
    ["bytes inserted before established evidence", (text, declaration) => text.replace(`${declaration}\n${established}`, `${declaration}\ninserted bytes\n${established}`)],
    ["row inserted between established evidence", (text) => text.replace(`${established}${establishedSecond}`, `${established}${fresh}${establishedSecond}`)],
    ["established physical prefix changed", (text) => text.replace("Established hot row", "Changed hot row")],
  ];
  for (const [name, mutate] of prefixCases) {
    const result = laterEvolution({ mutate });
    assert.equal(result.ok, false, `${name} must violate the physical evidence prefix`);
    expectCode(result, "append.evidence-prefix-modified");
  }

  const lawful = laterEvolution({ mutate: (text) => `${text}${fresh}` });
  assert.equal(lawful.ok, true, "a genuinely new terminal Grounding row remains lawful");

  const semanticVariants = [
    rowA.replace("Archived row A", "Archived  row A"),
    rowA.replace("Archived row A", "archived row A"),
    rowA.replace("Archived row A", "Archived \\| row A"),
  ];
  for (const append of semanticVariants) {
    assert.equal(
      laterEvolution({ mutate: (text) => `${text}${append}` }).ok,
      true,
      "semantic cell content, internal whitespace, case, and Markdown escaping must not be normalized",
    );
  }

  const malformedRows = [
    "| 2026-07-05 | truncated |\n",
    "| 2026-07-05 | spec | event | verified | docs | gap | extra |\n",
    "| Date | Ticket | Event | Verification | Docs | Remaining gap |\n",
    "|---|---|---|---|---|---|\n",
    "| 2026-13-40 | spec | event | verified | docs | gap |\n",
    "| 2026-07-05 | spec | unescaped | pipe | verified | docs | gap |\n",
    "| 2026-07-05 | spec | escaped \\| pipe | verified | docs | gap |\n",
    "\ufeff| 2026-07-05 | spec | event | verified | docs | gap |\n",
  ];
  for (const append of malformedRows.slice(0, -2)) {
    const result = laterEvolution({ mutate: (text) => `${text}${append}` });
    assert.equal(result.ok, false, `malformed, header, separator, invalid-date, and extra-cell rows must be rejected: ${JSON.stringify(append)}`);
    expectCode(result, "append.evidence-prefix-modified");
  }
  assert.equal(
    laterEvolution({ mutate: (text) => `${text}${malformedRows.at(-2)}` }).ok,
    true,
    "an escaped pipe inside one evidence cell remains valid",
  );
  const bom = laterEvolution({ mutate: (text) => `${text}${malformedRows.at(-1)}` });
  assert.equal(bom.ok, false, "a BOM-prefixed terminal row must not be normalized into validity");
  expectCode(bom, "append.evidence-prefix-modified");

  const duplicateFresh = laterEvolution({ mutate: (text) => `${text}${fresh}${fresh}` });
  assert.equal(duplicateFresh.ok, false, "two identical new rows in one append must be rejected");
  expectCode(duplicateFresh, "append.archive-row-reintroduced");
  const duplicateFreshWhitespace = laterEvolution({
    mutate: (text) => `${text}${fresh}${fresh.replace(/\n$/, " \t\r\n")}`,
  });
  assert.equal(duplicateFreshWhitespace.ok, false, "new-row duplicates must normalize EOL and trailing horizontal whitespace");
  expectCode(duplicateFreshWhitespace, "append.archive-row-reintroduced");
});

test("binds exact-ref validation to the clean checked-out candidate tree", () => {
  const f = fixture();
  git(f.root, "init", "-q");
  git(f.root, "config", "user.name", "Fixture");
  git(f.root, "config", "user.email", "fixture@example.invalid");
  git(f.root, "add", "fuid-registry.json", "specs/S-900-fixture/SPEC.md");
  git(f.root, "commit", "-qm", "candidate without Job Order");
  const missing = git(f.root, "rev-parse", "HEAD");
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "valid candidate");
  const valid = git(f.root, "rev-parse", "HEAD");
  assert.equal(validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base: missing, candidate: valid }).ok, true);
  expectCode(validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base: missing, candidate: missing }), "evolution.candidate-not-checked-out");
});

test("exported exact-ref validation ignores caller-supplied git overrides", () => {
  const f = fixture({ withReceipts: true });
  git(f.root, "init", "-q");
  git(f.root, "config", "user.name", "Fixture");
  git(f.root, "config", "user.email", "fixture@example.invalid");
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "base");
  const base = git(f.root, "rev-parse", "HEAD");
  write(path.join(f.order, "CONTEXT.md"), `${contextBody}\n## 2026-08-19 — Append\n\n- Verified: append only.\n`);
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "append context");
  const candidate = git(f.root, "rev-parse", "HEAD");

  assert.equal(
    validateJobOrderEvolution(
      { root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate },
      { exactRefGit: { gitPath: "/usr/bin/false", spawnSync: () => ({ status: 1, stdout: "", stderr: "" }) } },
    ).ok,
    true,
    "exported exact-ref validation must ignore caller-supplied failure overrides",
  );

  const forged = validateJobOrderEvolution(
    { root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate: base },
    {
      exactRefGit: {
        gitPath: CANON_ARCHIVE_GIT_PATH,
        spawnSync: (_command, argv, options) => {
          const subcommand = argv.slice(2);
          if (subcommand[0] === "rev-parse" && subcommand[1] === "HEAD") {
            return { status: 0, stdout: `${base}\n`, stderr: "" };
          }
          if (subcommand[0] === "status" && subcommand[1] === "--porcelain") {
            return { status: 0, stdout: "", stderr: "" };
          }
          return spawnSync(CANON_ARCHIVE_GIT_PATH, argv, {
            cwd: options.cwd,
            encoding: options.encoding,
            env: options.env,
            shell: false,
          });
        },
      },
    },
  );
  expectCode(forged, "evolution.candidate-not-checked-out");
});

test("exact-ref validation ignores fake git on PATH at the --base/--candidate seam", () => {
  const f = fixture({ withReceipts: true });
  git(f.root, "init", "-q");
  git(f.root, "config", "user.name", "Fixture");
  git(f.root, "config", "user.email", "fixture@example.invalid");
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "base");
  const base = git(f.root, "rev-parse", "HEAD");
  write(path.join(f.order, "CONTEXT.md"), `${contextBody}\n## 2026-08-19 — Append\n\n- Verified: append only.\n`);
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "append context");
  const candidate = git(f.root, "rev-parse", "HEAD");

  withDelegatingGitOnPath(({ markerPath }) => {
    const outcome = spawnSync(process.execPath, [
      TOOL_REL,
      "validate",
      "--root", f.root,
      "--spec", "S-900",
      "--job-order", "JO-ABC125",
      "--base", base,
      "--candidate", candidate,
      "--json",
    ], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env,
      shell: false,
    });
    assert.equal(existsSync(markerPath), false, "exact-ref validation must not execute git resolved from ambient PATH");
    assert.equal(outcome.status, 0, outcome.stderr || outcome.stdout);
    assert.equal(JSON.parse(outcome.stdout).ok, true);
  });
});

test("isolates exact-ref Git reads from ambient git config, repo discovery, and transport overrides", () => {
  const f = fixture({ withReceipts: true });
  const canonicalRoot = realpathSync(f.root);
  git(f.root, "init", "-q");
  git(f.root, "config", "user.name", "Fixture");
  git(f.root, "config", "user.email", "fixture@example.invalid");
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "base");
  const base = git(f.root, "rev-parse", "HEAD");
  write(path.join(f.order, "CONTEXT.md"), `${contextBody}\n## 2026-08-19 — Append\n\n- Verified: append only.\n`);
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "append context");
  const candidate = git(f.root, "rev-parse", "HEAD");
  const fakeHome = mkdtempSync(path.join(tmpdir(), "job-order-workspace-evolution-home-"));
  const fakeXdg = mkdtempSync(path.join(tmpdir(), "job-order-workspace-evolution-xdg-"));
  const fakeSystem = path.join(mkdtempSync(path.join(tmpdir(), "job-order-workspace-evolution-system-")), "gitconfig");
  const fakeGlobal = path.join(mkdtempSync(path.join(tmpdir(), "job-order-workspace-evolution-global-")), "gitconfig");
  cleanup.push(fakeHome, fakeXdg, path.dirname(fakeSystem), path.dirname(fakeGlobal));
  writeFileSync(fakeSystem, `[http]\n\tproxy = http://127.0.0.1:9\n`);
  writeFileSync(fakeGlobal, `[url "file:///tmp/not-real"]\n\tinsteadOf = https://github.com/example/workspace.git\n`);

  const result = withEnv({
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "url.file:///tmp/not-real.insteadOf",
    GIT_CONFIG_VALUE_0: "https://github.com/example/workspace.git",
    GIT_CONFIG_PARAMETERS: "'http.proxy=http://127.0.0.1:9'",
    GIT_CONFIG_SYSTEM: fakeSystem,
    GIT_CONFIG_GLOBAL: fakeGlobal,
    HOME: fakeHome,
    XDG_CONFIG_HOME: fakeXdg,
    GIT_DIR: path.join(f.root, ".git"),
    GIT_WORK_TREE: f.root,
    GIT_COMMON_DIR: path.join(f.root, ".git"),
    GIT_NAMESPACE: "fixture",
    GIT_SSH: "/tmp/fake-ssh",
    GIT_SSH_COMMAND: "ssh -F /tmp/fake-ssh-config",
    GIT_PROXY_COMMAND: "/tmp/fake-proxy",
    GIT_ASKPASS: "/tmp/fake-askpass",
    SSH_ASKPASS: "/tmp/fake-ssh-askpass",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "socks5://127.0.0.1:9",
    NO_PROXY: "localhost",
    GIT_DISCOVERY_ACROSS_FILESYSTEM: "1",
    GIT_CEILING_DIRECTORIES: f.root,
  }, () => ({
    validation: validateJobOrderEvolution({ root: f.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate }),
    plan: describeTrustedExactRefGit(f.root),
  }));

  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.errors));
  assert.equal(result.plan.gitPath, realpathSync(CANON_ARCHIVE_GIT_PATH), "trusted exact-ref git reads must bind the trusted absolute executable");
  assert.deepEqual(result.plan.argvPrefix, ["-C", canonicalRoot], "trusted exact-ref git reads must bind the repository explicitly");
  assert.equal(result.plan.root, canonicalRoot, "trusted exact-ref git reads must target the canonical repository root");
  assert.notEqual(result.plan.cwd, f.root, "trusted exact-ref git reads must not run from the repository root");
  assert.ok(!result.plan.cwd.startsWith(`${f.root}${path.sep}`), "trusted exact-ref git reads must run from a neutral non-repository cwd");
  assert.equal(result.plan.env.GIT_CONFIG_COUNT, "0", "ambient env config entries must be zeroed");
  assert.equal(result.plan.env.GIT_CONFIG_NOSYSTEM, "1", "system git config must be disabled");
  assert.equal(result.plan.env.GIT_CONFIG_SYSTEM, devNull, "system git config path must be neutralized");
  assert.equal(result.plan.env.GIT_CONFIG_GLOBAL, devNull, "global git config path must be neutralized");
  assert.equal(result.plan.env.GIT_TERMINAL_PROMPT, "0", "interactive git prompting must be disabled");
  assert.equal(result.plan.env.GIT_OPTIONAL_LOCKS, "0", "trusted exact-ref git reads must remain lock-free");
  assert.equal(result.plan.env.GIT_DISCOVERY_ACROSS_FILESYSTEM, "0", "git repo discovery must stay bounded");
  assert.equal(result.plan.env.GIT_CEILING_DIRECTORIES, result.plan.cwd, "repo discovery ceiling must bind to the neutral cwd");
  for (const key of [
    "PATH",
    "HOME",
    "XDG_CONFIG_HOME",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_PARAMETERS",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_SSH",
    "GIT_SSH_COMMAND",
    "GIT_PROXY_COMMAND",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
  ]) {
    assert.equal(Object.hasOwn(result.plan.env, key), false, `${key} must not reach trusted exact-ref git reads`);
  }
});

test("freezes only the selected terminal Job Order tree without inventing a close mutator", () => {
  function terminalFixture() {
    const f = fixture({ withReceipts: true });
    write(path.join(f.order, "JOB_ORDER.md"), orderBody({ status: "closed-complete", plane: "Enduring Context" }));
    write(path.join(f.order, "CLAIM.md"), readFileSync(path.join(f.order, "CLAIM.md"), "utf8").replace("**Disposition:** claimed", "**Disposition:** closed-complete"));
    git(f.root, "init", "-q");
    git(f.root, "config", "user.name", "Fixture");
    git(f.root, "config", "user.email", "fixture@example.invalid");
    git(f.root, "add", ".");
    git(f.root, "commit", "-qm", "terminal");
    return f;
  }

  const sibling = terminalFixture();
  const siblingBase = git(sibling.root, "rev-parse", "HEAD");
  write(path.join(sibling.spec, "SPEC.md"), `${readFileSync(path.join(sibling.spec, "SPEC.md"), "utf8")}\nSibling Spec change.\n`);
  git(sibling.root, "add", ".");
  git(sibling.root, "commit", "-qm", "change sibling Spec only");
  const siblingCandidate = git(sibling.root, "rev-parse", "HEAD");
  assert.equal(
    validateJobOrderEvolution({ root: sibling.root, specId: "S-900", jobOrder: "JO-ABC125", base: siblingBase, candidate: siblingCandidate }).ok,
    true,
    "an unchanged terminal Job Order must ignore sibling Spec evolution",
  );

  for (const relative of [
    "JOB_ORDER.md",
    "CLAIM.md",
    "CONTEXT.md",
    "handoffs/001-ABC128-sitrep-to-preflight-ABC126.md",
  ]) {
    const selected = terminalFixture();
    const base = git(selected.root, "rev-parse", "HEAD");
    const target = path.join(selected.order, relative);
    write(target, `${readFileSync(target, "utf8")}\nMutation.\n`);
    git(selected.root, "add", ".");
    git(selected.root, "commit", "-qm", `mutate terminal ${relative}`);
    const candidate = git(selected.root, "rev-parse", "HEAD");
    expectCode(validateJobOrderEvolution({ root: selected.root, specId: "S-900", jobOrder: "JO-ABC125", base, candidate }), "terminal.freeze-violation");
  }
});

test("CLI returns deterministic JSON and fails closed on partial exact-ref input", () => {
  const f = fixture();
  const args = [TOOL_REL, "validate", "--root", f.root, "--spec", "S-900", "--job-order", "JO-ABC125", "--json"];
  const first = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: "utf8" });
  const second = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(first.stdout, second.stdout);
  assert.equal(JSON.parse(first.stdout).ok, true);
  const partial = spawnSync(process.execPath, [...args.slice(0, -1), "--base", "1".repeat(40), "--json"], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(partial.status, 2);
  const linkedEntrypoint = path.join(f.root, "job-order-workspace-link.mjs");
  symlinkSync(path.join(REPO_ROOT, TOOL_REL), linkedEntrypoint);
  const throughLink = spawnSync(process.execPath, [linkedEntrypoint, ...args.slice(1)], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(throughLink.status, 0, throughLink.stderr || throughLink.stdout);
  assert.equal(JSON.parse(throughLink.stdout).ok, true);

  const exact = fixture();
  const exactSha = initFixtureRepo(exact.root, "exact model fixture");
  const exactRun = spawnSync(process.execPath, [
    TOOL_REL, "validate", "--root", exact.root,
    "--spec", "S-900", "--job-order", "JO-ABC125",
    "--base", exactSha, "--candidate", exactSha, "--json",
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(exactRun.status, 0, exactRun.stderr || exactRun.stdout);
  assert.equal(JSON.parse(exactRun.stdout).launchModel.schema, "gpt-os.job-order-launch.v2");
});

test("CLI suppresses the launch model on an evolution-only exact-ref rejection", () => {
  const f = fixture();
  const base = initFixtureRepo(f.root, "evolution rejection base");
  const contextPath = path.join(f.order, "CONTEXT.md");
  replaceIn(contextPath, "fixture created for deterministic validation", "fixture context prefix was overwritten");
  const candidate = commitAll(f.root, "overwrite context prefix");
  const before = treeDigest(f.root);
  const run = spawnSync(process.execPath, [
    TOOL_REL, "validate", "--root", f.root,
    "--spec", "S-900", "--job-order", "JO-ABC125",
    "--base", base, "--candidate", candidate, "--json",
  ], { cwd: REPO_ROOT, encoding: "utf8" });
  assert.equal(run.status, 1, run.stderr || run.stdout);
  const value = JSON.parse(run.stdout);
  assert.equal(value.ok, false);
  assert.ok(value.errors.some((error) => error.code === "append.context-overwrite"));
  assert.equal(value.launchModel, null);
  assert.doesNotMatch(run.stdout, /"launchEligible"\s*:\s*true/);
  assert.equal(treeDigest(f.root), before, "evolution-only CLI rejection mutated the fixture repository");
});

for (const target of cleanup) {
  try { chmodSync(target, 0o700); } catch {}
  rmSync(target, { recursive: true, force: true });
}

process.stdout.write(`ok - job-order workspace validator: ${checks} checks passed\n`);
