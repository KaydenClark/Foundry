#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildFoundryArtifact,
  createPublishPlan,
  loadArtifactManifest,
  publishFoundryArtifact,
  trustedGitHubCredentialConfig,
  verifyStagedArtifact,
} from "./foundry-publisher.mjs";

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function write(root, relativePath, content) {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

function fixtureContract() {
  return {
    schemaVersion: "1.0",
    producerRoot: "Foundry",
    productPathMode: "strip-producer-root",
    includeRules: [
      {
        category: "fixture",
        files: [
          "Foundry/source-root.json",
          "Foundry/README.md",
          "Foundry/tools/verify.mjs",
        ],
      },
    ],
    prohibitedPrefixes: [
      { path: "Foundry/Modules/", reason: "installed-modules" },
      { path: "Foundry/Skills/", reason: "generated-skills" },
    ],
    runtimeSegments: [".git", ".local", "node_modules", "runtime", "state"],
    allowedBasenames: [".env.example"],
    secretBasenames: [".env"],
    secretNamePrefixes: [".env."],
    prohibitedSuffixes: [".pem", ".key", ".db"],
  };
}

function makeProducer(root) {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.name", "Foundry Publisher Test"]);
  git(root, ["config", "user.email", "foundry-publisher@example.invalid"]);
  write(root, "Foundry/source-root.json", `${JSON.stringify(fixtureContract(), null, 2)}\n`);
  write(root, "Foundry/README.md", "# Portable Foundry fixture\n");
  write(root, "Foundry/tools/verify.mjs", 'console.log("ok - staged fixture verified");\n');
  git(root, ["add", "Foundry"]);
  git(root, ["commit", "-qm", "fixture producer"]);
  return git(root, ["rev-parse", "HEAD"]);
}

const scratch = mkdtempSync(join(tmpdir(), "foundry-publisher-test-"));
try {
  assert.deepEqual(trustedGitHubCredentialConfig(), [
    "-c",
    "credential.helper=",
    "-c",
    "credential.helper=!/opt/homebrew/bin/gh auth git-credential",
  ]);
  const producer = join(scratch, "producer");
  mkdirSync(producer);
  const producerSha = makeProducer(producer);
  const verifyCommands = [["node", "tools/verify.mjs"]];

  const firstRoot = join(scratch, "artifact-one");
  const first = buildFoundryArtifact({
    repoRoot: producer,
    ref: producerSha,
    outputRoot: firstRoot,
    verifyCommands,
  });
  assert.equal(first.producerSha, producerSha);
  assert.equal(first.fileCount, 3);
  assert.ok(existsSync(join(firstRoot, "product", "README.md")));
  assert.ok(existsSync(join(firstRoot, "artifact-manifest.json")));
  assert.deepEqual(loadArtifactManifest(firstRoot), first);
  assert.doesNotThrow(() =>
    verifyStagedArtifact({ repoRoot: producer, artifactRoot: firstRoot }),
  );

  const secondRoot = join(scratch, "artifact-two");
  const second = buildFoundryArtifact({
    repoRoot: producer,
    ref: producerSha,
    outputRoot: secondRoot,
    verifyCommands,
  });
  assert.deepEqual(second, first, "the same producer SHA yields the same manifest");
  assert.equal(
    readFileSync(join(secondRoot, "artifact-manifest.json"), "utf8"),
    readFileSync(join(firstRoot, "artifact-manifest.json"), "utf8"),
    "the manifest bytes are deterministic",
  );

  write(firstRoot, "product/README.md", "tampered after staging\n");
  assert.throws(
    () => verifyStagedArtifact({ repoRoot: producer, artifactRoot: firstRoot }),
    /byte mismatch/,
  );

  write(producer, "Foundry/Modules/Private/README.md", "must not publish\n");
  git(producer, ["add", "-f", "Foundry/Modules/Private/README.md"]);
  git(producer, ["commit", "-qm", "plant prohibited file"]);
  const prohibitedSha = git(producer, ["rev-parse", "HEAD"]);
  const prohibitedOutput = join(scratch, "prohibited-output");
  assert.throws(
    () =>
      buildFoundryArtifact({
        repoRoot: producer,
        ref: prohibitedSha,
        outputRoot: prohibitedOutput,
        verifyCommands: [],
      }),
    /installed-modules/,
  );
  assert.equal(existsSync(prohibitedOutput), false, "failed staging leaves no artifact");

  rmSync(join(producer, "Foundry", "Modules"), { recursive: true, force: true });
  git(producer, ["add", "-A"]);
  const plantedHostPath = ["", "Users", "example", "private producer path"].join("/");
  write(producer, "Foundry/README.md", `${plantedHostPath}\n`);
  git(producer, ["add", "Foundry/README.md"]);
  git(producer, ["commit", "-qm", "plant host path"]);
  const hostPathSha = git(producer, ["rev-parse", "HEAD"]);
  assert.throws(
    () =>
      buildFoundryArtifact({
        repoRoot: producer,
        ref: hostPathSha,
        outputRoot: join(scratch, "host-path-output"),
        verifyCommands: [],
      }),
    /host-specific absolute path/,
  );

  const manifest = loadArtifactManifest(secondRoot);
  const approval = {
    schemaVersion: "1.0",
    artifact: "foundry-assay-approval",
    reviewer: "Foundry/Halls/Assay",
    verdict: "pass",
    producerSha: manifest.producerSha,
    treeDigest: manifest.treeDigest,
    checks: ["manifest-integrity", "immutable-source-bytes", "confidentiality-boundary"],
  };
  assert.deepEqual(createPublishPlan({ manifest, approval, targetBranch: "integration" }), {
    producerSha,
    treeDigest: manifest.treeDigest,
    targetBranch: "integration",
    refspec: "HEAD:integration",
  });
  assert.throws(
    () => createPublishPlan({ manifest, approval, targetBranch: "main" }),
    /integration/,
  );
  assert.throws(
    () => createPublishPlan({ manifest, approval: { ...approval, treeDigest: "0".repeat(64) }, targetBranch: "integration" }),
    /approval does not match/,
  );
  assert.throws(
    () => createPublishPlan({
      manifest,
      approval: { schemaVersion: "1.0", verdict: "pass", producerSha, treeDigest: manifest.treeDigest },
      targetBranch: "integration",
    }),
    /approval does not match/,
  );

  const productRemote = join(scratch, "product.git");
  mkdirSync(productRemote);
  git(productRemote, ["init", "--bare", "-q"]);
  const seed = join(scratch, "seed");
  mkdirSync(seed);
  git(seed, ["init", "-q", "--initial-branch", "integration"]);
  git(seed, ["config", "user.name", "Foundry Publisher Test"]);
  git(seed, ["config", "user.email", "foundry-publisher@example.invalid"]);
  write(seed, "legacy.txt", "legacy product tree\n");
  git(seed, ["add", "."]);
  git(seed, ["commit", "-qm", "legacy product"]);
  git(seed, ["remote", "add", "origin", productRemote]);
  git(seed, ["push", "-q", "origin", "HEAD:integration"]);
  const productRepo = join(scratch, "product-checkout");
  git(scratch, ["clone", "-q", "--branch", "integration", productRemote, productRepo]);

  assert.throws(
    () =>
      publishFoundryArtifact({
        repoRoot: producer,
        artifactRoot: secondRoot,
        productRepo,
        approval,
        targetBranch: "integration",
        expectedRemote: productRemote,
        githubAuthViaGh: true,
        push: true,
      }),
    /GitHub HTTPS remote/,
  );
  assert.ok(existsSync(join(productRepo, "legacy.txt")), "GitHub auth mode rejects local remotes before mutation");

  const productBeforeWrongRemote = git(productRemote, ["rev-parse", "integration"]);
  assert.throws(
    () =>
      publishFoundryArtifact({
        repoRoot: producer,
        artifactRoot: secondRoot,
        productRepo,
        approval,
        targetBranch: "integration",
        expectedRemote: join(scratch, "wrong-product.git"),
        push: true,
      }),
    /does not match expected remote/,
  );
  assert.equal(git(productRemote, ["rev-parse", "integration"]), productBeforeWrongRemote);
  assert.ok(existsSync(join(productRepo, "legacy.txt")), "remote mismatch fails before product-tree mutation");

  const publication = publishFoundryArtifact({
    repoRoot: producer,
    artifactRoot: secondRoot,
    productRepo,
    approval,
    targetBranch: "integration",
    expectedRemote: productRemote,
    push: true,
  });
  assert.equal(publication.pushed, true);
  assert.equal(publication.refspec, "HEAD:integration");
  assert.deepEqual(
    git(productRemote, ["ls-tree", "-r", "--name-only", "integration"]).split("\n"),
    manifest.files.map(({ path }) => path),
    "publication replaces the product tree exactly",
  );
  assert.equal(git(productRemote, ["show", "integration:README.md"]), "# Portable Foundry fixture");

  const unchangedPublication = publishFoundryArtifact({
    repoRoot: producer,
    artifactRoot: secondRoot,
    productRepo,
    approval,
    targetBranch: "integration",
    expectedRemote: productRemote,
    push: true,
  });
  assert.equal(unchangedPublication.pushed, true, "an unchanged artifact still confirms the explicit remote refspec");
  assert.equal(unchangedPublication.commit, publication.commit);

  const remoteBeforeContamination = git(productRemote, ["rev-parse", "integration"]);
  git(productRepo, ["config", "filter.hostile.clean", "node hostile-filter.mjs"]);
  assert.throws(
    () =>
      publishFoundryArtifact({
        repoRoot: producer,
        artifactRoot: secondRoot,
        productRepo,
        approval,
        targetBranch: "integration",
        expectedRemote: productRemote,
        push: true,
      }),
    /execution-capable Git filter/,
  );
  assert.equal(git(productRemote, ["rev-parse", "integration"]), remoteBeforeContamination);
  git(productRepo, ["config", "--unset", "filter.hostile.clean"]);

  assert.throws(
    () =>
      publishFoundryArtifact({
        repoRoot: producer,
        artifactRoot: firstRoot,
        productRepo,
        approval,
        targetBranch: "integration",
        expectedRemote: productRemote,
        push: true,
      }),
    /byte mismatch/,
  );
  assert.equal(
    git(productRemote, ["rev-parse", "integration"]),
    remoteBeforeContamination,
    "contamination fails before remote mutation",
  );

  console.log("ok - whole-Foundry archive, staging, verification, and publish-plan contracts passed");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
