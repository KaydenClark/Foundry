#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateWorkflowConfig } from "./captain.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const defaultHarnessRoot = resolve(dirname(scriptFile), "..");
const defaultManifestPath = join(defaultHarnessRoot, "manifest", "foundry.json");

const REQUIRED_HARNESS_PATHS = [
  ".gitignore",
  "AGENTS.md",
  "BLUEPRINT.md",
  "CLAUDE.md",
  "LEXICON.md",
  "README.md",
  "RUNBOOK.md",
  "TASKBOARD.md",
  "audit-engine.json",
  "manifest/foundry.json",
  "reference/README.md",
  "reference/foundry-schematic-FND-01.html",
  "scheduler/AFK_POLICY.md",
  "scheduler/CAPTAIN.md",
  "scheduler/workflows.example.json",
  "skills/adoption/SKILL.md",
  "skills/role-auditor/SKILL.md",
  "skills/role-captain/SKILL.md",
  "skills/role-chain-engineer/SKILL.md",
  "skills/role-designer/SKILL.md",
  "skills/role-engineer/SKILL.md",
  "skills/role-planner/SKILL.md",
  "skills/role-scout/SKILL.md",
  "templates/ADOPTION.md",
  "templates/GENESIS.md",
  "templates/Wiki/MEMORY.md",
  "templates/Wiki/SCHEMA.md",
  "templates/Wiki/Machine/Foundry Instance.md",
  "templates/instance/bindings.json",
  "templates/instance/workflows.json",
  "tools/captain.mjs",
  "tools/markdown-table.mjs",
  "tools/spec-workbench.mjs",
  "tools/test-captain.mjs",
  "tools/test-foundry.mjs",
  "THIRD_PARTY_NOTICES.md",
];

const INSTANCE_ONLY_KEYS = new Set([
  "binding",
  "bindings",
  "boundEntity",
  "credential",
  "credentials",
  "secret",
  "secrets",
  "token",
  "tokens",
  "environment",
]);

function run(command, args, { cwd, allowFailure = false, timeout = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  if (result.error && !allowFailure) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const evidence = (result.stderr || result.stdout || "no diagnostic").trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${evidence}`);
  }
  return result;
}

function git(cwd, args, options = {}) {
  return run("git", args, { ...options, cwd });
}

function readJson(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read JSON ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON ${file}: ${error.message}`);
  }
}

function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\")) return false;
  if (isAbsolute(value) || win32.isAbsolute(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return posix.normalize(value) === value;
}

function remoteErrors(remote) {
  if (typeof remote !== "string" || !remote) return ["remote must be a non-empty string"];
  let parsed;
  try {
    parsed = new URL(remote);
  } catch {
    return ["remote must be an absolute credential-free HTTPS URL"];
  }
  const errors = [];
  if (parsed.protocol !== "https:") errors.push("remote must use HTTPS");
  if (parsed.username || parsed.password) errors.push("remote must not contain credentials");
  if (parsed.hostname.toLowerCase() !== "github.com") errors.push("remote host must be github.com");
  if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(parsed.pathname)) {
    errors.push("remote must name one GitHub owner/repository");
  }
  if (parsed.search || parsed.hash) errors.push("remote must not contain query or fragment data");
  return errors;
}

function findInstanceOnlyKeys(value, location = "manifest") {
  const errors = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => errors.push(...findInstanceOnlyKeys(entry, `${location}[${index}]`)));
    return errors;
  }
  if (!value || typeof value !== "object") return errors;
  for (const [key, entry] of Object.entries(value)) {
    if (INSTANCE_ONLY_KEYS.has(key)) {
      errors.push(`${location}.${key}: instance binding data is forbidden in the install manifest`);
    }
    errors.push(...findInstanceOnlyKeys(entry, `${location}.${key}`));
  }
  return errors;
}

const VALID_TIERS = new Set(["native-hall", "installed-module"]);
const TIER_FAMILY = { "native-hall": "Halls", "installed-module": "Modules" };

