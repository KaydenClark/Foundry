#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "./workspace-paths.mjs";

// The tools lane moved under `workbench/`, so counting `..` from this file no
// longer reaches the repository. Ask the resolver instead.
const repoRoot = findRepoRoot(resolve(fileURLToPath(new URL(".", import.meta.url))));
const topologyPath = "Foundry/reactivation-topology.json";

export const REQUIRED_SURFACE_IDS = [
  "foundry-producer",
  "schematic",
  "foundry-product",
  "llm-workbench-product",
  "cic",
  "openbrain",
];

const requiredRoles = new Map([
  ["foundry-producer", "producer"],
  ["schematic", "projection"],
  ["foundry-product", "product"],
  ["llm-workbench-product", "product"],
  ["cic", "module"],
  ["openbrain", "module"],
]);

function safeRelativePath(value, field, id) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = normalize(value);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${"/"}`)) {
    throw new Error(`${id} ${field} must be a workspace-relative path`);
  }
  return normalized;
}

function parseTopology(root) {
  const path = join(root, topologyPath);
  if (!existsSync(path)) throw new Error(`missing topology source: ${topologyPath}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`invalid topology JSON: ${error.message}`);
  }
  if (parsed?.version !== 1 || !Array.isArray(parsed.surfaces)) {
    throw new Error("topology must declare version 1 and a surfaces array");
  }
  return parsed;
}

export function loadReactivationTopology(root = repoRoot) {
  const topology = parseTopology(root);
  const surfaces = new Map();
  for (const raw of topology.surfaces) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
      throw new Error("each topology surface needs an id");
    }
    if (surfaces.has(raw.id)) throw new Error(`duplicate topology surface: ${raw.id}`);
    surfaces.set(raw.id, {
      ...raw,
      targetPath: safeRelativePath(raw.targetPath, "targetPath", raw.id),
      observedPath: safeRelativePath(raw.observedPath, "observedPath", raw.id),
      targetRevisionOwnerPath: safeRelativePath(raw.targetRevisionOwnerPath, "targetRevisionOwnerPath", raw.id),
      revisionOwnerPath: safeRelativePath(raw.revisionOwnerPath, "revisionOwnerPath", raw.id),
    });
  }
  for (const id of REQUIRED_SURFACE_IDS) {
    const surface = surfaces.get(id);
    if (!surface) throw new Error(`missing required surface: ${id}`);
    if (surface.role !== requiredRoles.get(id)) {
      throw new Error(`${id} must have role ${requiredRoles.get(id)}`);
    }
    if (!surface.targetPath && !surface.observedPath) {
      throw new Error(`${id} needs a targetPath or observedPath`);
    }
  }
  return {
    version: topology.version,
    surfaces: REQUIRED_SURFACE_IDS.map((id) => surfaces.get(id)),
  };
}

function inspectPath(root, workspacePath, revisionOwnerPath = null) {
  if (!workspacePath) return null;
  const absolutePath = resolve(root, workspacePath);
  if (relative(root, absolutePath).startsWith("..")) {
    throw new Error(`topology path escapes root: ${workspacePath}`);
  }
  const exists = existsSync(absolutePath);
  let revision = null;
  if (exists) {
    try {
      const revisionRoot = resolve(root, revisionOwnerPath ?? workspacePath);
      const topLevel = execFileSync("git", ["-C", revisionRoot, "rev-parse", "--show-toplevel"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (realpathSync(topLevel) !== realpathSync(revisionRoot)) {
        return { path: workspacePath, exists, revision };
      }
      revision = execFileSync("git", ["-C", revisionRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // A product may be present before it is an independently recoverable Git checkout.
    }
  }
  return { path: workspacePath, exists, revision };
}

function driftFor(surface, target, observed) {
  if (surface.targetPath && surface.observedPath) {
    if (!target.exists && observed.exists) return "target-not-yet-present";
    if (target.exists && observed.exists) return "producer-and-installed-present";
    if (!target.exists && !observed.exists) return "both-paths-unavailable";
    return "installed-product-not-present";
  }
  if (surface.targetPath) return target.exists ? "aligned" : "target-not-yet-present";
  return observed.exists ? "aligned" : "observed-path-unavailable";
}

export function buildReactivationEnvelope(root = repoRoot, topology = loadReactivationTopology(root), { now = new Date().toISOString() } = {}) {
  const surfaces = topology.surfaces.map((surface) => {
    const target = inspectPath(root, surface.targetPath, surface.targetRevisionOwnerPath);
    const observed = inspectPath(root, surface.observedPath, surface.revisionOwnerPath);
    return {
      id: surface.id,
      label: surface.label ?? surface.id,
      role: surface.role,
      remote: surface.remote ?? null,
      target,
      observed,
      drift: driftFor(surface, target, observed),
      liveness: {
        state: "not-probed",
        checkedAt: now,
        reason: "No runtime probe is declared in the topology contract.",
      },
      work: {
        state: "not-probed",
        current: null,
        nextGate: null,
      },
    };
  });
  return {
    version: topology.version,
    generatedAt: now,
    source: topologyPath,
    activation: {
      state: "L0",
      authority: "CIC cannot authorize or execute Actuality changes",
      reason: "Sandcastle and the active Job-Order boundary are not implemented.",
    },
    surfaces,
  };
}

function parseArgs(args) {
  const options = { root: repoRoot, json: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") options.root = resolve(args[++index] ?? "");
    else if (args[index] === "--json") options.json = true;
    else if (args[index] === "--help") {
      console.log("usage: foundry-reactivation.mjs [--root PATH] [--json]");
      process.exit(0);
    } else throw new Error(`unknown argument: ${args[index]}`);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const envelope = buildReactivationEnvelope(options.root);
    if (options.json) console.log(JSON.stringify(envelope, null, 2));
    else {
      console.log(`Foundry reactivation topology (${envelope.generatedAt})`);
      console.log(`Activation: ${envelope.activation.state} — ${envelope.activation.reason}`);
      for (const surface of envelope.surfaces) {
        const paths = [surface.target, surface.observed].filter(Boolean).map((item) => `${item.path}:${item.exists ? "present" : "missing"}`).join(", ");
        console.log(`${surface.label}: ${surface.drift}; ${paths}`);
      }
    }
  } catch (error) {
    console.error(`BLOCKED - ${error.message}`);
    process.exitCode = 1;
  }
}
