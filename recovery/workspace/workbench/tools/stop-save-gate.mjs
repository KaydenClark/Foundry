#!/usr/bin/env node
// S-017 TK-001/TK-005 - Git-mutation-free Stop save-gate hook.
//
// Runs on the harness `Stop` event. It reads Git ground truth for the stopping
// agent's working directory and decides whether the agent is finishing with
// unsaved (dirty tree) or unpushed (ahead of / missing upstream) work.
//
// Contract (S-017):
//   * GIT-MUTATION-FREE. This script runs no add/commit/push/checkout. Its only
//     write is appending/refreshing one handoff flag. The current default flag
//     is tracked inside WORKSPACE and can therefore dirty a judged WORKSPACE checkout;
//     S-017 TK-006 owner-gates the durable out-of-repository location/lifecycle.
//   * Flag-and-block once, then respond. On detection it refreshes an idempotent
//     flag and (unless this stop is already a hook continuation) blocks the stop
//     with a checkpoint instruction. If `stop_hook_active` is true it does not
//     re-block — it leaves the flag for First Responder and allows the stop.
//   * Fail closed on indeterminate Git state; allow a non-repository path; allow
//     (and log) on an internal crash so a buggy gate never bricks every stop.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot } from './workspace-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The tools lane moved under `workbench/`, so one `..` from this script now
// lands in the workbench, not the workspace. Resolve the repository root.
const WORKSPACE_ROOT = findRepoRoot(SCRIPT_DIR);
const MAX_SAMPLE_PATHS = 10;

export function defaultHandoffDir() {
  return (
    process.env.FIRST_RESPONDER_HANDOFF_DIR ||
    path.join(WORKSPACE_ROOT, 'Scheduled', 'Captain', 'handoffs')
  );
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trimEnd();
}

function nearestGitMarker(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function slug(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unknown';
}

// Pure evaluation of Git ground truth. Never mutates anything.
// Returns one of:
//   { status: 'not-a-repo' }
//   { status: 'clean',   repoRoot, branch, headSha }
//   { status: 'unsaved', repoRoot, branch, headSha, dirtyCount, samplePaths, aheadCount, upstream, reasons }
//   { status: 'unknown', repoRoot?, error }
export function evaluateSaveGate({ cwd } = {}) {
  const workingDir = cwd || process.cwd();

  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel'], workingDir);
  } catch (error) {
    const markerRoot = nearestGitMarker(workingDir);
    if (markerRoot) {
      return {
        status: 'unknown',
        gitState: 'unknown',
        repoRoot: markerRoot,
        error: String(error && error.message || error),
      };
    }
    // No repository marker and Git cannot resolve a worktree: nothing to gate.
    return { status: 'not-a-repo' };
  }

  try {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
    const headSha = git(['rev-parse', 'HEAD'], repoRoot);

    const porcelain = git(['status', '--porcelain'], repoRoot);
    const dirtyLines = porcelain ? porcelain.split('\n').filter(Boolean) : [];
    // Sanitized: paths only, bounded, no diff content.
    const samplePaths = dirtyLines
      .slice(0, MAX_SAMPLE_PATHS)
      .map((line) => line.slice(3).trim());

    let upstream = null;
    let aheadCount = 0;
    let behindCount = 0;
    try {
      upstream = git(
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        repoRoot,
      );
    } catch {
      upstream = null; // No upstream configured: cannot confirm pushed.
    }
    if (upstream) {
      const [behindRaw, aheadRaw] = git(
        ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
        repoRoot,
      ).split(/\s+/);
      behindCount = Number(behindRaw);
      aheadCount = Number(aheadRaw);
      if (!Number.isInteger(behindCount) || !Number.isInteger(aheadCount)) {
        throw new Error('Git returned invalid ahead/behind counts');
      }
    }

    let gitState = 'clean';
    if (!upstream) gitState = 'missing-upstream';
    else if (aheadCount > 0 && behindCount > 0) gitState = 'diverged';
    else if (aheadCount > 0) gitState = 'ahead';
    else if (behindCount > 0) gitState = 'behind';
    else if (dirtyLines.length > 0) gitState = 'dirty';

    const reasons = [];
    if (dirtyLines.length > 0) {
      reasons.push(`${dirtyLines.length} uncommitted change(s)`);
    }
    if (gitState === 'diverged') {
      reasons.push(
        `branch diverged from ${upstream}: ${aheadCount} local-only and ${behindCount} upstream-only commit(s)`,
      );
    } else if (gitState === 'ahead') {
      reasons.push(`${aheadCount} unpushed commit(s) ahead of ${upstream}`);
    }
    if (!upstream) {
      reasons.push('branch has no upstream; cannot confirm work is pushed');
    }

    if (reasons.length === 0) {
      return {
        status: 'clean',
        gitState,
        repoRoot,
        branch,
        headSha,
        dirtyCount: 0,
        samplePaths: [],
        aheadCount,
        behindCount,
        upstream,
      };
    }
    return {
      status: 'unsaved',
      gitState,
      repoRoot,
      branch,
      headSha,
      dirtyCount: dirtyLines.length,
      samplePaths,
      aheadCount,
      behindCount,
      upstream,
      reasons,
    };
  } catch (error) {
    // A real repository whose state cannot be read: fail closed.
    return {
      status: 'unknown',
      gitState: 'unknown',
      repoRoot,
      error: String(error && error.message || error),
    };
  }
}