// A native Hall (the Forge, the Assay, the Ward, the Gatehouse) is tracked
// source inside this very repository: it arrives with `git clone` of the
// Foundry itself and carries no remote, ref, or install destination. An
// installed Module (OpenBrain, CIC, Slack, Discord) is optional and remains a
// separately owned repository the adoption manifest clones on request. See
// S-024 and root LEXICON.md "Hall" / "Foundry Module".
export function componentLocation(component) {
  return component?.tier === "native-hall" ? component?.path : component?.destination;
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }
  if (manifest.schemaVersion !== "1.0") errors.push("schemaVersion must be '1.0'");
  if (manifest.artifact !== "servitor-foundry-install-manifest") {
    errors.push("artifact must be 'servitor-foundry-install-manifest'");
  }
  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    errors.push("components must be a non-empty array");
  } else {
    const ids = new Set();
    const locations = new Set();
    for (const [index, component] of manifest.components.entries()) {
      const prefix = `components[${index}]`;
      if (!component || typeof component !== "object" || Array.isArray(component)) {
        errors.push(`${prefix}: component must be an object`);
        continue;
      }
      if (!/^(?:F|P|M|G)-\d{3}$/.test(component.id ?? "")) {
        errors.push(`${prefix}.id must match F-###, P-###, M-###, or G-###`);
      } else if (ids.has(component.id)) {
        errors.push(`${prefix}: duplicate component id '${component.id}'`);
      } else {
        ids.add(component.id);
      }
      if (typeof component.name !== "string" || !component.name.trim()) {
        errors.push(`${prefix}.name must be a non-empty string`);
      }
      if (!["active", "paused", "planned"].includes(component.status)) {
        errors.push(`${prefix}.status must be active, paused, or planned`);
      }

      if (!VALID_TIERS.has(component.tier)) {
        errors.push(`${prefix}.tier must be native-hall or installed-module`);
        continue;
      }
      const expectedFamily = TIER_FAMILY[component.tier];
      if (component.family !== expectedFamily) {
        errors.push(`${prefix}.family must be '${expectedFamily}' for tier '${component.tier}'`);
      }

      if (component.tier === "native-hall") {
        if ("remote" in component) errors.push(`${prefix}: native Hall components must not declare a remote`);
        if ("ref" in component) errors.push(`${prefix}: native Hall components must not declare a ref`);
        if ("destination" in component) {
          errors.push(`${prefix}: native Hall components must not declare a destination`);
        }
        if (!isSafeRelativePath(component.path)) {
          errors.push(`${prefix}.path must be a safe relative path`);
        } else if (component.path.startsWith("Modules/")) {
          errors.push(`${prefix}.path must not live under Modules/`);
        } else if (locations.has(component.path)) {
          errors.push(`${prefix}: duplicate location '${component.path}'`);
        } else {
          locations.add(component.path);
        }
        if ("foldedFrom" in component) {
          for (const foldedFromError of remoteErrors(component.foldedFrom)) {
            errors.push(`${prefix}.foldedFrom ${foldedFromError}`);
          }
        }
      } else {
        if ("path" in component) errors.push(`${prefix}: installed Module components must not declare a path`);
        if ("foldedFrom" in component) {
          errors.push(`${prefix}: installed Module components must not declare foldedFrom`);
        }
        for (const remoteError of remoteErrors(component.remote)) {
          errors.push(`${prefix}.remote ${remoteError}`);
        }
        if (
          typeof component.ref !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(component.ref) ||
          component.ref.includes("..") ||
          component.ref.endsWith("/")
        ) {
          errors.push(`${prefix}.ref must be a safe explicit Git branch name`);
        }
        if (!isSafeRelativePath(component.destination)) {
          errors.push(`${prefix}.destination must be a safe relative path`);
        } else {
          if (!component.destination.startsWith(`${expectedFamily}/`)) {
            errors.push(`${prefix}.destination must live under ${expectedFamily}/`);
          }
          if (locations.has(component.destination)) {
            errors.push(`${prefix}: duplicate location '${component.destination}'`);
          } else {
            locations.add(component.destination);
          }
        }
      }
    }
  }

  const registry = manifest.socketRegistry;
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    errors.push("socketRegistry must be an object");
  } else {
    if (!manifest.components?.some((component) => component.id === registry.componentId)) {
      errors.push("socketRegistry.componentId must reference a declared component");
    }
    if (!isSafeRelativePath(registry.relativePath)) {
      errors.push("socketRegistry.relativePath must be a safe relative path");
    }
    if (
      !Array.isArray(registry.validator) ||
      registry.validator.length < 2 ||
      registry.validator.some((argument) => typeof argument !== "string" || !argument)
    ) {
      errors.push("socketRegistry.validator must be a non-empty argv array");
    } else if (["sh", "bash", "zsh", "cmd", "powershell", "pwsh"].includes(registry.validator[0])) {
      errors.push("socketRegistry.validator must not invoke a shell");
    }
  }
  errors.push(...findInstanceOnlyKeys(manifest));
  return errors;
}

