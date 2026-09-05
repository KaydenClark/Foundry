#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("./projects.mjs", import.meta.url));
const shippedIndex = readFileSync(new URL("../INDEX.md", import.meta.url), "utf8");
const shippedTemplate = readFileSync(new URL("../templates/projects.json", import.meta.url), "utf8");
JSON.parse(readFileSync(new URL("../schema/projects.schema.json", import.meta.url), "utf8"));
const root = mkdtempSync(join(tmpdir(), "foundry-projects-"));

const missingRoot = spawnSync(process.execPath, [tool, "check"], { encoding: "utf8" });
assert.equal(missingRoot.status, 1);
assert.match(missingRoot.stderr, /--root is required/i);

function run(args, expected = 0) {
  const result = spawnSync(process.execPath, [tool, ...args, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, expected, result.stderr || result.stdout);
  return result;
}

try {
  const fixture = join(root, "Projects", "fixture");
  const secondFixture = join(root, "Projects", "second-fixture");
  const decoy = join(root, "Projects", "not-enrolled");
  mkdirSync(fixture, { recursive: true });
  mkdirSync(secondFixture, { recursive: true });
  mkdirSync(decoy, { recursive: true });
  writeFileSync(join(fixture, "AGENTS.md"), "# Fixture ownership\n");
  writeFileSync(join(secondFixture, "AGENTS.md"), "# Second fixture ownership\n");
  writeFileSync(join(decoy, "AGENTS.md"), "# Decoy ownership\n");

  run(["init"]);
  assert.equal(readFileSync(join(root, "Projects", "INDEX.md"), "utf8"), shippedIndex);
  assert.equal(readFileSync(join(root, "Projects", "projects.json"), "utf8"), shippedTemplate);
  run([
    "enroll",
    "--id", "P-002",
    "--name", "Second Fixture",
    "--owner", "second-owner",
    "--project", "Projects/second-fixture",
  ]);
  run([
    "enroll",
    "--id", "P-001",
    "--name", "Fixture Project",
    "--owner", "fixture-owner",
    "--project", "Projects/fixture",
  ]);
  run(["check"]);
  const unknown = run(["check", "--scan", "/"], 1);
  assert.match(unknown.stderr, /unexpected option/i);

  const index = readFileSync(join(root, "Projects", "INDEX.md"), "utf8");
  assert.match(index, /\| P-001 \| \[Fixture Project\]\(fixture\/\) \| fixture-owner \|/);
  assert.ok(index.indexOf("| P-001 |") < index.indexOf("| P-002 |"), "index rows must be stable ID order");
  assert.doesNotMatch(index, /not-enrolled/, "unregistered directories must never be discovered");
  run([
    "enroll",
    "--id", "P-001",
    "--name", "Duplicate",
    "--owner", "other-owner",
    "--project", "Projects/not-enrolled",
  ], 1);
  const outside = run([
    "enroll",
    "--id", "P-003",
    "--name", "Outside",
    "--owner", "other-owner",
    "--project", "../outside",
  ], 1);
  assert.match(outside.stderr, /under Projects|Projects root/i);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("ok - generic Projects capability passed");
