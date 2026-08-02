import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { reviewFoundryArtifact } from "../src/foundry-artifact.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function write(root, path, content) {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function makeFixture(root) {
  const producer = join(root, "producer");
  const artifact = join(root, "artifact");
  mkdirSync(producer);
  git(producer, ["init", "-q"]);
  git(producer, ["config", "user.name", "Assay Test"]);
  git(producer, ["config", "user.email", "assay@example.invalid"]);
  const content = Buffer.from("# Portable Foundry\n");
  write(producer, "Foundry/README.md", content);
  git(producer, ["add", "."]);
  git(producer, ["commit", "-qm", "fixture"]);
  const producerSha = git(producer, ["rev-parse", "HEAD"]);
  write(artifact, "product/README.md", content);
  const files = [{ path: "README.md", mode: "100644", size: content.length, sha256: digest(content) }];
  const treeDigest = digest(`100644 ${files[0].sha256} ${content.length} README.md\n`);
  write(artifact, "artifact-manifest.json", `${JSON.stringify({
    schemaVersion: "1.0",
    artifact: "foundry-clean-product",
    producerSha,
    contractPath: "Foundry/source-root.json",
    fileCount: 1,
    treeDigest,
    files,
    verification: [{ argv: ["node", "tools/test-foundry.mjs"] }],
  }, null, 2)}\n`);
  return { artifact, producer, producerSha, treeDigest };
}

test("independently approves exact immutable artifact bytes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "foundry-assay-test-"));
  try {
    const fixture = makeFixture(scratch);
    const approvalPath = join(scratch, "approval.json");
    const statusBefore = git(fixture.producer, ["status", "--porcelain"]);
    const approval = reviewFoundryArtifact({ ...fixture, artifactRoot: fixture.artifact, producerRepo: fixture.producer, approvalPath });
    assert.deepEqual(approval, {
      schemaVersion: "1.0",
      artifact: "foundry-assay-approval",
      reviewer: "Foundry/Halls/Assay",
      verdict: "pass",
      producerSha: fixture.producerSha,
      treeDigest: fixture.treeDigest,
      checks: [
        "manifest-integrity",
        "immutable-source-bytes",
        "confidentiality-boundary",
      ],
    });
    assert.deepEqual(JSON.parse(readFileSync(approvalPath, "utf8")), approval);
    assert.equal(git(fixture.producer, ["status", "--porcelain"]), statusBefore);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("tampering, private paths, and symlinks fail without approval", () => {
  for (const mutate of [
    ({ artifact }) => write(artifact, "product/README.md", "tampered\n"),
    ({ artifact }) => write(artifact, "product/Wiki/Kayden/private.md", "private\n"),
    ({ artifact }) => symlinkSync("README.md", join(artifact, "product", "alias.md")),
  ]) {
    const scratch = mkdtempSync(join(tmpdir(), "foundry-assay-reject-"));
    try {
      const fixture = makeFixture(scratch);
      const approvalPath = join(scratch, "approval.json");
      mutate(fixture);
      assert.throws(
        () => reviewFoundryArtifact({ artifactRoot: fixture.artifact, producerRepo: fixture.producer, approvalPath }),
      );
      assert.equal(existsSync(approvalPath), false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});

test("artifact-root and approval-path symlink escapes fail closed", () => {
  const scratch = mkdtempSync(join(tmpdir(), "foundry-assay-symlink-"));
  try {
    const fixture = makeFixture(scratch);
    const externalProduct = join(scratch, "external-product");
    renameSync(join(fixture.artifact, "product"), externalProduct);
    symlinkSync(externalProduct, join(fixture.artifact, "product"));
    assert.throws(
      () => reviewFoundryArtifact({ artifactRoot: fixture.artifact, producerRepo: fixture.producer, approvalPath: join(scratch, "approval.json") }),
      /symbolic link/,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const outputScratch = mkdtempSync(join(tmpdir(), "foundry-assay-output-"));
  try {
    const fixture = makeFixture(outputScratch);
    const producerOutput = join(fixture.producer, "approvals");
    mkdirSync(producerOutput);
    const linkedOutput = join(outputScratch, "linked-output");
    symlinkSync(producerOutput, linkedOutput);
    assert.throws(
      () => reviewFoundryArtifact({ artifactRoot: fixture.artifact, producerRepo: fixture.producer, approvalPath: join(linkedOutput, "approval.json") }),
      /outside producer and artifact roots/,
    );
    assert.equal(existsSync(join(producerOutput, "approval.json")), false);
  } finally {
    rmSync(outputScratch, { recursive: true, force: true });
  }
});
