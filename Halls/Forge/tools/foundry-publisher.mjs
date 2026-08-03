#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_CONTRACT_REPO_PATH,
  DEFAULT_REPO_ROOT,
  inventoryRef,
} from "./foundry-source-root.mjs";

export const DEFAULT_VERIFY_COMMANDS = [
  ["node", "tools/test-foundry.mjs"],
  ["node", "tools/test-captain.mjs"],
  ["node", "tools/test-spec-workbench.mjs"],
  ["node", "tools/foundry.mjs", "validate-manifest"],
  ["node", "tools/foundry.mjs", "doctor", "--harness-only"],
  ["node", "tools/spec-workbench.mjs", "doctor"],
  ["node", "Halls/Forge/tools/test-foundry-publisher.mjs"],
];

const MANIFEST_FILE = "artifact-manifest.json";
const PRODUCT_DIRECTORY = "product";
const TRUSTED_GH = "/opt/homebrew/bin/gh";
const SAFE_MODES = new Set(["100644", "100755"]);
const SAFE_GIT_OPTIONS = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  `core.hooksPath=${devNull}`,
  "-c",
  "protocol.ext.allow=never",
];

function safeEnvironment({ includeHome = false } = {}) {
  const environment = {};
  for (const name of ["PATH", "TMPDIR", "TMP", "TEMP", "SystemRoot", "SYSTEMROOT", "WINDIR"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  if (includeHome && process.env.HOME) environment.HOME = process.env.HOME;
  return {
    ...environment,
    GIT_ALLOW_PROTOCOL: "file:https",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
  };
}

function run(command, args, { cwd, encoding = "utf8", maxBuffer = 256 * 1024 * 1024, env = safeEnvironment() } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    maxBuffer,
    env,
  });
  if (result.error) throw new Error(`${command} failed: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = encoding ? result.stderr : result.stderr?.toString("utf8");
    const stdout = encoding ? result.stdout : result.stdout?.toString("utf8");
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${(stderr || stdout || "no diagnostic").trim()}`);
  }
  return result.stdout;
}

function gitText(repoRoot, args) {
  return run("git", ["-C", repoRoot, ...SAFE_GIT_OPTIONS, ...args]);
}

function gitBuffer(repoRoot, args) {
  return run("git", ["-C", repoRoot, ...SAFE_GIT_OPTIONS, ...args], { encoding: null });
}

export function trustedGitHubCredentialConfig() {
  return [
    "-c",
    "credential.helper=",
    "-c",
    `credential.helper=!${TRUSTED_GH} auth git-credential`,
  ];
}

function gitTextWithGitHubAuth(repoRoot, args) {
  if (!existsSync(TRUSTED_GH)) throw new Error(`trusted GitHub CLI is unavailable at ${TRUSTED_GH}`);
  return run("git", [
    "-C",
    repoRoot,
    ...SAFE_GIT_OPTIONS,
    ...trustedGitHubCredentialConfig(),
    ...args,
  ], { env: safeEnvironment({ includeHome: true }) });
}

