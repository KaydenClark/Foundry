#!/usr/bin/env node
// One answer to "where is the repository root" and "where does lane X live".
//
// The V3 lane move relocated specs, wiki, docs, tools and session records under
// `workbench/`. Tools had each hardcoded their own answer, so the move broke
// them in two opposite directions at once: tools that moved into
// `workbench/tools` began resolving repo-level paths one directory too deep,
// while tools that stayed put kept joining the pre-move `specs/`, `Wiki/` and
// `tools/` names. Both classes failed silently by reading nothing.
//
// `workbench/manifest.json` already declares the lanes. This module is the
// single reader of that declaration, with the pre-V3 layout as the fallback so
// checkouts that never migrated keep working unchanged.

import fs from 'node:fs';
import path from 'node:path';

// Lane names as they were laid out before the V3 move. `wiki` is capitalised
// because the pre-move directory was `Wiki/`.
const LEGACY_LANES = Object.freeze({
  docs: 'docs',
  specs: 'specs',
  wiki: 'Wiki',
  sessions: 'sessions',
  feedback: 'feedback',
  tools: 'tools'
});

export function readManifest(root) {
  const manifestPath = path.join(path.resolve(root), 'workbench', 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const failure = new Error(`${manifestPath} is unreadable: ${error.message}`);
    failure.code = 'unreadable-manifest';
    throw failure;
  }
}

// Walk up from `start` to the nearest directory that declares a workbench, and
// fall back to the nearest Git checkout. Tools call this instead of counting
// `..` segments from their own location, which is what the move invalidated.
export function findRepoRoot(start = process.cwd()) {
  let current = path.resolve(start);
  if (fs.existsSync(current) && !fs.statSync(current).isDirectory()) current = path.dirname(current);
  let gitRoot = null;
  while (true) {
    if (fs.existsSync(path.join(current, 'workbench', 'manifest.json'))) return current;
    if (gitRoot === null && fs.existsSync(path.join(current, '.git'))) gitRoot = current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return gitRoot ?? path.resolve(start);
}

// The repo-relative posix prefix for a lane, e.g. `workbench/specs`.
export function laneRelative(root, name) {
  if (!Object.hasOwn(LEGACY_LANES, name)) throw new Error(`unknown lane: ${name}`);
  const declared = readManifest(root)?.lanes?.[name];
  if (typeof declared === 'string' && declared.trim()) return declared.trim().replace(/\/+$/, '');
  return LEGACY_LANES[name];
}

// The absolute path to a lane.
export function lanePath(root, name) {
  return path.resolve(path.resolve(root), laneRelative(root, name));
}

// A lane that must exist. Reading nothing from a missing lane is the failure
// mode this module exists to prevent, so callers that need content ask here.
export function requireLane(root, name) {
  const resolved = lanePath(root, name);
  if (!fs.existsSync(resolved)) {
    const failure = new Error(`${name} lane ${laneRelative(root, name)} does not exist under ${path.resolve(root)}`);
    failure.code = 'missing-lane';
    throw failure;
  }
  return resolved;
}

export const LANE_NAMES = Object.freeze(Object.keys(LEGACY_LANES));