export function flagPathFor(evaluation, handoffDir = defaultHandoffDir()) {
  const repoSlug = slug(evaluation.repoRoot || 'unknown-repo');
  const branchSlug = slug(evaluation.branch || 'unknown-branch');
  return path.join(
    handoffDir,
    `first-responder-save-gate--${repoSlug}--${branchSlug}.md`,
  );
}

// Idempotent per (repoRoot, branch): refresh one flag, preserving first-seen.
export function writeHandoffFlag(evaluation, opts = {}) {
  const handoffDir = opts.handoffDir || defaultHandoffDir();
  const now = opts.now || new Date().toISOString();
  const sessionId = opts.sessionId || 'unknown';
  const escalated = Boolean(opts.escalated);

  if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });
  const flagPath = flagPathFor(evaluation, handoffDir);

  let firstDetectedAt = now;
  if (existsSync(flagPath)) {
    const prior = readFileSync(flagPath, 'utf8');
    const m = prior.match(/^- \*\*First detected:\*\* (.+)$/m);
    if (m) firstDetectedAt = m[1].trim();
  }

  const reasons = evaluation.reasons || [
    evaluation.status === 'unknown' ? 'indeterminate Git state' : 'unsaved work',
  ];
  const sample = (evaluation.samplePaths || [])
    .map((p) => `  - \`${p}\``)
    .join('\n');

  const body = `# First Responder handoff: save-gate

> Written by the Git-mutation-free \`Stop\` save-gate hook (S-017). This records a
> ground-truth failure state for a First Responder to stabilize. It contains no
> diff content and no credentials — paths and counts only.

- **Type:** save-gate
- **Status:** ${evaluation.status}
- **Git state:** ${evaluation.gitState || 'unknown'}
- **Repository:** \`${evaluation.repoRoot || 'unknown'}\`
- **Branch:** \`${evaluation.branch || 'unknown'}\`
- **Head SHA:** \`${evaluation.headSha || 'unknown'}\`
- **Uncommitted changes:** ${evaluation.dirtyCount ?? 'unknown'}
- **Unpushed commits:** ${evaluation.aheadCount ?? 'unknown'}${evaluation.upstream ? ` (upstream \`${evaluation.upstream}\`)` : ' (no upstream)'}
- **Upstream-only commits:** ${evaluation.behindCount ?? 'unknown'}
- **First detected:** ${firstDetectedAt}
- **Last detected:** ${now}
- **Escalated past block (loop guard):** ${escalated ? 'yes' : 'no'}
- **Stopping session:** \`${sessionId}\`

## Reasons

${reasons.map((r) => `- ${r}`).join('\n')}
${sample ? `\n## Sample changed paths\n\n${sample}\n` : ''}
## First Responder action

Stabilize the recovery boundary for this repository. Do not assume changed paths
belong to the stopping agent; establish provenance and ownership before making a
truthful checkpoint commit and push (per AGENTS.md). Return a receipt, or
escalate to a Combat Medic if this is more than a stabilize. Preserve this flag
and reference it in the receipt pending the owner-gated TK-006 lifecycle decision.
`;

  writeFileSync(flagPath, body, 'utf8');
  return flagPath;
}

export function checkpointReason(evaluation) {
  const reasons = (evaluation.reasons || ['unsaved work']).join('; ');
  return (
    `Save-gate: this repository contains work that is not safely recorded — ${reasons}. ` +
    `Establish provenance and ownership for changed paths, then per AGENTS.md make a ` +
    `truthful checkpoint commit and push before finishing ` +
    `(completed work: commit + push; incomplete work: a truthful checkpoint commit + push). ` +
    `A First Responder handoff flag was recorded in Scheduled/Captain/handoffs/.`
  );
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let input = {};
  try {
    const raw = readStdin();
    if (raw && raw.trim()) input = JSON.parse(raw);
  } catch {
    input = {};
  }

  const cwd = input.cwd || process.cwd();
  const stopHookActive = input.stop_hook_active === true;
  const sessionId = input.session_id;

  const evaluation = evaluateSaveGate({ cwd });

  if (evaluation.status === 'not-a-repo' || evaluation.status === 'clean') {
    process.exit(0); // Nothing to gate.
  }

  // status is 'unsaved' or 'unknown': record the flag, then decide block vs allow.
  const escalated = stopHookActive; // second stop still unsaved -> hand off, don't loop
  try {
    writeHandoffFlag(evaluation, { sessionId, escalated });
  } catch (error) {
    process.stderr.write(`save-gate: could not write handoff flag: ${error}\n`);
  }

  if (stopHookActive) {
    // Loop guard: we already blocked once. Leave the flag for First Responder.
    process.exit(0);
  }

  const reason =
    evaluation.status === 'unknown'
      ? `Save-gate could not verify this repository's recovery boundary (indeterminate Git state). ` +
        `Confirm the working tree is clean and pushed before finishing. A First Responder ` +
        `handoff flag was recorded.`
      : checkpointReason(evaluation);

  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

// Only run the CLI when invoked directly, not when imported by the test.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    // A crashing gate must not brick every agent stop.
    process.stderr.write(`save-gate: internal error, allowing stop: ${error}\n`);
    process.exit(0);
  }
}
