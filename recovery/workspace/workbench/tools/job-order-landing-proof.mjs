#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { laneRelative } from "./workspace-paths.mjs";

const FULL_SHA = /^[0-9a-f]{40}$/;
const TASK_ID = /^01[a-z0-9-]+$/;
const toolPath = fileURLToPath(import.meta.url);

function observationFor(validation) {
  if (validation.ok) return "pass";
  const codes = validation.errors?.map(({ code }) => code) || [];
  return codes.length === 1 ? codes[0] : codes.join(",");
}

function validateSegment({ root, specId, jobOrder, base, candidate }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "job-order-landing-proof-"));
  const checkout = path.join(tempRoot, "repo");
  try {
    execFileSync("git", ["clone", "--quiet", "--no-checkout", "--no-hardlinks", root, checkout], { stdio: "pipe" });
    execFileSync("git", ["checkout", "--quiet", "--detach", candidate], { cwd: checkout, stdio: "pipe" });
    const run = spawnSync(process.execPath, [
      path.join(root, laneRelative(root, "tools"), "job-order-workspace.mjs"),
      "validate", "--root", checkout, "--spec", specId, "--job-order", jobOrder,
      "--base", base, "--candidate", candidate, "--json",
    ], { encoding: "utf8" });
    if (![0, 1].includes(run.status)) throw new Error("segment validator did not return a validation result");
    return JSON.parse(run.stdout);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export function composeLandingProof({ root, specId, jobOrder, segments, acceptedReview }) {
  const errors = [];
  const canonicalRoot = fs.realpathSync(root);
  if (!Array.isArray(segments) || segments.length === 0) {
    return { ok: false, errors: [{ code: "composition.segments-required" }], observations: [] };
  }
  for (const [index, segment] of segments.entries()) {
    if (!FULL_SHA.test(segment.base || "") || !FULL_SHA.test(segment.candidate || "") || !segment.expected) {
      errors.push({ code: "composition.segment-invalid", segment: index + 1 });
    }
    if (index && segments[index - 1].candidate !== segment.base) {
      errors.push({ code: "composition.segment-discontiguous", segment: index + 1 });
    }
  }
  if (!acceptedReview || !TASK_ID.test(acceptedReview.task || "") || acceptedReview.verdict !== "PASS"
      || acceptedReview.candidate !== segments.at(-1)?.candidate) {
    errors.push({ code: "composition.accepted-review-mismatch" });
  }
  if (errors.length) return { ok: false, errors, observations: [], acceptedReview };

  const observations = segments.map((segment, index) => {
    const validation = validateSegment({ root: canonicalRoot, specId, jobOrder, ...segment });
    const observation = observationFor(validation);
    if (observation !== segment.expected) {
      errors.push({
        code: "composition.observation-mismatch",
        segment: index + 1,
        expected: segment.expected,
        observed: observation,
      });
    }
    return { base: segment.base, candidate: segment.candidate, expected: segment.expected, observation };
  });
  return { ok: errors.length === 0, spec: specId, jobOrder, observations, acceptedReview, errors };
}

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write("usage: job-order-landing-proof.mjs validate --root PATH --spec S-### --job-order JO-XXXXXX --segment BASE..CANDIDATE=OBSERVATION [--segment ...] --accepted-review TASK@CANDIDATE --json\n");
  return 2;
}

function parseArgs(argv) {
  if (argv[0] !== "validate") throw new Error("validate is the only supported command");
  const values = { segments: [], json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") { values.json = true; continue; }
    if (arg === "--segment") {
      const match = argv[++index]?.match(/^([0-9a-f]{40})\.\.([0-9a-f]{40})=([a-z0-9.,-]+)$/);
      if (!match) throw new Error("invalid segment");
      values.segments.push({ base: match[1], candidate: match[2], expected: match[3] });
      continue;
    }
    if (!["--root", "--spec", "--job-order", "--accepted-review"].includes(arg) || index + 1 >= argv.length) {
      throw new Error(`invalid argument ${arg}`);
    }
    const value = argv[++index];
    if (arg === "--accepted-review") {
      const [task, candidate] = value.split("@");
      values.acceptedReview = { task, candidate, verdict: "PASS" };
    } else {
      values[arg === "--job-order" ? "jobOrder" : arg.slice(2).replace("spec", "specId")] = value;
    }
  }
  if (!values.root || !values.specId || !values.jobOrder || !values.acceptedReview || !values.segments.length) {
    throw new Error("missing required argument");
  }
  return values;
}

if (fs.realpathSync(process.argv[1]) === fs.realpathSync(toolPath)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = composeLandingProof(args);
    process.stdout.write(`${JSON.stringify(result, null, args.json ? 2 : 0)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.exitCode = usage(error.message);
  }
}
