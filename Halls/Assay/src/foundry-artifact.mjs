import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { devNull } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";

const MANIFEST_KEYS = ["artifact", "contractPath", "fileCount", "files", "producerSha", "schemaVersion", "treeDigest", "verification"];
const FILE_KEYS = ["mode", "path", "sha256", "size"];
const SAFE_MODES = new Set(["100644", "100755"]);
const PROHIBITED_PREFIXES = ["Modules/", "Skills/", "Wiki/Kayden/", "Wiki/Archive/", "Projects/checkouts/"];
const PROHIBITED_SEGMENTS = new Set([
  ".git", ".local", ".worktrees", "__pycache__", "build", "coverage", "credentials",
  "dist", "logs", "node_modules", "out", "private", "runtime", "secrets", "state",
]);
const PROHIBITED_SUFFIXES = [".db", ".key", ".log", ".pem", ".pyc", ".sqlite", ".sqlite3"];

function safeEnvironment() {
  const environment = {};
  for (const name of ["PATH", "TMPDIR", "TMP", "TEMP", "SystemRoot", "SYSTEMROOT", "WINDIR"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return {
    ...environment,
    GIT_ALLOW_PROTOCOL: "file:https",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
  };
}

function git(repo, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", repo, "-c", "core.fsmonitor=false", "-c", `core.hooksPath=${devNull}`, ...args], {
    encoding,
    env: safeEnvironment(),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Error(`git failed: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostic = encoding ? result.stderr || result.stdout : result.stderr?.toString("utf8");
    throw new Error(`git ${args.join(" ")} failed: ${(diagnostic || "no diagnostic").trim()}`);
  }
  return result.stdout;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function safePath(value) {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value)) return false;
  if (value.includes("\\") || isAbsolute(value) || win32.isAbsolute(value) || posix.normalize(value) !== value) return false;
  const segments = value.split("/");
  const basename = segments.at(-1).toLowerCase();
  return !segments.some((segment) => !segment || segment === "." || segment === ".." || PROHIBITED_SEGMENTS.has(segment.toLowerCase()))
    && !PROHIBITED_PREFIXES.some((prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()))
    && basename !== ".env"
    && !basename.startsWith(".env.")
    && !PROHIBITED_SUFFIXES.some((suffix) => basename.endsWith(suffix));
}

function walk(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const absolute = join(directory, name);
      const info = lstatSync(absolute);
      const path = relative(root, absolute).split(sep).join("/");
      if (!safePath(path)) throw new Error(`${path}: confidentiality boundary violation`);
      if (info.isSymbolicLink()) throw new Error(`${path}: symbolic links are forbidden`);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) files.push(path);
      else throw new Error(`${path}: only regular files are allowed`);
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

function scan(path, content) {
  const text = confidentialityText(content);
  const checks = [
    [new RegExp(["/", "Users", "/", "[^/\\s]+", "/"].join("")), "host-specific absolute path"],
    [/\b[A-Za-z]:\\(?!\/)[^\s"']+/, "host-specific absolute path"],
    [new RegExp(["g", "h", "p", "_"].join("")), "credential-shaped value"],
    [new RegExp(["github", "pat", "_"].join("_")), "credential-shaped value"],
    [new RegExp(`\\b${["s", "k", "-"].join("")}[A-Za-z0-9]`), "credential-shaped value"],
    [/hooks\.slack\.com\/services\//, "credential-shaped value"],
    [/AKIA[0-9A-Z]{16}/, "credential-shaped value"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private-key material"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) throw new Error(`${path}: ${label}`);
  }
}

function validateManifest(manifest) {
  exactKeys(manifest, MANIFEST_KEYS, "artifact manifest");
  if (manifest.schemaVersion !== "1.0" || manifest.artifact !== "foundry-clean-product") throw new Error("artifact manifest identity is invalid");
  if (!/^[0-9a-f]{40}$/.test(manifest.producerSha) || !/^[0-9a-f]{64}$/.test(manifest.treeDigest)) throw new Error("artifact manifest digests are invalid");
  if (!Number.isSafeInteger(manifest.fileCount) || manifest.fileCount < 1 || !Array.isArray(manifest.files) || manifest.fileCount !== manifest.files.length) {
    throw new Error("artifact manifest file list is invalid");
  }
  for (const file of manifest.files) {
    exactKeys(file, FILE_KEYS, "artifact file");
    if (!safePath(file.path) || !SAFE_MODES.has(file.mode) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`${file.path ?? "unknown"}: artifact file record is invalid`);
    }
  }
  const paths = manifest.files.map(({ path }) => path);
  if (paths.some((path, index) => index > 0 && path <= paths[index - 1])) throw new Error("artifact file paths must be unique and sorted");
  return manifest;
}

function assertExternalApprovalPath(approvalPath, producerRepo, artifactRoot) {
  const output = resolve(approvalPath);
  const parent = realpathSync(dirname(output));
  const canonicalOutput = join(parent, output.slice(dirname(output).length + 1));
  for (const root of [producerRepo, artifactRoot]) {
    if (canonicalOutput === root || canonicalOutput.startsWith(`${root}${sep}`)) throw new Error("approvalPath must be outside producer and artifact roots");
  }
  if (existsSync(canonicalOutput)) throw new Error("approvalPath must not already exist");
  return canonicalOutput;
}

export function reviewFoundryArtifact({ producerRepo, artifactRoot, approvalPath } = {}) {
  if (!producerRepo || !artifactRoot || !approvalPath) throw new Error("producerRepo, artifactRoot, and approvalPath are required");
  producerRepo = realpathSync(resolve(producerRepo));
  const artifactInput = resolve(artifactRoot);
  if (lstatSync(artifactInput).isSymbolicLink()) throw new Error("artifact root must not be a symbolic link");
  artifactRoot = realpathSync(artifactInput);
  const output = assertExternalApprovalPath(approvalPath, producerRepo, artifactRoot);
  const manifestPath = join(artifactRoot, "artifact-manifest.json");
  if (lstatSync(manifestPath).isSymbolicLink()) throw new Error("artifact manifest must not be a symbolic link");
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const resolvedSha = git(producerRepo, ["rev-parse", "--verify", `${manifest.producerSha}^{commit}`]).trim();
  if (resolvedSha !== manifest.producerSha) throw new Error("producer SHA does not resolve exactly");

  const productInput = join(artifactRoot, "product");
  if (lstatSync(productInput).isSymbolicLink()) throw new Error("artifact product must not be a symbolic link");
  const productRoot = realpathSync(productInput);
  const paths = walk(productRoot);
  const expectedPaths = manifest.files.map(({ path }) => path);
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) throw new Error("artifact paths do not match manifest");

  const computed = [];
  for (const file of manifest.files) {
    const stagedPath = join(productRoot, file.path);
    const content = readFileSync(stagedPath);
    const mode = lstatSync(stagedPath).mode & 0o111 ? "100755" : "100644";
    if (mode !== file.mode || content.length !== file.size || sha256(content) !== file.sha256) throw new Error(`${file.path}: staged bytes or mode do not match manifest`);
    const sourcePath = `Foundry/${file.path}`;
    const source = git(producerRepo, ["show", `${manifest.producerSha}:${sourcePath}`], null);
    if (!content.equals(source)) throw new Error(`${file.path}: staged bytes do not match immutable producer`);
    const treeLine = git(producerRepo, ["ls-tree", manifest.producerSha, "--", sourcePath]).trim();
    if (!treeLine.startsWith(`${file.mode} blob `)) throw new Error(`${file.path}: immutable producer mode does not match`);
    scan(file.path, content);
    computed.push(`${file.mode} ${file.sha256} ${file.size} ${file.path}\n`);
  }
  if (sha256(computed.join("")) !== manifest.treeDigest) throw new Error("artifact tree digest does not match manifest");

  const approval = {
    schemaVersion: "1.0",
    artifact: "foundry-assay-approval",
    reviewer: "Foundry/Halls/Assay",
    verdict: "pass",
    producerSha: manifest.producerSha,
    treeDigest: manifest.treeDigest,
    checks: ["manifest-integrity", "immutable-source-bytes", "confidentiality-boundary"],
  };
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(approval, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, output);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return approval;
}