export function loadManifest(file = defaultManifestPath) {
  const manifest = readJson(file);
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`invalid Foundry manifest:\n- ${errors.join("\n- ")}`);
  return manifest;
}

export function renderTemplate(content, replacements) {
  return content.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (!(key in replacements)) throw new Error(`missing template replacement ${key}`);
    return replacements[key];
  });
}

function normalizeRemoteIdentity(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "file:") return resolve(fileURLToPath(parsed));
    if (parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com") {
      return `github.com${parsed.pathname.replace(/\.git$/, "")}`.toLowerCase();
    }
  } catch {
    // Local source overrides are ordinary absolute paths.
  }
  return resolve(value);
}

function assertHarnessInsideInstance(harnessRoot, instanceRoot) {
  const rel = relative(instanceRoot, harnessRoot);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("the harness root must be a child of the instance root");
  }
  return rel.split(sep).join("/");
}

function assertNoSymbolicLinkSegments(root, relativePath, label = relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error(`${label} is not a safe relative path`);
  let current = root;
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} crosses a symbolic link at ${relative(root, current).split(sep).join("/")}`);
    }
  }
}

function harnessGitProvenance(harnessRoot) {
  const remote = git(harnessRoot, ["remote", "get-url", "origin"], { allowFailure: true });
  const ref = git(harnessRoot, ["branch", "--show-current"], { allowFailure: true });
  const commit = git(harnessRoot, ["rev-parse", "HEAD"], { allowFailure: true });
  return {
    remote: remote.status === 0 ? remote.stdout.trim() : null,
    ref: ref.status === 0 ? ref.stdout.trim() : null,
    commit: commit.status === 0 ? commit.stdout.trim() : null,
  };
}

function inspectComponentDestination({ component, harnessRoot, source }) {
  assertNoSymbolicLinkSegments(harnessRoot, component.destination, `${component.id} destination`);
  const destination = join(harnessRoot, component.destination);
  if (!existsSync(destination)) return { action: "clone", destination };
  if (!statSync(destination).isDirectory()) {
    throw new Error(`${component.id} destination exists but is not a directory: ${component.destination}`);
  }
  const gitMarker = join(destination, ".git");
  if (!existsSync(gitMarker) || !lstatSync(gitMarker).isDirectory()) {
    throw new Error(
      `${component.id} destination exists but is not an independent Git repository: ${component.destination}`,
    );
  }
  const actualRemote = git(destination, ["remote", "get-url", "origin"]).stdout.trim();
  if (normalizeRemoteIdentity(actualRemote) !== normalizeRemoteIdentity(source)) {
    throw new Error(
      `${component.id} origin mismatch at ${component.destination}: expected ${source}, got ${actualRemote}`,
    );
  }
  const actualRef = git(destination, ["branch", "--show-current"]).stdout.trim();
  if (actualRef !== component.ref) {
    throw new Error(`${component.id} ref mismatch: expected ${component.ref}, got ${actualRef || "detached"}`);
  }
  const dirty = git(destination, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim();
  if (dirty) throw new Error(`${component.id} destination is dirty; adoption will not overwrite it`);
  return { action: "reuse", destination };
}

// The common baseline every native Hall in this repo actually carries today.
// LEXICON.md is deliberately excluded: `pip/` (the Ward) predates this check
// and has no LEXICON.md of its own (WORKBENCH_FEEDBACK.md records the gap).
// New Halls should still ship one — see `gatehouse/LEXICON.md` — but the
// doctor gate only enforces what every existing Hall actually has, so it
// never fails on a pre-existing, honestly-recorded gap it did not create.
const NATIVE_HALL_CONTROL_DOCS = [
  "AGENTS.md",
  "BLUEPRINT.md",
  "RUNBOOK.md",
  "TASKBOARD.md",
  "CLAUDE.md",
  "README.md",
];

function inspectNativeHall({ component, harnessRoot }) {
  assertNoSymbolicLinkSegments(harnessRoot, component.path, `${component.id} path`);
  const location = join(harnessRoot, component.path);
  if (!existsSync(location) || !statSync(location).isDirectory()) {
    throw new Error(`${component.id} native Hall is missing at ${component.path}`);
  }
  const missing = NATIVE_HALL_CONTROL_DOCS.filter((doc) => !existsSync(join(location, doc)));
  if (missing.length) {
    throw new Error(
      `${component.id} native Hall at ${component.path} is missing control docs: ${missing.join(", ")}`,
    );
  }
  return { action: "native", destination: location };
}

function nativeHallErrors(harnessRoot, manifest) {
  const errors = [];
  for (const component of manifest.components) {
    if (component.tier !== "native-hall") continue;
    try {
      inspectNativeHall({ component, harnessRoot });
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
}

function installComponent({ component, harnessRoot, source }) {
  const inspection = inspectComponentDestination({ component, harnessRoot, source });
  if (inspection.action === "clone") {
    const destination = inspection.destination;
    mkdirSync(dirname(destination), { recursive: true });
    git(harnessRoot, [
      "clone",
      "--branch",
      component.ref,
      "--single-branch",
      "--no-tags",
      "--",
      source,
      destination,
    ]);
    return { action: "cloned", destination };
  }
  return { action: "reused", destination: inspection.destination };
}

function copyTemplateFile({ template, destination, replacements }) {
  if (existsSync(destination)) return "preserved";
  const rendered = renderTemplate(readFileSync(template, "utf8"), replacements);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rendered, "utf8");
  return "created";
}

function parseBindings(file) {
  const value = readJson(file);
  if (value.schemaVersion !== "1.0" || !Array.isArray(value.bindings)) {
    throw new Error(`invalid instance bindings ${file}`);
  }
  return value;
}

export async function adoptFoundry({
  harnessRoot = defaultHarnessRoot,
  instanceRoot,
  instanceName,
  manifest = loadManifest(join(harnessRoot, "manifest", "foundry.json")),
  sourceOverrides = {},
  dryRun = false,
} = {}) {
  if (!instanceRoot) throw new Error("instanceRoot is required");
  harnessRoot = resolve(harnessRoot);
  instanceRoot = resolve(instanceRoot);
  if (!existsSync(harnessRoot) || !statSync(harnessRoot).isDirectory()) {
    throw new Error(`harness root does not exist: ${harnessRoot}`);
  }
  mkdirSync(instanceRoot, { recursive: true });
  harnessRoot = realpathSync(harnessRoot);
  instanceRoot = realpathSync(instanceRoot);
  const harnessRelative = assertHarnessInsideInstance(harnessRoot, instanceRoot);
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`invalid Foundry manifest:\n- ${errors.join("\n- ")}`);

  for (const id of Object.keys(sourceOverrides)) {
    if (!manifest.components.some((component) => component.id === id)) {
      throw new Error(`source override references unknown component ${id}`);
    }
    if (typeof sourceOverrides[id] !== "string" || !sourceOverrides[id]) {
      throw new Error(`source override for ${id} must be a non-empty string`);
    }
  }

  const foundryState = join(instanceRoot, ".foundry");
  const markerFile = join(foundryState, "instance.json");
  const bindingFile = join(foundryState, "bindings.json");
  const workflowFile = join(foundryState, "workflows.json");
  const instanceMaterializationPaths = [
    ".foundry/instance.json",
    ".foundry/bindings.json",
    ".foundry/workflows.json",
    ".local/foundry/adoption-receipt.json",
    "Wiki/MEMORY.md",
    "Wiki/SCHEMA.md",
    "Wiki/Machine/Foundry Instance.md",
  ];
  const assertInstanceMaterializationPaths = () => {
    for (const relativePath of instanceMaterializationPaths) {
      assertNoSymbolicLinkSegments(instanceRoot, relativePath, `instance path ${relativePath}`);
    }
  };
  assertInstanceMaterializationPaths();
  if (existsSync(markerFile)) {
    const existingMarker = readJson(markerFile);
    if (existingMarker.harnessRoot !== harnessRelative) {
      throw new Error(
        `instance marker points at ${existingMarker.harnessRoot}; refusing to replace it with ${harnessRelative}`,
      );
    }
  }
  if (existsSync(bindingFile)) parseBindings(bindingFile);
  if (existsSync(workflowFile)) {
    const workflowErrors = validateWorkflowConfig(readJson(workflowFile));
    if (workflowErrors.length) {
      throw new Error(`invalid instance workflows ${workflowFile}:\n- ${workflowErrors.join("\n- ")}`);
    }
  }

  const manifestPath = join(harnessRoot, "manifest", "foundry.json");
  const manifestDigest = existsSync(manifestPath)
    ? sha256File(manifestPath)
    : sha256(`${JSON.stringify(manifest)}\n`);
  const inspectedComponents = manifest.components.map((component) => {
    if (component.tier === "native-hall") {
      return { component, source: null, inspection: inspectNativeHall({ component, harnessRoot }) };
    }
    const source = sourceOverrides[component.id] ?? component.remote;
    const inspection = inspectComponentDestination({ component, harnessRoot, source });
    return { component, source, inspection };
  });
  const plan = inspectedComponents.map(({ component, inspection }) => ({
    id: component.id,
    name: component.name,
    tier: component.tier,
    location: componentLocation(component),
    remote: component.remote ?? null,
    ref: component.ref ?? null,
    action: inspection.action,
  }));
  if (dryRun) {
    return { schemaVersion: "1.0", dryRun: true, harnessRoot: harnessRelative, plan };
  }

  const componentResults = [];
  for (const { component, source, inspection } of inspectedComponents) {
    if (component.tier === "native-hall") {
      componentResults.push({
        id: component.id,
        name: component.name,
        family: component.family,
        tier: component.tier,
        path: component.path,
        action: inspection.action,
      });
      continue;
    }
    const installed = installComponent({ component, harnessRoot, source });
    const commit = git(installed.destination, ["rev-parse", "HEAD"]).stdout.trim();
    componentResults.push({
      id: component.id,
      name: component.name,
      family: component.family,
      tier: component.tier,
      destination: component.destination,
      remote: component.remote,
      source,
      sourceOverride: component.id in sourceOverrides,
      ref: component.ref,
      commit,
      action: installed.action,
    });
  }
  assertInstanceMaterializationPaths();

  const resolvedName = instanceName?.trim() || basename(instanceRoot);
  const replacements = {
    INSTANCE_NAME: resolvedName,
    HARNESS_ROOT: harnessRelative,
    ADOPTION_DATE: new Date().toISOString().slice(0, 10),
  };

  const wikiTemplateRoot = join(harnessRoot, "templates", "Wiki");
  const wikiActions = [
    ["MEMORY.md", "MEMORY.md"],
    ["SCHEMA.md", "SCHEMA.md"],
    [join("Machine", "Foundry Instance.md"), join("Machine", "Foundry Instance.md")],
  ].map(([templateRelative, destinationRelative]) => ({
    path: `Wiki/${destinationRelative.split(sep).join("/")}`,
    action: copyTemplateFile({
      template: join(wikiTemplateRoot, templateRelative),
      destination: join(instanceRoot, "Wiki", destinationRelative),
      replacements,
    }),
  }));

  mkdirSync(foundryState, { recursive: true });
  const bindingAction = copyTemplateFile({
    template: join(harnessRoot, "templates", "instance", "bindings.json"),
    destination: bindingFile,
    replacements,
  });
  parseBindings(bindingFile);

  const workflowAction = copyTemplateFile({
    template: join(harnessRoot, "templates", "instance", "workflows.json"),
    destination: workflowFile,
    replacements,
  });
  const workflowErrors = validateWorkflowConfig(readJson(workflowFile));
  if (workflowErrors.length) {
    throw new Error(`invalid instance workflows ${workflowFile}:\n- ${workflowErrors.join("\n- ")}`);
  }

  writeJsonAtomic(markerFile, {
    schemaVersion: "1.0",
    instanceName: resolvedName,
    harnessRoot: harnessRelative,
    manifestDigest,
  });

  const receipt = {
    schemaVersion: "1.0",
    artifact: "foundry-adoption-receipt",
    adoptedAt: new Date().toISOString(),
    instance: { name: resolvedName, harnessRoot: harnessRelative },
    harness: harnessGitProvenance(harnessRoot),
    manifest: {
      schemaVersion: manifest.schemaVersion,
      digest: manifestDigest,
      path: `${harnessRelative}/manifest/foundry.json`,
    },
    components: componentResults,
    instanceData: {
      bindings: { path: ".foundry/bindings.json", action: bindingAction },
      workflows: { path: ".foundry/workflows.json", action: workflowAction },
      wiki: wikiActions,
    },
    checks: ["manifest-valid", "component-origins-and-refs-resolved", "instance-data-seeded"],
  };
  writeJsonAtomic(join(instanceRoot, ".local", "foundry", "adoption-receipt.json"), receipt);
  return receipt;
}

function listRepositoryFiles(harnessRoot) {
  const listed = git(harnessRoot, ["ls-files", "-z"], { allowFailure: true });
  if (listed.status === 0 && listed.stdout) {
    return listed.stdout
      .split("\0")
      .filter(Boolean)
      .map((entry) => join(harnessRoot, entry));
  }
  const ignored = new Set([".git", "Sockets", "Modules", ".worktrees", ".local", ".foundry"]);
  const files = [];
  function visit(folder) {
    for (const name of readdirSync(folder)) {
      if (ignored.has(name)) continue;
      const absolute = join(folder, name);
      const info = lstatSync(absolute);
      if (info.isDirectory()) visit(absolute);
      else if (info.isFile()) files.push(absolute);
    }
  }
  visit(harnessRoot);
  return files;
}

function portabilityErrors(harnessRoot) {
  const errors = [];
  const forbiddenAbsolute = `${sep}Users${sep}${["kay", "den"].join("")}`;
  const credentialPrefix = ["g", "h", "p", "_"].join("");
  const githubTokenPrefix = ["github", "pat", "_"].join("_");
  const apiKeyPrefix = ["s", "k", "-"].join("");
  const secretPattern = new RegExp(
    `(?:${credentialPrefix}|${githubTokenPrefix}|\\b${apiKeyPrefix}[A-Za-z0-9]|hooks\\.slack\\.com/services/[^\\s\"'])`,
  );
  for (const file of listRepositoryFiles(harnessRoot)) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = relative(harnessRoot, file).split(sep).join("/");
    if (content.includes(forbiddenAbsolute)) errors.push(`${rel}: host-specific absolute path`);
    if (secretPattern.test(content)) errors.push(`${rel}: secret-shaped value`);
  }
  return errors;
}

