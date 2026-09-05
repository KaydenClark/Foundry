#!/usr/bin/env node
// S-023 TK-003 - Installer for the mechanical pre-push guard.
//
// Copies tools/hooks/pre-push into each target checkout's hooks directory.
// The guard rejects any push to main/master unless the owner's override token
// file is present (consumed on use). This installer:
//   * is idempotent over its own hook (keyed on the S-023 marker line),
//   * REFUSES to overwrite a foreign pre-push hook rather than clobber it,
//   * fails closed on non-repositories,
//   * offers --check as a read-only audit that writes nothing.
//
// Default targets are the root, the canonical Forge checkout, and the
// blessed module checkouts (RUNBOOK Canonical Routing).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from './workspace-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The tools lane moved under `workbench/`, so one `..` from this script now
// lands in the workbench, not the workspace. Resolve the repository root.
const WORKSPACE_ROOT = findRepoRoot(SCRIPT_DIR);
const HOOK_SOURCE = path.join(SCRIPT_DIR, 'hooks', 'pre-push');
const MARKER = 'WORKSPACE push-guard (S-023';

export const DEFAULT_TARGETS = [
  WORKSPACE_ROOT,
  path.join(WORKSPACE_ROOT, 'Foundry', 'Halls', 'Forge'),
  path.join(WORKSPACE_ROOT, 'Foundry', 'Modules', 'OpenBrain'),
  path.join(WORKSPACE_ROOT, 'Foundry', 'Modules', 'Command Information Center'),
];

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
    'pre-push',
  );
}

// Read-only audit of one checkout: installed | foreign | missing | not-a-repo.
export function checkPushGuard(repoPath) {
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

// Install (or refresh) the guard in one checkout.
export function installPushGuard(repoPath, { sourcePath = HOOK_SOURCE } = {}) {
  const existing = checkPushGuard(repoPath);
  if (existing.status === 'not-a-repo') return existing;
  if (existing.status === 'foreign') {
    return { ...existing, status: 'refused-foreign' };
  }
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (!source.includes(MARKER)) {
    throw new Error(`${sourcePath} is missing the ${MARKER} marker; refusing to install an unmarked hook`);
  }
  fs.mkdirSync(path.dirname(existing.hookPath), { recursive: true });
  fs.writeFileSync(existing.hookPath, source, { mode: 0o755 });
  fs.chmodSync(existing.hookPath, 0o755);
  return { status: 'installed', repo: existing.repo, hookPath: existing.hookPath };
}

function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const targets = argv.filter((arg) => arg !== '--check');
  const repos = targets.length > 0 ? targets : DEFAULT_TARGETS;

  let failed = 0;
  for (const repo of repos) {
    const outcome = checkOnly ? checkPushGuard(repo) : installPushGuard(repo);
    const okStates = checkOnly ? ['installed'] : ['installed'];
    if (!okStates.includes(outcome.status)) failed += 1;
    process.stdout.write(`${outcome.status} - ${repo}\n`);
    if (outcome.status === 'refused-foreign') {
      process.stdout.write(`  a pre-push hook not owned by S-023 already exists at ${outcome.hookPath}; inspect it before replacing\n`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
