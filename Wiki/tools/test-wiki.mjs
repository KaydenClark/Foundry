#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const wikiTool = fileURLToPath(new URL("./wiki.mjs", import.meta.url));
const projectsTool = fileURLToPath(new URL("../../Projects/tools/projects.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "foundry-wiki-"));
const outside = mkdtempSync(join(tmpdir(), "foundry-wiki-outside-"));
const escapedRoot = mkdtempSync(join(tmpdir(), "foundry-wiki-escaped-root-"));
JSON.parse(readFileSync(new URL("../schema/wiki.schema.json", import.meta.url), "utf8"));

const missingRoot = spawnSync(process.execPath, [wikiTool, "check"], { encoding: "utf8" });
assert.equal(missingRoot.status, 1);
assert.match(missingRoot.stderr, /--root|usage/i);

const unknownOption = spawnSync(
  process.execPath,
  [wikiTool, "check", "--scan", "/", "--root", root],
  { encoding: "utf8" },
);
assert.equal(unknownOption.status, 1);
assert.match(unknownOption.stderr, /only --root|unexpected option/i);

function runAt(tool, args, targetRoot, expected = 0) {
  const result = spawnSync(process.execPath, [tool, ...args, "--root", targetRoot], { encoding: "utf8" });
  assert.equal(result.status, expected, result.stderr || result.stdout);
  return result;
}

function run(tool, args, expected = 0) {
  return runAt(tool, args, root, expected);
}

try {
  const project = join(root, "Projects", "fixture room");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "AGENTS.md"), "# Fixture ownership\n");
  run(projectsTool, ["init"]);
  run(projectsTool, [
    "enroll",
    "--id", "P-001",
    "--name", "Fixture [Docs]",
    "--owner", "fixture|owner",
    "--project", "Projects/fixture room",
  ]);
  run(wikiTool, ["init"]);
  run(wikiTool, ["check"]);

  const rootMemory = readFileSync(join(root, "Wiki", "MEMORY.md"), "utf8");
  const projectMemory = readFileSync(join(project, "MEMORY.md"), "utf8");
  const pointer = readFileSync(join(root, "Wiki", "Projects", "P-001.md"), "utf8");
  const wikiIndex = readFileSync(join(root, "Wiki", "Projects", "INDEX.md"), "utf8");
  const projectIndex = readFileSync(join(root, "Projects", "INDEX.md"), "utf8");
  for (const body of [rootMemory, projectMemory, pointer, wikiIndex, projectIndex]) {
    assert.doesNotMatch(body, /\{\{[A-Z0-9_]+\}\}/);
  }
  assert.match(wikiIndex, /\[Fixture \\\[Docs\\\]\]\(P-001\.md\)/);
  assert.match(pointer, /\.\.\/\.\.\/Projects\/fixture%20room\/MEMORY\.md/);
  assert.match(pointer, /  - "Projects\/fixture room\/AGENTS\.md"/);
  assert.match(projectIndex, /\(fixture%20room\/\)/);

  mkdirSync(join(root, "Wiki", "Owner"), { recursive: true });
  writeFileSync(join(root, "Wiki", "Owner", "Private.md"), "PRIVATE_SENTINEL\n");
  run(wikiTool, ["check"]);
  assert.doesNotMatch(rootMemory + pointer + wikiIndex, /PRIVATE_SENTINEL|Owner\/Private/);

  writeFileSync(
    join(root, "Wiki", "Projects", "P-001.md"),
    pointer.replace("status: active", "status: active\nstatus: active"),
  );
  const duplicateField = run(wikiTool, ["check"], 1);
  assert.match(duplicateField.stderr, /duplicate frontmatter field/i);

  writeFileSync(
    join(root, "Wiki", "Projects", "P-001.md"),
    pointer.replace("Projects/projects.json", "Projects/missing.json"),
  );
  const missingSource = run(wikiTool, ["check"], 1);
  assert.match(missingSource.stderr, /unresolved memory source/i);

  writeFileSync(
    join(root, "Wiki", "Projects", "P-001.md"),
    pointer.replace("../../Projects/fixture%20room/MEMORY.md", "%ZZ"),
  );
  const invalidEncoding = run(wikiTool, ["check"], 1);
  assert.match(invalidEncoding.stderr, /invalid encoded memory link/i);

  writeFileSync(join(outside, "private.md"), "outside\n");
  symlinkSync(join(outside, "private.md"), join(root, "escape.md"));
  writeFileSync(
    join(root, "Wiki", "Projects", "P-001.md"),
    pointer.replace("../../Projects/fixture%20room/MEMORY.md", "../../escape.md"),
  );
  const symlinkEscape = run(wikiTool, ["check"], 1);
  assert.match(symlinkEscape.stderr, /link resolves outside instance root/i);

  writeFileSync(join(root, "Wiki", "Projects", "P-001.md"), pointer.replace("../../Projects/fixture%20room/MEMORY.md", "missing.md"));
  const broken = run(wikiTool, ["check"], 1);
  assert.match(broken.stderr, /unresolved memory link/i);

  const escapedProject = join(escapedRoot, "Projects", "fixture");
  const outsideWiki = join(outside, "wiki-root");
  mkdirSync(escapedProject, { recursive: true });
  mkdirSync(outsideWiki, { recursive: true });
  writeFileSync(join(escapedProject, "AGENTS.md"), "# Fixture ownership\n");
  writeFileSync(join(outsideWiki, ".sentinel"), "untouched\n");
  runAt(projectsTool, ["init"], escapedRoot);
  runAt(projectsTool, [
    "enroll",
    "--id", "P-001",
    "--name", "Escaped Wiki",
    "--owner", "fixture-owner",
    "--project", "Projects/fixture",
  ], escapedRoot);
  symlinkSync(outsideWiki, join(escapedRoot, "Wiki"), "dir");
  const escapedWiki = runAt(wikiTool, ["init"], escapedRoot, 1);
  assert.match(escapedWiki.stderr, /Wiki root must not resolve outside/i);
  assert.equal(readFileSync(join(outsideWiki, ".sentinel"), "utf8"), "untouched\n");
  assert.equal(existsSync(join(outsideWiki, "MEMORY.md")), false);
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
  rmSync(escapedRoot, { recursive: true, force: true });
}

console.log("ok - generic Wiki/index capability passed");