function boundaryErrors(harnessRoot, manifest) {
  const errors = [];
  const ignore = readFileSync(join(harnessRoot, ".gitignore"), "utf8");
  for (const required of ["/Modules/", "/.worktrees/", "/.local/", "/.foundry/"]) {
    if (!ignore.split(/\r?\n/).includes(required)) errors.push(`.gitignore missing ${required}`);
  }

  const installedDestinations = manifest.components
    .filter((component) => component.tier === "installed-module")
    .map((component) => component.destination);
  const staged = git(harnessRoot, ["ls-files", "--stage"], { allowFailure: true });
  if (staged.status === 0) {
    for (const line of staged.stdout.split(/\r?\n/).filter(Boolean)) {
      const [metadata, trackedPath = ""] = line.split("\t", 2);
      const mode = metadata.split(" ")[0];
      if (mode === "160000") errors.push(`${trackedPath}: gitlink is forbidden`);
      if (installedDestinations.some((destination) => trackedPath.startsWith(`${destination}/`))) {
        errors.push(`${trackedPath}: installed component content is tracked`);
      }
      if (trackedPath.startsWith(".worktrees/")) errors.push(`${trackedPath}: worktree content is tracked`);
    }
  }
  return errors;
}

function expectedInstalledSource(component, receipt) {
  return receipt?.components?.find((entry) => entry.id === component.id)?.source ?? component.remote;
}

