#!/usr/bin/env node
// S-023 TK-004 - Installer for the protected-checkout tripwire.
//
// Writes a thin post-checkout hook that delegates to tools/checkout-tripwire.mjs
// (so pin changes in tools/protected-checkouts.json apply without reinstall).
// Same contract as install-push-guard.mjs: idempotent over its own hook
// (keyed on the S-023 marker), refuses foreign hooks, fails closed on
// non-repositories, --check audits read-only. Default targets are the
// enrolled checkouts in tools/protected-checkouts.json.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from './workspace-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The tools lane moved under `workbench/`, so one `..` from this script now
// lands in the workbench, not the workspace. Resolve the repository root.
const WORKSPACE_ROOT = findRepoRoot(SCRIPT_DIR);
const TRIPWIRE = path.join(SCRIPT_DIR, 'checkout-tripwire.mjs');
const MARKER = 'WORKSPACE checkout-tripwire (S-023';

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    shell: false,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

function hookPathFor(repoPath) {
  const hooksDir = git(repoPath, ['rev-parse', '--git-path', 'hooks']);
  if (!hooksDir) return null;
  return path.join(
    path.isAbsolute(hooksDir) ? hooksDir : path.join(repoPath, hooksDir),
    'post-checkout',
  );
}

function hookBody() {
  return [
    '#!/bin/sh',
    `# WORKSPACE checkout-tripwire (S-023 TK-004). Installed by tools/install-checkout-tripwire.mjs.`,
    '# Flags an off-pin switch of a protected shared checkout for First Responder.',
    `exec node "${TRIPWIRE}" "$1" "$2" "$3"`,
    '',
  ].join('\n');
}

export function checkCheckoutTripwire(repoPath) {
  const hookPath = hookPathFor(repoPath);
  if (!hookPath) return { status: 'not-a-repo', repo: repoPath };
  if (!fs.existsSync(hookPath)) return { status: 'missing', repo: repoPath, hookPath };
  const content = fs.readFileSync(hookPath, 'utf8');
  return {
    status: content.includes(MARKER) ? 'installed' : 'foreign',
    repo: repoPath,
    hookPath,
  };
}

export function installCheckoutTripwire(repoPath) {
  const existing = checkCheckoutTripwire(repoPath);
  if (existing.status === 'not-a-repo') return existing;
  if (existing.status === 'foreign') return { ...existing, status: 'refused-foreign' };
  fs.mkdirSync(path.dirname(existing.hookPath), { recursive: true });
  fs.writeFileSync(existing.hookPath, hookBody(), { mode: 0o755 });
  fs.chmodSync(existing.hookPath, 0o755);
  return { status: 'installed', repo: existing.repo, hookPath: existing.hookPath };
}

function enrolledCheckouts() {
  const configPath = path.join(SCRIPT_DIR, 'protected-checkouts.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.checkouts.map((entry) =>
    path.isAbsolute(entry.path) ? entry.path : path.join(WORKSPACE_ROOT, entry.path));
}

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const targets = argv.filter((arg) => arg !== '--check');
  const repos = targets.length > 0 ? targets : enrolledCheckouts();

  let failed = 0;
  for (const repo of repos) {
    const outcome = checkOnly ? checkCheckoutTripwire(repo) : installCheckoutTripwire(repo);
    if (outcome.status !== 'installed') failed += 1;
    process.stdout.write(`${outcome.status} - ${repo}\n`);
    if (outcome.status === 'refused-foreign') {
      process.stdout.write(`  a post-checkout hook not owned by S-023 already exists at ${outcome.hookPath}; inspect it before replacing\n`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
