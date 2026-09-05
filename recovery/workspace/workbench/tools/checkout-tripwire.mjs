#!/usr/bin/env node
// S-023 TK-004 - Protected-checkout tripwire (post-checkout evaluation).
//
// Git has no pre-checkout hook, so a switch of a protected shared checkout
// cannot be mechanically rejected the way a push can. This tripwire is the
// next-strongest floor: the instant a branch checkout lands an enrolled
// checkout off its pinned branch, it writes one idempotent First Responder
// flag (S-017 pattern — counts and paths only, no diff content) and prints a
// loud warning. Together with tools/preflight.mjs failing every subsequent
// launch while the checkout is off-pin, the switch cannot silently carry a
// flow forward.
//
// It never blocks or reverts the checkout: post-checkout cannot block, and
// the tripwire must not fight a deliberate owner-side switch. A crashing
// tripwire must never brick the owner's git, so every failure path exits 0.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from './workspace-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The tools lane moved under `workbench/`, so one `..` from this script now
// lands in the workbench, not the workspace. Resolve the repository root.
const WORKSPACE_ROOT = findRepoRoot(SCRIPT_DIR);

function defaultConfigPath() {
  return process.env.PROTECTED_CHECKOUTS_CONFIG || path.join(SCRIPT_DIR, 'protected-checkouts.json');
}

function defaultHandoffDir() {
  return (
    process.env.FIRST_RESPONDER_HANDOFF_DIR ||
    path.join(WORKSPACE_ROOT, 'Scheduled', 'Captain', 'handoffs')
  );
}

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

function slug(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
}

function realpathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

// Pure evaluation: is the checkout at `cwd` an enrolled protected checkout
// sitting off its pin after a branch checkout?
export function evaluateTripwire({ cwd, branchCheckout, configPath = defaultConfigPath() } = {}) {
  if (!branchCheckout) return { status: 'not-a-branch-checkout' };

  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return { status: 'not-a-repo' };
  const topReal = realpathOrNull(top);

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(config.checkouts)) throw new Error('expected { checkouts: [] }');
  } catch (error) {
    return { status: 'config-unreadable', error: String(error.message ?? error) };
  }

  const entry = config.checkouts.find((item) => {
    const enrolled = path.isAbsolute(item.path) ? item.path : path.join(WORKSPACE_ROOT, item.path);
    return realpathOrNull(enrolled) === topReal;
  });
  if (!entry) return { status: 'not-enrolled', repoRoot: top };

  const branch = git(top, ['branch', '--show-current']) || '(detached)';
  if (branch === entry.pinnedBranch) return { status: 'on-pin', repoRoot: top, branch };
  return {
    status: 'off-pin',
    repoRoot: top,
    branch,
    pinnedBranch: entry.pinnedBranch,
  };
}

// Idempotent per protected checkout: one flag, first-seen preserved.
export function writeTripwireFlag(evaluation, opts = {}) {
  const handoffDir = opts.handoffDir || defaultHandoffDir();
  const now = opts.now || new Date().toISOString();
  if (!fs.existsSync(handoffDir)) fs.mkdirSync(handoffDir, { recursive: true });
  const flagPath = path.join(
    handoffDir,
    `first-responder-checkout-tripwire--${slug(evaluation.repoRoot)}.md`,
  );

  let firstDetectedAt = now;
  if (fs.existsSync(flagPath)) {
    const prior = fs.readFileSync(flagPath, 'utf8');
    const m = prior.match(/^- \*\*First detected:\*\* (.+)$/m);
    if (m) firstDetectedAt = m[1].trim();
  }

  const body = `# First Responder handoff: checkout-tripwire

> Written by the post-checkout tripwire (S-023 TK-004). A protected shared
> checkout moved off its pinned branch. Paths and branch names only — no diff
> content, no credentials.

- **Type:** checkout-tripwire
- **Protected checkout:** \`${evaluation.repoRoot}\`
- **Now on branch:** \`${evaluation.branch}\`
- **Pinned branch:** \`${evaluation.pinnedBranch}\`
- **First detected:** ${firstDetectedAt}
- **Last detected:** ${now}

## First Responder action

If this was a deliberate owner-side switch, update the pin in
\`tools/protected-checkouts.json\` and clear this flag. Otherwise return the
checkout to its pinned branch, verify with
\`node tools/preflight.mjs\`, and clear this flag. Until then, preflight
fails every launch that depends on this checkout.
`;

  fs.writeFileSync(flagPath, body, 'utf8');
  return flagPath;
}

function main() {
  // post-checkout args: prev HEAD, new HEAD, flag (1 = branch checkout).
  const branchCheckout = process.argv[4] === '1';
  const evaluation = evaluateTripwire({ cwd: process.cwd(), branchCheckout });

  if (evaluation.status === 'config-unreadable') {
    process.stderr.write(`checkout-tripwire: protected-checkout config unreadable (${evaluation.error}); cannot evaluate the pin\n`);
    process.exit(0);
  }
  if (evaluation.status !== 'off-pin') process.exit(0);

  try {
    const flagPath = writeTripwireFlag(evaluation);
    process.stderr.write(
      `checkout-tripwire: PROTECTED CHECKOUT ${evaluation.repoRoot} moved off its pin ` +
      `(${evaluation.pinnedBranch} -> ${evaluation.branch}); First Responder flag written to ${flagPath}. ` +
      `Agent flows never switch a protected checkout — use a registered worktree. ` +
      `Preflight will fail every launch until the checkout is back on its pin or the owner updates the pin.\n`,
    );
  } catch (error) {
    process.stderr.write(`checkout-tripwire: could not write handoff flag: ${error}\n`);
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    // A crashing tripwire must not brick the owner's git.
    process.stderr.write(`checkout-tripwire: internal error: ${error}\n`);
    process.exit(0);
  }
}