function detectInstanceRoot(harnessRoot) {
  const parent = dirname(harnessRoot);
  return existsSync(join(parent, ".foundry", "instance.json")) ? parent : null;
}

export async function doctorFoundry({
  harnessRoot = defaultHarnessRoot,
  instanceRoot,
  manifest = loadManifest(join(harnessRoot, "manifest", "foundry.json")),
} = {}) {
  harnessRoot = realpathSync(resolve(harnessRoot));
  instanceRoot = instanceRoot ? realpathSync(resolve(instanceRoot)) : detectInstanceRoot(harnessRoot);
  const manifestFile = join(harnessRoot, "manifest", "foundry.json");
  const manifestDigest = existsSync(manifestFile)
    ? sha256File(manifestFile)
    : sha256(`${JSON.stringify(manifest)}\n`);
  const errors = [];
  const warnings = [];
  let contractValidation = "not run (harness-only doctor)";

  for (const required of REQUIRED_HARNESS_PATHS) {
    if (!existsSync(join(harnessRoot, required))) errors.push(`missing harness path: ${required}`);
  }
  errors.push(...validateManifest(manifest));
  if (existsSync(join(harnessRoot, ".gitignore"))) {
    errors.push(...boundaryErrors(harnessRoot, manifest));
  }
  errors.push(...portabilityErrors(harnessRoot));
  // Native Halls arrive with the harness clone itself, so their completeness
  // (present, real directory, all seven control docs) is a harness-only check:
  // a cold clone of the Foundry alone must yield a working Forge, Assay, Ward,
  // and Gatehouse with zero additional clones (S-024 acceptance criterion).
  errors.push(...nativeHallErrors(harnessRoot, manifest));

  if (instanceRoot) {
    let harnessRelative;
    try {
      harnessRelative = assertHarnessInsideInstance(harnessRoot, instanceRoot);
    } catch (error) {
      errors.push(error.message);
    }
    const instanceMaterializationPaths = [
      ".foundry/instance.json",
      ".foundry/bindings.json",
      ".foundry/workflows.json",
      ".local/foundry/adoption-receipt.json",
      "Wiki/MEMORY.md",
      "Wiki/SCHEMA.md",
      "Wiki/Machine/Foundry Instance.md",
    ];
    const instancePathErrors = [];
    for (const relativePath of instanceMaterializationPaths) {
      try {
        assertNoSymbolicLinkSegments(instanceRoot, relativePath, `instance path ${relativePath}`);
      } catch (error) {
        instancePathErrors.push(error.message);
      }
    }
    if (instancePathErrors.length) {
      errors.push(...instancePathErrors);
      return { ok: false, errors, warnings, contractValidation };
    }
    const markerFile = join(instanceRoot, ".foundry", "instance.json");
    const bindingFile = join(instanceRoot, ".foundry", "bindings.json");
    const workflowFile = join(instanceRoot, ".foundry", "workflows.json");
    const receiptFile = join(instanceRoot, ".local", "foundry", "adoption-receipt.json");
    if (!existsSync(markerFile)) errors.push("missing instance marker: .foundry/instance.json");
    if (!existsSync(bindingFile)) errors.push("missing instance bindings: .foundry/bindings.json");
    if (!existsSync(workflowFile)) errors.push("missing instance workflows: .foundry/workflows.json");
    if (!existsSync(receiptFile)) errors.push("missing adoption receipt: .local/foundry/adoption-receipt.json");
    if (!existsSync(join(instanceRoot, "Wiki", "MEMORY.md"))) errors.push("missing instance Wiki/MEMORY.md");

    let receipt = null;
    if (existsSync(receiptFile)) {
      try {
        receipt = readJson(receiptFile);
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (existsSync(markerFile) && harnessRelative) {
      try {
        const marker = readJson(markerFile);
        if (marker.harnessRoot !== harnessRelative) {
          errors.push(`instance marker harnessRoot is ${marker.harnessRoot}, expected ${harnessRelative}`);
        }
        if (marker.manifestDigest !== manifestDigest) {
          errors.push("instance marker manifestDigest does not match the current install manifest");
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (existsSync(workflowFile)) {
      try {
        errors.push(...validateWorkflowConfig(readJson(workflowFile)).map((error) => `workflows: ${error}`));
      } catch (error) {
        errors.push(error.message);
      }
    }

    for (const component of manifest.components) {
      if (component.tier === "native-hall") continue; // verified harness-only, above.
      try {
        assertNoSymbolicLinkSegments(harnessRoot, component.destination, `${component.id} destination`);
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      const destination = join(harnessRoot, component.destination);
      if (!existsSync(join(destination, ".git"))) {
        errors.push(`${component.id}: missing independent Git clone at ${component.destination}`);
        continue;
      }
      const actualRemote = git(destination, ["remote", "get-url", "origin"], { allowFailure: true });
      const expectedSource = expectedInstalledSource(component, receipt);
      if (
        actualRemote.status !== 0 ||
        normalizeRemoteIdentity(actualRemote.stdout.trim()) !== normalizeRemoteIdentity(expectedSource)
      ) {
        errors.push(`${component.id}: installed origin does not match adoption provenance`);
      }
      const actualRef = git(destination, ["branch", "--show-current"], { allowFailure: true });
      if (actualRef.status !== 0 || actualRef.stdout.trim() !== component.ref) {
        errors.push(`${component.id}: installed ref is not ${component.ref}`);
      }
      const dirty = git(destination, ["status", "--porcelain", "--untracked-files=all"], {
        allowFailure: true,
      });
      if (dirty.status !== 0 || dirty.stdout.trim()) errors.push(`${component.id}: installed clone is dirty`);
      if (receipt) {
        const receiptComponent = receipt.components?.find((entry) => entry.id === component.id);
        if (!receiptComponent) {
          errors.push(`${component.id}: missing from adoption receipt`);
        } else {
          const actualCommit = git(destination, ["rev-parse", "HEAD"], { allowFailure: true });
          if (actualCommit.status !== 0 || actualCommit.stdout.trim() !== receiptComponent.commit) {
            errors.push(`${component.id}: installed commit does not match adoption receipt`);
          }
        }
      }
    }

    if (existsSync(bindingFile)) {
      try {
        const bindings = parseBindings(bindingFile);
        for (const binding of bindings.bindings) {
          if (["pending-contract", "unbound"].includes(binding.status)) {
            warnings.push(`${binding.socketId}: ${binding.status}`);
          }
        }
        const activeBindings = bindings.bindings.filter((binding) => binding.status === "active");
        const registryOwner = manifest.components.find(
          (component) => component.id === manifest.socketRegistry.componentId,
        );
        const registryRoot = registryOwner ? join(harnessRoot, componentLocation(registryOwner)) : null;
        if (registryRoot && existsSync(registryRoot)) {
          const [command, ...args] = manifest.socketRegistry.validator;
          const validation = run(command, args, { cwd: registryRoot, allowFailure: true });
          contractValidation = `${validation.stdout}${validation.stderr}`.trim();
          if (validation.status !== 0) errors.push(`socket registry validator failed: ${contractValidation}`);
          for (const binding of activeBindings) {
            const check = run(
              "node",
              [
                "tools/socket-contract.mjs",
                "check-binding",
                JSON.stringify({
                  socketId: binding.socketId,
                  boundEntity: binding.componentId,
                  access: binding.access,
                  entrypoint: binding.entrypoint,
                }),
              ],
              { cwd: registryRoot, allowFailure: true },
            );
            contractValidation += `${contractValidation ? "\n" : ""}${check.stdout}${check.stderr}`.trim();
            if (check.status !== 0) errors.push(`${binding.socketId}: active binding failed contract validation`);
          }
        }
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, contractValidation };
}

function parseFlags(args) {
  const values = {};
  const booleans = new Set(["--dry-run", "--json", "--harness-only"]);
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (booleans.has(token)) {
      values[token.slice(2)] = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    values[token.slice(2)] = value;
    index += 1;
  }
  return values;
}

function printHelp() {
  console.log(`Usage:
  node tools/foundry.mjs validate-manifest [--manifest FILE]
  node tools/foundry.mjs plan --instance-root DIR [--instance-name NAME] [--source-map FILE]
  node tools/foundry.mjs adopt --instance-root DIR [--instance-name NAME] [--source-map FILE]
  node tools/foundry.mjs doctor [--instance-root DIR] [--harness-only] [--json]
`);
}

async function cli() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }
  const flags = parseFlags(rest);
  const manifestPath = resolve(flags.manifest ?? defaultManifestPath);
  const manifest = loadManifest(manifestPath);
  if (command === "validate-manifest") {
    console.log(`ok - Foundry manifest valid (${manifest.components.length} components)`);
    return;
  }
  if (command === "plan" || command === "adopt") {
    if (!flags["instance-root"]) throw new Error("--instance-root is required");
    const sourceOverrides = flags["source-map"] ? readJson(resolve(flags["source-map"])) : {};
    const result = await adoptFoundry({
      harnessRoot: defaultHarnessRoot,
      instanceRoot: flags["instance-root"],
      instanceName: flags["instance-name"],
      manifest,
      sourceOverrides,
      dryRun: command === "plan" || flags["dry-run"],
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "doctor") {
    const instanceRoot = flags["harness-only"] ? null : flags["instance-root"];
    const result = await doctorFoundry({
      harnessRoot: defaultHarnessRoot,
      instanceRoot,
      manifest,
    });
    if (flags.json) console.log(JSON.stringify(result, null, 2));
    else if (result.ok) {
      console.log("ok - Foundry doctor passed");
      for (const warning of result.warnings) console.log(`warning - ${warning}`);
    } else {
      for (const error of result.errors) console.error(`error - ${error}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  cli().catch((error) => {
    console.error(`error - ${error.message}`);
    process.exitCode = 1;
  });
}
