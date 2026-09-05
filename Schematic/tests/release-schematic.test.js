import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PRODUCTION_ENDPOINT,
  TEST_ENDPOINT,
  assertPublishedSource,
  releaseSchematic,
  validateReleaseConfig,
} from "../tools/release-schematic.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "schematic-release-"));
  const projectRoot = join(root, "source");
  const deploymentHome = join(root, "deployment");
  mkdirSync(join(projectRoot, "dist"), { recursive: true });
  mkdirSync(join(deploymentHome, "dist"), { recursive: true });
  writeFileSync(join(projectRoot, "dist", "index.html"), "<title>Foundry Schematic</title>new");
  writeFileSync(join(deploymentHome, "dist", "index.html"), "old");
  return { root, projectRoot, deploymentHome };
}

test("release config fixes endpoint roles and rejects unsafe deployment homes", () => {
  assert.equal(TEST_ENDPOINT, "http://127.0.0.1:5173/");
  assert.equal(PRODUCTION_ENDPOINT, "http://foundry.example:5173/");

  const { root, projectRoot, deploymentHome } = fixture();
  try {
    assert.deepEqual(
      validateReleaseConfig({ schemaVersion: 1, deploymentHome }, { projectRoot }),
      { schemaVersion: 1, deploymentHome, productionUrl: PRODUCTION_ENDPOINT },
    );
    assert.throws(
      () => validateReleaseConfig({ schemaVersion: 1, deploymentHome, productionUrl: TEST_ENDPOINT }, { projectRoot }),
      /test endpoint/i,
    );
    assert.throws(
      () => validateReleaseConfig({ schemaVersion: 1, deploymentHome: join(projectRoot, "live") }, { projectRoot }),
      /overlap the source worktree/i,
    );
    assert.throws(
      () => validateReleaseConfig({ schemaVersion: 1, deploymentHome: root }, { projectRoot }),
      /overlap the source worktree/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release source guard refuses dirty or unpushed commits", () => {
  const git = (responses) => (args) => responses.get(args.join(" "));
  const cleanRemote = new Map([
    ["status --porcelain --untracked-files=all", ""],
    ["branch --show-current", "codex/release"],
    ["rev-parse HEAD", "a".repeat(40)],
    ["ls-remote --heads origin refs/heads/codex/release", `${"a".repeat(40)}\trefs/heads/codex/release`],
  ]);
  assert.doesNotThrow(() => assertPublishedSource("/source", { gitCommand: git(cleanRemote) }));

  const dirty = new Map(cleanRemote);
  dirty.set("status --porcelain --untracked-files=all", " M src/App.jsx");
  assert.throws(() => assertPublishedSource("/source", { gitCommand: git(dirty) }), /dirty/i);

  const unpushed = new Map(cleanRemote);
  unpushed.set("ls-remote --heads origin refs/heads/codex/release", `${"b".repeat(40)}\trefs/heads/codex/release`);
  assert.throws(() => assertPublishedSource("/source", { gitCommand: git(unpushed) }), /not pushed/i);
});

test("release verifies source, replaces only dist, and probes the production document", async () => {
    const { root, projectRoot, deploymentHome } = fixture();
  try {
    const calls = [];
    const config = validateReleaseConfig({ schemaVersion: 1, deploymentHome }, { projectRoot });
    const result = await releaseSchematic({
      projectRoot,
      config,
      assertSourceReady: () => calls.push(["source", ["clean"]]),
      runCommand: (command, args) => calls.push([command, args]),
      probeProduction: async (url) => ({ status: 200, body: "<title>Foundry Schematic</title>", url }),
    });

    assert.deepEqual(calls, [
      ["source", ["clean"]],
      ["npm", ["test"]],
      ["npm", ["run", "test:quality"]],
      ["npm", ["run", "test:safety"]],
      ["npm", ["run", "build"]],
    ]);
    assert.equal(result.productionUrl, PRODUCTION_ENDPOINT);
    assert.equal(readFileSync(join(deploymentHome, "dist", "index.html"), "utf8"), "<title>Foundry Schematic</title>new");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failed production probe restores the prior live artifact", async () => {
  const { root, projectRoot, deploymentHome } = fixture();
  try {
    await assert.rejects(
      releaseSchematic({
        projectRoot,
        config: { schemaVersion: 1, deploymentHome },
        assertSourceReady: () => {},
        runCommand: () => {},
        probeProduction: async () => ({ status: 503, body: "unavailable" }),
      }),
      /returned HTTP 503/,
    );
    assert.equal(readFileSync(join(deploymentHome, "dist", "index.html"), "utf8"), "old");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