function gitOptionalText(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...SAFE_GIT_OPTIONS, ...args], {
    encoding: "utf8",
    env: safeEnvironment(),
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`git failed: ${result.error.message}`);
  if (result.status === 1) return null;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${result.status}): ${(result.stderr || result.stdout || "no diagnostic").trim()}`);
  }
  return result.stdout.trim();
}

function rejectExecutionCapableGitConfig(productRepo) {
  const pattern = "^filter\\..*\\.(clean|smudge|process)$";
  const configured = [];
  const local = gitOptionalText(productRepo, ["config", "--local", "--name-only", "--get-regexp", pattern]);
  if (local) configured.push(...local.split("\n").filter(Boolean));
  const worktreeEnabled = gitOptionalText(productRepo, [
    "config",
    "--local",
    "--bool",
    "--get",
    "extensions.worktreeConfig",
  ]) === "true";
  if (worktreeEnabled) {
    const worktree = gitOptionalText(productRepo, ["config", "--worktree", "--name-only", "--get-regexp", pattern]);
    if (worktree) configured.push(...worktree.split("\n").filter(Boolean));
  }
  if (configured.length) {
    throw new Error(`product checkout has execution-capable Git filter configuration: ${[...new Set(configured)].join(", ")}`);
  }
}

function normalizeProductRemote(value) {
  if (isAbsolute(value)) return `local:${existsSync(value) ? realpathSync(value) : resolve(value)}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("product remote must be an absolute local path or credential-free GitHub HTTPS URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.hostname.toLowerCase() !== "github.com"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsed.pathname)
  ) {
    throw new Error("product remote must be an absolute local path or credential-free GitHub HTTPS URL");
  }
  return `github:${parsed.pathname.replace(/\.git$/i, "").toLowerCase()}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeProductPath(value) {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value)) return false;
  if (value.includes("\\") || isAbsolute(value) || win32.isAbsolute(value)) return false;
  const segments = value.split("/");
  return !segments.some((segment) => !segment || segment === "." || segment === "..")
    && posix.normalize(value) === value;
}

function parseTree(repoRoot, producerSha, producerRoot) {
  const raw = gitBuffer(repoRoot, ["ls-tree", "-r", "-z", producerSha, "--", producerRoot]);
  const entries = new Map();
  for (const record of raw.toString("utf8").split("\0").filter(Boolean)) {
    const match = /^(\d+)\s+(\S+)\s+([0-9a-f]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error("cannot parse immutable producer tree entry");
    const [, mode, type, objectId, sourcePath] = match;
    if (!SAFE_MODES.has(mode) || type !== "blob") {
      throw new Error(`${sourcePath}: only regular 100644/100755 product files are allowed`);
    }
    entries.set(sourcePath, { mode, objectId, sourcePath });
  }
  return entries;
}

function walkProduct(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const info = lstatSync(absolute);
      const productPath = relative(root, absolute).split(sep).join("/");
      if (!safeProductPath(productPath)) throw new Error(`${productPath}: unsafe staged path`);
      if (info.isSymbolicLink()) throw new Error(`${productPath}: symbolic links are forbidden`);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) files.push(productPath);
      else throw new Error(`${productPath}: only regular files are allowed`);
    }
  }
  visit(root);
  return files.sort();
}

function confidentialityText(content) {
  const jpeg = content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const png = content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!jpeg && !png) return content.toString("utf8");
  const runs = [];
  let current = "";
  for (const byte of content) {
    if (byte >= 0x20 && byte <= 0x7e) current += String.fromCharCode(byte);
    else {
      if (current.length >= 8) runs.push(current);
      current = "";
    }
  }
  if (current.length >= 8) runs.push(current);
  return runs.join("\n");
}

function scanProductFile(productPath, content) {
  const text = confidentialityText(content);
  const checks = [
    [/\/Users\/[^/\s]+\//, "host-specific absolute path"],
    [/\b[A-Za-z]:\\(?!\/)[^\s"']+/, "host-specific absolute path"],
    [new RegExp(["g", "h", "p", "_"].join("")), "credential-shaped value"],
    [new RegExp(["github", "pat", "_"].join("_")), "credential-shaped value"],
    [new RegExp(`\\b${["s", "k", "-"].join("")}[A-Za-z0-9]`), "credential-shaped value"],
    [/hooks\.slack\.com\/services\//, "credential-shaped value"],
    [/AKIA[0-9A-Z]{16}/, "credential-shaped value"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private-key material"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) throw new Error(`${productPath}: ${label}`);
  }
}

function comparePathSets(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    const missing = expected.filter((entry) => !actual.includes(entry));
    const extra = actual.filter((entry) => !expected.includes(entry));
    throw new Error(`${label} differs from source inventory; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`);
  }
}

function inspectStagedProduct({ repoRoot, producerSha, inventory, productRoot }) {
  const expectedSourcePaths = inventory.entries.map(({ sourcePath }) => sourcePath).sort();
  const includedPaths = new Set(expectedSourcePaths);
  const tree = new Map(
    [...parseTree(repoRoot, producerSha, inventory.producerRoot)]
      .filter(([sourcePath]) => includedPaths.has(sourcePath)),
  );
  comparePathSets([...tree.keys()].sort(), expectedSourcePaths, "immutable archive tree");
  for (const productPath of inventory.productPaths) {
    if (!safeProductPath(productPath)) throw new Error(`${productPath}: unsafe product path`);
  }

  const stagedPaths = walkProduct(productRoot);
  comparePathSets(stagedPaths, inventory.productPaths, "staged product tree");

  const files = [];
  for (const productPath of stagedPaths) {
    const sourcePath = `${inventory.producerRoot}/${productPath}`;
    const immutable = gitBuffer(repoRoot, ["show", `${producerSha}:${sourcePath}`]);
    const staged = readFileSync(join(productRoot, productPath));
    if (!staged.equals(immutable)) throw new Error(`${productPath}: byte mismatch against immutable producer`);
    scanProductFile(productPath, staged);
    const mode = tree.get(sourcePath).mode;
    const stagedMode = lstatSync(join(productRoot, productPath)).mode & 0o111 ? "100755" : "100644";
    if (stagedMode !== mode) throw new Error(`${productPath}: mode mismatch against immutable producer`);
    files.push({ path: productPath, mode, size: staged.length, sha256: sha256(staged) });
  }
  const treeDigest = sha256(files.map((file) => `${file.mode} ${file.sha256} ${file.size} ${file.path}\n`).join(""));
  return { files, treeDigest };
}

function validateVerifyCommands(commands) {
  if (!Array.isArray(commands)) throw new Error("verifyCommands must be an array");
  for (const [index, argv] of commands.entries()) {
    if (!Array.isArray(argv) || argv.length === 0 || argv.some((value) => typeof value !== "string" || !value)) {
      throw new Error(`verifyCommands[${index}] must be a non-empty argv array`);
    }
    if (["sh", "bash", "zsh", "cmd", "powershell", "pwsh"].includes(argv[0])) {
      throw new Error(`verifyCommands[${index}] must not invoke a shell`);
    }
  }
}

function artifactManifest({ inventory, files, treeDigest, verifyCommands }) {
  return {
    schemaVersion: "1.0",
    artifact: "foundry-clean-product",
    producerSha: inventory.producerSha,
    contractPath: inventory.contractPath,
    fileCount: files.length,
    treeDigest,
    files,
    verification: verifyCommands.map((argv) => ({ argv })),
  };
}

export function buildFoundryArtifact({
  repoRoot = DEFAULT_REPO_ROOT,
  ref,
  outputRoot,
  verifyCommands = DEFAULT_VERIFY_COMMANDS,
} = {}) {
  if (!ref) throw new Error("an explicit producer ref is required");
  if (!outputRoot) throw new Error("an explicit outputRoot is required");
  repoRoot = resolve(repoRoot);
  outputRoot = resolve(outputRoot);
  if (existsSync(outputRoot)) throw new Error(`artifact output already exists: ${outputRoot}`);
  validateVerifyCommands(verifyCommands);

  const inventory = inventoryRef({ repoRoot, ref });
  if (inventory.errors.length) throw new Error(`source-root validation failed:\n- ${inventory.errors.join("\n- ")}`);
  mkdirSync(dirname(outputRoot), { recursive: true });
  const temporaryRoot = mkdtempSync(join(dirname(outputRoot), ".foundry-artifact-"));
  try {
    const productRoot = join(temporaryRoot, PRODUCT_DIRECTORY);
    mkdirSync(productRoot);
    const archivePath = join(temporaryRoot, "producer.tar");
    const archive = gitBuffer(repoRoot, [
      "archive",
      "--format=tar",
      inventory.producerSha,
      "--",
      ...inventory.entries.map((entry) => entry.sourcePath),
    ]);
    writeFileSync(archivePath, archive);
    run("tar", ["-xf", archivePath, "-C", productRoot, "--strip-components=1"]);
    rmSync(archivePath);

    const inspected = inspectStagedProduct({
      repoRoot,
      producerSha: inventory.producerSha,
      inventory,
      productRoot,
    });
    for (const [command, ...args] of verifyCommands) run(command, args, { cwd: productRoot });
    const manifest = artifactManifest({ inventory, ...inspected, verifyCommands });
    writeFileSync(join(temporaryRoot, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    renameSync(temporaryRoot, outputRoot);
    return manifest;
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

function validateArtifactManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("artifact manifest must be an object");
  }
  const exact = ["artifact", "contractPath", "fileCount", "files", "producerSha", "schemaVersion", "treeDigest", "verification"];
  const keys = Object.keys(manifest).sort();
  if (keys.length !== exact.length || keys.some((key, index) => key !== exact[index])) {
    throw new Error("artifact manifest has unexpected fields");
  }
  if (manifest.schemaVersion !== "1.0" || manifest.artifact !== "foundry-clean-product") {
    throw new Error("artifact manifest identity is invalid");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.producerSha) || !/^[0-9a-f]{64}$/.test(manifest.treeDigest)) {
    throw new Error("artifact manifest digests are invalid");
  }
  if (!Number.isSafeInteger(manifest.fileCount) || manifest.fileCount < 1 || !Array.isArray(manifest.files)) {
    throw new Error("artifact manifest file list is invalid");
  }
  if (manifest.fileCount !== manifest.files.length) throw new Error("artifact manifest fileCount does not match files");
  validateVerifyCommands(manifest.verification?.map((entry) => entry?.argv));
  return manifest;
}

export function loadArtifactManifest(artifactRoot) {
  return validateArtifactManifest(JSON.parse(readFileSync(join(resolve(artifactRoot), MANIFEST_FILE), "utf8")));
}

export function verifyStagedArtifact({ repoRoot = DEFAULT_REPO_ROOT, artifactRoot } = {}) {
  if (!artifactRoot) throw new Error("artifactRoot is required");
  repoRoot = resolve(repoRoot);
  artifactRoot = resolve(artifactRoot);
  const manifest = loadArtifactManifest(artifactRoot);
  const inventory = inventoryRef({
    repoRoot,
    ref: manifest.producerSha,
    contractRepoPath: manifest.contractPath ?? DEFAULT_CONTRACT_REPO_PATH,
  });
  if (inventory.errors.length) throw new Error(`source-root validation failed:\n- ${inventory.errors.join("\n- ")}`);
  const inspected = inspectStagedProduct({
    repoRoot,
    producerSha: manifest.producerSha,
    inventory,
    productRoot: join(artifactRoot, PRODUCT_DIRECTORY),
  });
  if (inspected.treeDigest !== manifest.treeDigest) throw new Error("artifact treeDigest does not match staged bytes");
  if (JSON.stringify(inspected.files) !== JSON.stringify(manifest.files)) {
    throw new Error("artifact file manifest does not match staged bytes");
  }
  return manifest;
}

export function createPublishPlan({ manifest, approval, targetBranch } = {}) {
  validateArtifactManifest(manifest);
  if (targetBranch !== "integration") throw new Error("Foundry publication may target integration only");
  const approvalKeys = approval && typeof approval === "object" && !Array.isArray(approval)
    ? Object.keys(approval).sort()
    : [];
  const expectedApprovalKeys = ["artifact", "checks", "producerSha", "reviewer", "schemaVersion", "treeDigest", "verdict"];
  const expectedChecks = ["manifest-integrity", "immutable-source-bytes", "confidentiality-boundary"];
  if (
    approvalKeys.length !== expectedApprovalKeys.length
    || approvalKeys.some((key, index) => key !== expectedApprovalKeys[index])
    || approval.schemaVersion !== "1.0"
    || approval.artifact !== "foundry-assay-approval"
    || approval.reviewer !== "Foundry/Halls/Assay"
    || approval.verdict !== "pass"
    || approval.producerSha !== manifest.producerSha
    || approval.treeDigest !== manifest.treeDigest
    || !Array.isArray(approval.checks)
    || approval.checks.length !== expectedChecks.length
    || approval.checks.some((check, index) => check !== expectedChecks[index])
  ) {
    throw new Error("approval does not match the immutable Foundry artifact");
  }
  return {
    producerSha: manifest.producerSha,
    treeDigest: manifest.treeDigest,
    targetBranch,
    refspec: "HEAD:integration",
  };
}

export function publishFoundryArtifact({
  repoRoot = DEFAULT_REPO_ROOT,
  artifactRoot,
  productRepo,
  approval,
  targetBranch,
  remote = "origin",
  expectedRemote,
  githubAuthViaGh = false,
  push = false,
} = {}) {
  if (!productRepo) throw new Error("productRepo is required");
  if (!expectedRemote) throw new Error("expectedRemote is required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) throw new Error("remote name is unsafe");
  const manifest = verifyStagedArtifact({ repoRoot, artifactRoot });
  const plan = createPublishPlan({ manifest, approval, targetBranch });

  productRepo = realpathSync(resolve(productRepo));
  const repositoryRoot = realpathSync(gitText(productRepo, ["rev-parse", "--show-toplevel"]).trim());
  if (repositoryRoot !== productRepo) throw new Error("productRepo must be the repository root");
  rejectExecutionCapableGitConfig(productRepo);
  const branch = gitText(productRepo, ["branch", "--show-current"]).trim();
  if (branch !== targetBranch) throw new Error(`product checkout must be on ${targetBranch}, got ${branch || "detached"}`);
  const dirty = gitText(productRepo, ["status", "--porcelain", "--untracked-files=all"]).trim();
  if (dirty) throw new Error("product checkout must be clean before publication");
  const actualRemote = gitText(productRepo, ["remote", "get-url", remote]).trim();
  const actualIdentity = normalizeProductRemote(actualRemote);
  if (actualIdentity !== normalizeProductRemote(expectedRemote)) {
    throw new Error("product checkout remote does not match expected remote");
  }
  if (githubAuthViaGh && !actualIdentity.startsWith("github:")) {
    throw new Error("GitHub CLI authentication is available only for a GitHub HTTPS remote");
  }
  const pushRef = () => (githubAuthViaGh
    ? gitTextWithGitHubAuth(productRepo, ["push", remote, plan.refspec])
    : gitText(productRepo, ["push", remote, plan.refspec]));

  for (const name of readdirSync(productRepo)) {
    if (name === ".git") continue;
    rmSync(join(productRepo, name), { recursive: true, force: true });
  }
  const productRoot = join(resolve(artifactRoot), PRODUCT_DIRECTORY);
  for (const file of manifest.files) {
    const source = join(productRoot, file.path);
    const destination = join(productRepo, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    chmodSync(destination, file.mode === "100755" ? 0o755 : 0o644);
  }
  gitText(productRepo, ["add", "-A"]);
  const changed = gitText(productRepo, ["diff", "--cached", "--name-only"]).trim();
  if (!changed) {
    const commit = gitText(productRepo, ["rev-parse", "HEAD"]).trim();
    if (push) pushRef();
    return { ...plan, commit, pushed: push };
  }
  gitText(productRepo, [
    "-c",
    "user.name=Foundry Publisher",
    "-c",
    "user.email=foundry-publisher@users.noreply.github.com",
    "commit",
    "-m",
    `Publish Foundry from producer ${manifest.producerSha.slice(0, 12)}`,
  ]);
  const commit = gitText(productRepo, ["rev-parse", "HEAD"]).trim();
  if (push) pushRef();
  return { ...plan, commit, pushed: push };
}

const CLI_OPTIONS = new Map([
  ["dry-run", new Set(["repo", "ref", "output", "json"])],
  ["verify", new Set(["repo", "artifact"])],
  ["plan-publish", new Set(["artifact", "approval", "target", "json"])],
  ["publish", new Set(["repo", "artifact", "approval", "target", "product-repo", "remote", "expected-remote", "github-auth-via-gh", "push", "json"])],
]);

function parseCli(command, args) {
  const allowed = CLI_OPTIONS.get(command);
  if (!allowed) throw new Error("Usage: foundry-publisher.mjs dry-run|verify|plan-publish [options]");
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option?.startsWith("--")) throw new Error(`unexpected argument: ${option ?? "end of input"}`);
    const name = option.slice(2);
    if (!allowed.has(name)) throw new Error(`unexpected option: ${option}`);
    if (Object.hasOwn(values, name)) throw new Error(`duplicate option: ${option}`);
    if (name === "json" || name === "push" || name === "github-auth-via-gh") {
      values[name] = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    values[name] = value;
  }
  return values;
}

function cli(argv) {
  const [command, ...rest] = argv;
  const options = parseCli(command, rest);
  if (command === "dry-run") {
    if (!options.ref || !options.output) throw new Error("dry-run requires --ref and --output");
    const manifest = buildFoundryArtifact({
      repoRoot: options.repo ?? DEFAULT_REPO_ROOT,
      ref: options.ref,
      outputRoot: options.output,
    });
    console.log(options.json
      ? JSON.stringify(manifest, null, 2)
      : `ok - built Foundry artifact ${manifest.treeDigest} from ${manifest.producerSha}: ${manifest.fileCount} files at ${resolve(options.output)}`);
    return;
  }
  if (command === "verify") {
    if (!options.artifact) throw new Error("verify requires --artifact");
    const manifest = verifyStagedArtifact({
      repoRoot: options.repo ?? DEFAULT_REPO_ROOT,
      artifactRoot: options.artifact,
    });
    console.log(`ok - Foundry artifact ${manifest.treeDigest} matches ${manifest.producerSha}`);
    return;
  }
  if (!options.artifact || !options.approval || !options.target) {
    throw new Error(`${command} requires --artifact, --approval, and --target`);
  }
  const manifest = loadArtifactManifest(options.artifact);
  const approval = JSON.parse(readFileSync(resolve(options.approval), "utf8"));
  if (command === "publish") {
    if (!options["product-repo"] || !options["expected-remote"] || !options.push) {
      throw new Error("publish requires --product-repo, --expected-remote, and explicit --push");
    }
    const result = publishFoundryArtifact({
      repoRoot: options.repo ?? DEFAULT_REPO_ROOT,
      artifactRoot: options.artifact,
      productRepo: options["product-repo"],
      approval,
      targetBranch: options.target,
      remote: options.remote ?? "origin",
      expectedRemote: options["expected-remote"],
      githubAuthViaGh: options["github-auth-via-gh"] ?? false,
      push: true,
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : `ok - pushed ${result.commit} via ${result.refspec}`);
    return;
  }
  const plan = createPublishPlan({ manifest, approval, targetBranch: options.target });
  console.log(options.json ? JSON.stringify(plan, null, 2) : `ok - explicit refspec ${plan.refspec}`);
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(`error - ${error.message}`);
    process.exitCode = 1;
  }
}
