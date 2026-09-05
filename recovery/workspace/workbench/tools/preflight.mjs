#!/usr/bin/env node
// S-023 TK-001/TK-008/TK-010 - Read-only launch preflight.
//
// A sitrep reads the logbook; this runs the engines. Before an agent executes
// a claimed task with side effects, preflight verifies live ground truth:
//   (a) the resolved push destination is not main/master,
//   (b) branch/upstream/dirty/diverged state is launchable,
//   (c) no other lane is actively claimed and no fresher branch activity
//       contradicts the target spec's recorded state,
//   (d) the owning spec's Next gate and Blockers permit launching the target
//       ticket — lifecycle `ready` alone is never sufficient,
//   (e) protected shared checkouts are on their pinned branch,
//   (f) every reference the record offers as proof actually resolves in
//       Actuality — a ticket may not cite evidence that is not there.
//
// Contract (S-023):
//   * READ-ONLY. No git mutation, no file edits, optional index locks off.
//     The only output is a pass/fail report with named failures.
//   * FAIL CLOSED. Any check that cannot be evaluated (unreadable repo,
//     unresolvable push target, missing spec, malformed config) is a failure,
//     never a skip.
//   * TWO BANDS (TK-008). A failure is either `blocking` — a real owner gate,
//     an unresolvable tree, a moved pin — or `reconcilable`: the record is
//     contradicted by verifiable source, so the answer is to go look and
//     update the record, not to stop and wait for Kayden. Before TK-008 both
//     produced the same halt, so a stale projection was indistinguishable
//     from an owner gate and stalled S-024 TK-005 for eight hours.
//   * Exit 0 when every check passes; exit 3 when only reconcilable failures
//     remain; exit 1 when anything blocking fails; exit 2 on usage errors.
//     Callers testing `status !== 0` keep their old meaning.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateJobOrderWorkspace } from './job-order-workspace.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const PROTECTED_BRANCHES = new Set(['main', 'master']);

// Checks whose failure means "the record disagrees with source" rather than
// "you may not launch". Everything not listed here is blocking. Membership is
// deliberately small and explicit: a check earns the reconcilable band only
// when an agent, acting alone and read-only, can settle it by looking at
// Actuality. Anything needing Kayden's judgement stays blocking.
const RECONCILABLE_CHECKS = new Set([
  'spec-branch-activity-fresher',
  'stale-blocker',
  'proof-dangling',
]);

function bandOf(check) {
  return RECONCILABLE_CHECKS.has(check) ? 'reconcilable' : 'blocking';
}

function classify(failures) {
  return failures.map((failure) => ({ ...failure, band: failure.band ?? bandOf(failure.check) }));
}

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    shell: false,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result.stdout.trim();
}

// ---- spec parsing (mirrors spec-workbench.mjs, read-only subset) ----------

function sectionOf(content, title) {
  const match = content.split(new RegExp(`^## ${title}$`, 'm'))[1];
  if (match === undefined) return null;
  return match.split(/^## /m)[0];
}

function markdownTableCells(line) {
  const cells = [];
  let cell = '';
  for (let index = 1; index < line.length - 1; index += 1) {
    const character = line[index];
    if (character === '|') {
      let escapes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) escapes += 1;
      if (escapes % 2 === 0) {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
    }
    cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

export function parseBlockerCell(value) {
  const raw = (value ?? '').trim();
  if (isNone(raw)) return { dependencies: [], residual: false };

  const dependencies = [];
  const seen = new Set();
  let remaining = raw;
  while (remaining.length > 0) {
    const identity = remaining.match(/^S-(\d{3})\/(TK-\d{3})/);
    if (!identity) return { dependencies: [], residual: true };
    const dependency = {
      specId: `S-${identity[1]}`,
      ticketId: identity[2],
      identity: `S-${identity[1]}/${identity[2]}`,
    };
    if (seen.has(dependency.identity)) return { dependencies: [], residual: true };
    seen.add(dependency.identity);
    dependencies.push(dependency);
    remaining = remaining.slice(identity[0].length);
    if (remaining.length === 0) break;

    const separator = remaining.match(/^(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*|\s*\\\|\s*)/);
    if (!separator) return { dependencies: [], residual: true };
    remaining = remaining.slice(separator[0].length);
    if (remaining.length === 0) return { dependencies: [], residual: true };
  }

  return { dependencies, residual: dependencies.length === 0 };
}

export function parsePreflightSpecFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fields = {};
  for (const match of content.matchAll(/^\*\*([^*]+):\*\*\s*(.+)$/gm)) {
    fields[match[1].trim()] = match[2].trim();
  }
  const id = fields['Spec ID'];
  if (!id || !/^S-\d{3}$/.test(id)) throw new Error(`${filePath} has an invalid or missing Spec ID`);
  const slicesSection = sectionOf(content, 'Vertical Implementation Slices');
  const tickets = [];
  for (const line of (slicesSection ?? '').split('\n')) {
    if (!/^\|\s*TK-\d+\s*\|/.test(line)) continue;
    const cells = markdownTableCells(line);
    if (![5, 8].includes(cells.length)) throw new Error(`${id} has a malformed ticket row`);
    const ticket = cells.length === 5
      ? { id: cells[0], slice: cells[1], status: cells[2], blockers: cells[3], proof: cells[4] }
      : { id: cells[0], fuid: cells[1], slice: cells[2], status: cells[3], blockers: cells[4], created: cells[5], lastWorked: cells[6], proof: cells[7] };
    ticket.blockerParse = parseBlockerCell(ticket.blockers);
    tickets.push(ticket);
  }
  return {
    id,
    status: fields.Status ?? null,
    fuid: fields.FUID ?? null,
    created: fields.Created ?? null,
    lastWorked: fields['Last worked'] ?? null,
    updated: fields['Last worked'] ?? fields.Updated ?? null,
    blockers: fields.Blockers ?? null,
    nextGate: fields['Next gate'] ?? null,
    tickets,
  };
}

function loadSpecs(root) {
  const specsRoot = path.join(root, 'specs');
  if (!fs.existsSync(specsRoot)) return [];
  const specs = [];
  for (const entry of fs.readdirSync(specsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(specsRoot, entry.name, 'SPEC.md');
    if (fs.existsSync(filePath)) specs.push(parsePreflightSpecFile(filePath));
  }
  return specs;
}

function isNone(value) {
  return /^(none|n\/a)[.]?$/i.test((value ?? '').trim());
}

function ticketMentions(text) {
  return [...(text ?? '').matchAll(/TK-\d+/g)].map((m) => m[0]);
}

function dependencyTicket(specs, dependency) {
  return specs.find((item) => item.id === dependency.specId)
    ?.tickets.find((ticket) => ticket.id === dependency.ticketId) ?? null;
}

function unresolvedDependencies(specs, blockerParse) {
  return blockerParse.dependencies.filter((dependency) =>
    dependencyTicket(specs, dependency)?.status !== 'done');
}

// ---- what this spec points at (TK-008) ------------------------------------
//
// Before TK-008 the staleness check matched only refs whose *name* contained
// the spec id. WORKSPACE names branches after the topic (`claude/vendor-forge`,
// `claude/foundry-canon-refresh`), never after the spec, so the pattern
// matched nothing and the check was inert. Three sources now feed it: the
// spec id, every ticket id, and every branch-shaped token the spec itself
// names in prose or in a Proof cell.

function idPattern(prefix, id) {
  const number = id.replace(/^[A-Za-z]+-?/, '').replace(/^0+/, '');
  return new RegExp(`(^|[^a-z0-9])${prefix}-?0*${number}([^0-9]|$)`);
}

// Shared trunks are named in nearly every spec, so matching them literally
// would fire on every spec forever and train readers to ignore the band.
// They are still reachable through the spec/ticket id patterns.
const TRUNK_REFS = new Set([
  'main', 'master', 'integration', 'HEAD',
  'origin/main', 'origin/master', 'origin/integration', 'origin/HEAD',
]);

function isBranchLike(token) {
  if (!token.includes('/') || token.endsWith('/')) return false;
  if (/[^A-Za-z0-9._/-]/.test(token)) return false;
  const last = token.slice(token.lastIndexOf('/') + 1);
  return !/\.[A-Za-z0-9]{1,5}$/.test(last);
}

// A branch-shaped backticked token: has a slash, no whitespace, and its last
// segment carries no file extension (`claude/vendor-forge` yes,
// `tools/test-foundry.mjs` no, `tools/socket-registry/` no).
function branchLikeTokens(text) {
  const tokens = new Set();
  for (const match of (text ?? '').matchAll(/`([^`\s]+)`/g)) {
    const token = match[1];
    if (isBranchLike(token) && !TRUNK_REFS.has(token)) tokens.add(token);
  }
  return tokens;
}

function specText(target) {
  return [
    target.blockers ?? '',
    target.nextGate ?? '',
    ...target.tickets.flatMap((t) => [t.slice ?? '', t.blockers ?? '', t.proof ?? '']),
  ].join('\n');
}

// Every ref name this spec should be considered "about".
//
// A ticket id alone is NOT enough: almost every spec has a TK-005, so
// matching `claude/tk005-land` against all of them reported the same ref on
// fifteen specs and buried the real findings. A ticket id counts only when
// the ref also carries this spec's id (`codex/s024-tk005`). Spec-specific
// signal otherwise comes from the spec id, from branches the spec names in
// its own prose, and from the stale-blocker and proof checks.
export function referencedRefs(target) {
  const specPattern = idPattern('s', target.id);
  const ticketPatterns = target.tickets.map((ticket) => idPattern('tk', ticket.id));
  return {
    patterns: [specPattern],
    qualifiedPatterns: ticketPatterns.map((ticketPattern) => ({ specPattern, ticketPattern })),
    literals: branchLikeTokens(specText(target)),
  };
}

function refIsReferenced(refName, { patterns, qualifiedPatterns = [], literals }) {
  const lower = refName.toLowerCase();
  if (patterns.some((pattern) => pattern.test(lower))) return true;
  if (qualifiedPatterns.some(({ specPattern, ticketPattern }) =>
    specPattern.test(lower) && ticketPattern.test(lower))) return true;
  if (literals.has(refName)) return true;
  // `origin/claude/x` should match a spec that names `claude/x`.
  const withoutRemote = refName.includes('/') ? refName.slice(refName.indexOf('/') + 1) : refName;
  return literals.has(withoutRemote);
}

function resolvedTimeZone(timeZone) {
  const candidate = timeZone ?? process.env.TZ
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(0);
    return candidate;
  } catch {
    return null;
  }
}

function localDateFor(epoch, timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch * 1000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

// Enumerate the exact ref set used by staleRefFailures once and expose the
// same structured facts to Preflight JSON. Selection remains unchanged:
// referencedRefs + refIsReferenced are still the only matching rules.
export function collectFreshnessRefs(
  target,
  repos,
  { timeZone = null, gitRunner = git } = {},
) {
  const selectedTimeZone = resolvedTimeZone(timeZone);
  const records = [];
  const errors = [];
  if (!selectedTimeZone) {
    return {
      timeZone: timeZone ?? null,
      records,
      errors: [{
        check: 'freshness-ref-unevaluable',
        detail: 'workspace timezone is missing or invalid; freshness ref dates cannot be evaluated',
      }],
    };
  }

  const referenced = referencedRefs(target);
  const format = [
    '%(refname)',
    '%(refname:short)',
    '%(objectname)',
    '%(committerdate:unix)',
    '%(symref)',
    '%(committerdate:iso-strict)',
  ].join('%09');

  for (const [repoIndex, repoPath] of repos.entries()) {
    const output = gitRunner(
      repoPath,
      ['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes'],
      { allowFailure: true },
    );
    if (output === null) {
      errors.push({
        check: 'freshness-ref-unevaluable',
        repoIndex,
        detail: `repository input ${repoIndex} ref enumeration could not be read`,
      });
      continue;
    }

    for (const line of output.split('\n').filter(Boolean)) {
      const fields = line.split('\t');
      if (fields.length !== 6) {
        errors.push({
          check: 'freshness-ref-unevaluable',
          repoIndex,
          detail: `repository input ${repoIndex} returned malformed ref metadata`,
        });
        continue;
      }
      const [fullRef, shortRef, objectSha, epochText, symref, committerIso] = fields;
      const localPrefix = 'refs/heads/';
      const remotePrefix = 'refs/remotes/';
      const refClass = fullRef.startsWith(localPrefix)
        ? 'local'
        : fullRef.startsWith(remotePrefix) ? 'remote-tracking' : null;
      const derivedShortRef = refClass === 'local'
        ? fullRef.slice(localPrefix.length)
        : refClass === 'remote-tracking' ? fullRef.slice(remotePrefix.length) : null;

      // Preserve the old matching boundary: unrelated refs are ignored. A
      // selected ref, however, must be completely evaluable or fail closed.
      if (!derivedShortRef || !refIsReferenced(derivedShortRef, referenced)) continue;
      const committerEpoch = Number(epochText);
      const valid = refClass
        && shortRef === derivedShortRef
        && !symref
        && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectSha)
        && /^\d+$/.test(epochText)
        && Number.isSafeInteger(committerEpoch)
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(committerIso)
        && Number.isFinite(Date.parse(committerIso));
      if (!valid) {
        errors.push({
          check: 'freshness-ref-unevaluable',
          repoIndex,
          detail: `repository input ${repoIndex} selected ref metadata is symbolic, malformed, or unevaluable`,
        });
        continue;
      }

      records.push({
        repoIndex,
        fullRef,
        shortRef,
        objectSha,
        committerEpoch,
        committerIso,
        refClass,
        findingCode: 'spec-branch-activity-fresher',
        localDate: localDateFor(committerEpoch, selectedTimeZone),
      });
    }
  }

  return { timeZone: selectedTimeZone, records, errors };
}

// ---- proof references (TK-008) --------------------------------------------
//
// A Proof cell cites commits and paths. `done` is a claim about Actuality;
// this is the cheapest deterministic way to test that claim rather than
// believe the table.

export function proofReferences(cell) {
  const commits = new Set();
  const paths = new Set();
  const refs = new Set();
  if (!cell || isNone(cell) || cell.trim() === '—') return { commits, paths, refs };
  for (const match of cell.matchAll(/`([^`\s]+)`/g)) {
    const token = match[1].replace(/[.,;:]+$/, '');
    if (/^[0-9a-f]{7,40}$/i.test(token)) commits.add(token);
    // A branch name has a slash and no extension — it is a ref, not a file.
    // Treating `claude/vendor-forge` as a path made every branch-citing
    // ticket look like dangling proof.
    else if (isBranchLike(token)) refs.add(token);
    else if (token.includes('/') || /\.[A-Za-z0-9]{1,5}$/.test(token)) {
      paths.add(token.replace(/:\d+$/, '').replace(/\/$/, ''));
    }
  }
  return { commits, paths, refs };
}

function commitExists(repos, sha) {
  return repos.some((repo) => git(repo, ['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }) !== null);
}

// Cited paths are written relative to whichever repo the author had in mind
// (`tools/test-foundry.mjs` in one repo is `forge/tools/test-foundry.mjs` in
// another), and are often abbreviated to a bare filename. A suffix match
// against tracked files finds the real file without demanding the author
// guess the reader's root. Only a path found nowhere counts as dangling.
function pathExists(root, repos, candidate) {
  const expanded = candidate.startsWith('~/')
    ? path.join(os.homedir(), candidate.slice(2))
    : candidate;
  if (path.isAbsolute(expanded)) return fs.existsSync(expanded);
  const bases = [root, ...repos];
  if (bases.some((base) => fs.existsSync(path.join(base, expanded)))) return true;
  // `--cached --others` without `--exclude-standard` so generated-but-real
  // artifacts cited as proof still count; a tracked-files-only search would
  // incorrectly call any ignored receipt dangling.
  return bases.some((base) => {
    const hit = git(base, ['ls-files', '--cached', '--others', '--', `*${expanded}`], { allowFailure: true });
    return typeof hit === 'string' && hit !== '';
  });
}


// ---- checks ---------------------------------------------------------------

// (a) + (b): per-repo push destination and tree state.
export function checkRepo(repoPath, { pushTo = null } = {}) {
  const failures = [];
  const notes = [];
  const report = { path: repoPath };

  let top = null;
  try {
    top = git(repoPath, ['rev-parse', '--show-toplevel'], { allowFailure: true });
  } catch {
    top = null;
  }
  if (!top) {
    failures.push({ check: 'unreadable-repo', detail: `${repoPath} is not a readable Git repository` });
    return { report, failures, notes };
  }
  report.toplevel = top;

  const branch = git(top, ['branch', '--show-current'], { allowFailure: true });
  if (!branch) {
    failures.push({ check: 'detached-head', detail: `${top} is on a detached HEAD; launches need a named branch` });
    return { report, failures, notes };
  }
  report.branch = branch;

  // (a) Where would a push actually land? Ground truth, not assumption.
  // An inherited main/master upstream is itself the prohibited shape — with
  // push.default=upstream (as the root repo uses) it is exactly how the
  // 2026-07-25 push reached remote main.
  const branchOf = (ref) => (ref.includes('/') ? ref.slice(ref.indexOf('/') + 1) : ref);
  const upstreamRef = git(top, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
  if (upstreamRef && PROTECTED_BRANCHES.has(branchOf(upstreamRef))) {
    failures.push({
      check: 'push-target-protected',
      detail: `${branch} inherited upstream ${upstreamRef} — the 2026-07-25 failure shape; a push from here can land on ${branchOf(upstreamRef)}; recreate the branch with --no-track`,
    });
  }
  if (pushTo) {
    report.pushDestination = pushTo;
    if (git(top, ['check-ref-format', '--branch', pushTo], { allowFailure: true }) === null) {
      failures.push({ check: 'push-target-unresolvable', detail: `declared destination ${pushTo} is not a valid branch name` });
    } else if (PROTECTED_BRANCHES.has(pushTo)) {
      failures.push({ check: 'push-target-protected', detail: `declared push destination is ${pushTo}; agent flows never push to main/master` });
    }
  } else {
    const pushRef = git(top, ['rev-parse', '--abbrev-ref', '@{push}'], { allowFailure: true }) ?? upstreamRef;
    if (!pushRef) {
      failures.push({
        check: 'push-target-unresolvable',
        detail: `${branch} has no resolvable push destination and none was declared; pass --push-to with the explicit refspec destination`,
      });
    } else {
      report.pushDestination = pushRef;
      if (PROTECTED_BRANCHES.has(branchOf(pushRef)) && !(upstreamRef && PROTECTED_BRANCHES.has(branchOf(upstreamRef)))) {
        failures.push({
          check: 'push-target-protected',
          detail: `a push from ${branch} resolves to ${pushRef}; agent flows never push to main/master`,
        });
      }
    }
  }

  // (b) Dirty / diverged state.
  const porcelain = git(top, ['status', '--porcelain', '--untracked-files=all'], { allowFailure: true });
  if (porcelain === null) {
    failures.push({ check: 'dirty-tree', detail: `${top}: working tree state could not be read` });
  } else if (porcelain !== '') {
    const count = porcelain.split('\n').filter(Boolean).length;
    report.dirty = count;
    failures.push({ check: 'dirty-tree', detail: `${top} has ${count} uncommitted change(s); route dirty work to an isolated worktree before launch` });
  } else {
    report.dirty = 0;
  }

  const upstream = upstreamRef;
  if (upstream) {
    report.upstream = upstream;
    const counts = git(top, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`], { allowFailure: true });
    if (counts === null) {
      failures.push({ check: 'diverged', detail: `${top}: ahead/behind state against ${upstream} could not be evaluated` });
    } else {
      const [ahead, behind] = counts.split(/\s+/).map(Number);
      report.ahead = ahead;
      report.behind = behind;
      if (ahead > 0 && behind > 0) {
        failures.push({ check: 'diverged', detail: `${top} is ${ahead} ahead / ${behind} behind ${upstream}; resolve divergence before launch` });
      } else if (behind > 0) {
        notes.push(`${top} is ${behind} behind ${upstream} (fast-forward available)`);
      } else if (ahead > 0) {
        notes.push(`${top} is ${ahead} ahead of ${upstream} (unpushed checkpoint)`);
      }
    }
  } else {
    notes.push(`${top}: no upstream configured for ${branch}`);
  }

  return { report, failures, notes };
}

// (c) + (d): lane collision and owning-spec gate, from fresh spec reads.
export function checkSpecAndLanes(root, {
  spec = null,
  ticket = null,
  repos = [],
  timeZone = null,
} = {}) {
  const failures = [];
  const notes = [];
  const report = {};

  let specs;
  try {
    specs = loadSpecs(root);
  } catch (error) {
    failures.push({ check: 'lane-unevaluable', detail: `spec catalog could not be read: ${error.message}` });
    return { report, failures, notes };
  }

  let target = null;
  let targetTicket = null;
  if (spec) {
    target = specs.find((item) => item.id === spec) ?? null;
    if (!target) {
      failures.push({ check: 'spec-missing', detail: `${spec} was not found under ${path.join(root, 'specs')}` });
    } else {
      // (d) The owning spec's own gates, read fresh.
      if (target.status !== 'active') {
        failures.push({ check: 'spec-not-active', detail: `${spec} status is ${target.status ?? 'unknown'}; only an active spec launches` });
      }
      targetTicket = ticket
        ? target.tickets.find((item) => item.id === ticket) ?? null
        : target.tickets.find((item) => item.status === 'ready') ?? null;
      if (!targetTicket) {
        failures.push({
          check: 'ticket-not-eligible',
          detail: ticket ? `${spec}/${ticket} does not exist` : `${spec} has no ready ticket to launch`,
        });
      } else {
        report.ticket = targetTicket.id;
        if (!['ready', 'in-progress'].includes(targetTicket.status)) {
          failures.push({ check: 'ticket-not-eligible', detail: `${spec}/${targetTicket.id} is ${targetTicket.status}` });
        }
        if (!isNone(targetTicket.blockers)) {
          const blockerParse = targetTicket.blockerParse;
          const unmet = unresolvedDependencies(specs, blockerParse);
          if (blockerParse.residual || unmet.length > 0) {
            failures.push({ check: 'ticket-not-eligible', detail: `${spec}/${targetTicket.id} is blocked: ${targetTicket.blockers}` });
          }
        }
        // Spec-level blockers: a blanket blocker (no ticket named) or one
        // naming the target ticket blocks this launch; blockers scoped to
        // other tickets leave this lane clear.
        if (!isNone(target.blockers)) {
          const mentioned = ticketMentions(target.blockers);
          if (mentioned.length === 0 || mentioned.includes(targetTicket.id)) {
            failures.push({ check: 'spec-blockers-active', detail: `${spec} blockers: ${target.blockers}` });
          }
        }
        // Next gate: met only when it names the target ticket (or is none).
        // "Ready" paperwork never overrides an owner gate — the S-009 lesson.
        if (!isNone(target.nextGate) && !ticketMentions(target.nextGate).includes(targetTicket.id)) {
          failures.push({
            check: 'next-gate-unmet',
            detail: `${spec} Next gate does not authorize ${targetTicket.id}: "${target.nextGate}"`,
          });
        }
      }
    }
  }

  // (c) Active-lane collision: any other in-progress ticket in this root is
  // an occupied writer lane. Resuming the target's own claim is not.
  for (const item of specs) {
    for (const inProgress of item.tickets.filter((entry) => entry.status === 'in-progress')) {
      if (target && item.id === target.id && targetTicket && inProgress.id === targetTicket.id) continue;
      failures.push({
        check: 'active-lane-collision',
        detail: `${item.id}/${inProgress.id} is claimed in-progress; this launch would collide with that lane`,
      });
    }
  }

  // (c) Fresher branch activity contradicting the target spec's record. Any
  // ref this spec is "about" — named for the spec, named for one of its
  // tickets, or named literally in its own prose — carrying commits newer
  // than the Updated day means the record is stale. Reconcilable: go look
  // at the branch and update the table.
  const freshness = target
    ? collectFreshnessRefs(target, repos, { timeZone })
    : { timeZone: resolvedTimeZone(timeZone), records: [], errors: [] };
  if (target) failures.push(...staleRefFailures(target, repos, freshness));

  // (f) Proof references that do not resolve, and blockers already satisfied
  // in Actuality. Both are the record disagreeing with source, so both are
  // reconcilable rather than blocking.
  if (target) {
    failures.push(...proofFailures(root, target, repos, specs));
  }

  return { report, failures, notes, freshness };
}

// Refs the spec points at that moved after its Updated day.
function staleRefFailures(target, repos, collected = null) {
  const failures = [];
  const targetUpdatedDay = target.updated;
  const updatedMs = Date.parse(`${targetUpdatedDay}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetUpdatedDay)
    || !Number.isFinite(updatedMs)
    || new Date(updatedMs).toISOString().slice(0, 10) !== targetUpdatedDay) {
    return [{ check: 'lane-unevaluable', detail: `${target.id} has an unparseable Updated date "${target.updated}"` }];
  }
  const freshness = collected ?? collectFreshnessRefs(target, repos);
  failures.push(...freshness.errors);
  const evaluated = new Set();
  for (const record of freshness.records) {
    const identity = `${record.repoIndex}\0${record.objectSha}`;
    if (evaluated.has(identity)) continue;
    evaluated.add(identity);
    if (record.localDate > targetUpdatedDay) {
      failures.push({
        check: record.findingCode,
        detail: `${record.shortRef} in ${repos[record.repoIndex]} has commits newer than ${target.id}'s recorded Updated (${target.updated}); the spec record is stale`,
      });
    }
  }
  return failures;
}

// Does the record's own evidence hold up?
function proofFailures(root, target, repos, specs = [target]) {
  const failures = [];
  const resolves = new Map(); // fully-qualified ticket id -> did every cited reference resolve?

  for (const item of specs) {
    for (const ticket of item.tickets) {
      const identity = `${item.id}/${ticket.id}`;
      const { commits, paths } = proofReferences(ticket.proof);
      if (commits.size === 0 && paths.size === 0) {
        resolves.set(identity, null); // nothing cited; nothing to verify
        continue;
      }
      // Commits and paths only. A branch name is a moving label that is
      // routinely deleted after merge, so a missing ref proves nothing about
      // whether the work landed — citing one must never read as dangling.
      const missing = [
        ...[...commits].filter((sha) => !commitExists(repos, sha)),
        ...[...paths].filter((candidate) => !pathExists(root, repos, candidate)),
      ];
      resolves.set(identity, missing.length === 0);
      if (item.id === target.id && missing.length > 0 && ticket.status === 'done') {
        failures.push({
          check: 'proof-dangling',
          ticket: ticket.id,
          detail: `${target.id}/${ticket.id} is recorded done but cites proof that does not resolve in any scanned repo: ${missing.join(', ')}${repos.length === 0 ? ' (no --repo was scanned)' : ''}`,
        });
      }
    }
  }

  // A blocker is only real if the thing it names is really unfinished. Two
  // ways it can be bookkeeping rather than reality:
  for (const ticket of target.tickets) {
    if (isNone(ticket.blockers)) continue;
    const blockerParse = ticket.blockerParse;
    if (blockerParse.residual || blockerParse.dependencies.length === 0) continue;

    // (1) The blocking ticket is not recorded done, but its own cited proof
    //     already resolves. This is the S-024 shape.
    for (const dep of blockerParse.dependencies) {
      const blocker = dependencyTicket(specs, dep);
      if (!blocker || blocker.status === 'done') continue;
      if (resolves.get(dep.identity) === true) {
        failures.push({
          check: 'stale-blocker',
          ticket: ticket.id,
          reason: `held by ${dep.identity}, whose own cited proof already resolves — reconcile the record, do not wait`,
          detail: `${target.id}/${ticket.id} is held by ${dep.identity}, but ${dep.identity}'s own cited proof resolves in Actuality; verify and reconcile the record rather than waiting`,
        });
      }
    }

    // (2) Every named blocker is already recorded done, yet the dependent is
    //     still parked at `blocked`. Nothing is holding it — the row was
    //     simply never updated when its dependency closed.
    if (ticket.status === 'blocked'
      && blockerParse.dependencies.every((dep) => dependencyTicket(specs, dep)?.status === 'done')) {
      failures.push({
        check: 'stale-blocker',
        ticket: ticket.id,
        reason: `every named blocker (${ticket.blockers}) is already done; the row was never updated`,
        detail: `${target.id}/${ticket.id} is recorded blocked on ${ticket.blockers}, but every named blocker is already done; the row was never updated`,
      });
    }
  }

  return failures;
}

// (e) Protected shared checkouts pinned.
export function checkProtectedCheckouts(root) {
  const failures = [];
  const notes = [];
  const report = { checkouts: [] };
  const configPath = path.join(root, 'tools', 'protected-checkouts.json');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!Array.isArray(config.checkouts)) {
      throw new Error('expected { checkouts: [] }');
    }
  } catch (error) {
    failures.push({ check: 'protected-config-unreadable', detail: `${configPath}: ${error.message}` });
    return { report, failures, notes };
  }

  for (const entry of config.checkouts) {
    const checkoutPath = path.isAbsolute(entry.path) ? entry.path : path.join(root, entry.path);
    const record = { path: checkoutPath, pinnedBranch: entry.pinnedBranch };
    report.checkouts.push(record);
    let branch = null;
    try {
      branch = git(checkoutPath, ['branch', '--show-current'], { allowFailure: true });
    } catch {
      branch = null;
    }
    if (!branch) {
      failures.push({ check: 'protected-checkout-moved', detail: `${checkoutPath}: branch could not be read (missing repo or detached HEAD)` });
      continue;
    }
    record.branch = branch;
    if (branch !== entry.pinnedBranch) {
      failures.push({
        check: 'protected-checkout-moved',
        detail: `${checkoutPath} is on ${branch}, pinned to ${entry.pinnedBranch}; agent flows never switch a protected checkout — use a registered worktree`,
      });
    }
  }

  return { report, failures, notes };
}

// ---- assembly -------------------------------------------------------------

export function runPreflightChecks({
  root = DEFAULT_ROOT,
  repos = [],
  pushTo = null,
  spec = null,
  ticket = null,
  timeZone = null,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const failures = [];
  const notes = [];
  const repoReports = [];

  for (const repoPath of repos) {
    const outcome = checkRepo(repoPath, { pushTo });
    repoReports.push(outcome.report);
    failures.push(...outcome.failures);
    notes.push(...outcome.notes);
  }

  const lanes = checkSpecAndLanes(resolvedRoot, { spec, ticket, repos, timeZone });
  failures.push(...lanes.failures);
  notes.push(...lanes.notes);

  const protectedOutcome = checkProtectedCheckouts(resolvedRoot);
  failures.push(...protectedOutcome.failures);
  notes.push(...protectedOutcome.notes);

  const banded = classify(failures);
  const blocking = banded.filter((failure) => failure.band === 'blocking');
  const reconcilable = banded.filter((failure) => failure.band === 'reconcilable');

  return {
    pass: banded.length === 0,
    // `pass` authorizes the launch. `reconcile` means nothing bars the launch
    // except a record that disagrees with source: verify, update the record,
    // re-run. `blocked` is the only verdict that waits for the owner.
    verdict: banded.length === 0 ? 'pass' : blocking.length > 0 ? 'blocked' : 'reconcile',
    checkedAt: new Date().toISOString(),
    host: os.hostname(),
    root: resolvedRoot,
    spec: spec ? { id: spec, ticket: lanes.report.ticket ?? ticket ?? null } : null,
    repos: repoReports,
    freshness: lanes.freshness,
    protectedCheckouts: protectedOutcome.report.checkouts,
    failures: banded,
    blocking,
    reconcilable,
    notes,
  };
}

const exactValidationCodes = (validation) => {
  const codes = (validation?.errors ?? [])
    .map((error) => error?.code)
    .filter((code) => typeof code === 'string' && /^[a-z0-9.-]+$/.test(code));
  return [...new Set(codes.length ? codes : ['launch-model-missing'])].sort();
};

export function evaluateExactJobOrder({
  spec = null,
  ticket = null,
  jobOrder = null,
  validation = null,
} = {}) {
  const record = {
    alias: jobOrder,
    revision: null,
    ticket: spec && ticket ? `${spec}/${ticket}` : null,
    launchEligible: false,
  };
  const failures = [];
  if (!spec) failures.push({ check: 'spec-required', detail: 'launch mode requires --spec S-###' });
  if (!ticket) failures.push({ check: 'ticket-required', detail: 'launch mode requires --ticket TK-###' });
  if (!jobOrder) failures.push({ check: 'job-order-required', detail: 'launch mode requires --job-order JO-XXXXXX; ticket inference is non-authorizing' });
  if (failures.length) return { record, failures };

  if (!validation?.ok || !validation.launchModel) {
    const codes = exactValidationCodes(validation);
    failures.push({
      check: 'job-order-not-eligible',
      detail: `${jobOrder} is not exact-order launch eligible (${codes.join(',')})`,
    });
    return { record, failures };
  }

  const model = validation.launchModel;
  record.revision = model.jobOrder?.revision ?? null;
  record.ticket = model.ticket?.alias ?? null;
  record.launchEligible = model.lifecycle?.launchEligible === true;
  const matching = model.schema === 'gpt-os.job-order-launch.v2'
    && model.jobOrder?.alias === jobOrder
    && model.spec?.id === spec
    && model.ticket?.alias === `${spec}/${ticket}`
    && record.launchEligible;
  if (!matching) {
    record.launchEligible = false;
    failures.push({
      check: 'job-order-mismatched',
      detail: `${jobOrder} does not exact-match ${spec}/${ticket} as one launch-eligible normalized order`,
    });
  }
  return { record, failures };
}

export function runPreflight(options = {}) {
  const diagnostic = runPreflightChecks(options);
  const { root = DEFAULT_ROOT, spec = null, ticket = null, jobOrder = null } = options;
  let validation = null;
  if (spec && ticket && jobOrder) {
    try {
      validation = validateJobOrderWorkspace({ root: path.resolve(root), specId: spec, jobOrder });
    } catch {
      validation = { ok: false, errors: [{ code: 'validation.unavailable' }], launchModel: null };
    }
  }
  // ADR-0020: a check may block only the change it evaluates. AGENTS.md scopes
  // Preflight to "work using the Job Order launch procedure" - so a run that
  // names no part of the launch triple is a repository-state report, not an
  // unauthorized launch. Naming *part* of the triple is still a launch request
  // and still fails closed: ticket inference stays non-authorizing.
  const launchRequested = Boolean(spec || ticket || jobOrder);
  const exact = launchRequested
    ? evaluateExactJobOrder({ spec, ticket, jobOrder, validation })
    : { record: { alias: null, revision: null, ticket: null, launchEligible: false }, failures: [] };
  const failures = classify([...diagnostic.failures, ...exact.failures]);
  const blocking = failures.filter((failure) => failure.band === 'blocking');
  const reconcilable = failures.filter((failure) => failure.band === 'reconcilable');
  const verdict = failures.length === 0 ? 'pass' : blocking.length > 0 ? 'blocked' : 'reconcile';
  return {
    ...diagnostic,
    pass: verdict === 'pass',
    verdict,
    jobOrder: exact.record,
    launchRequested,
    launchAuthorized: launchRequested && verdict === 'pass',
    failures,
    blocking,
    reconcilable,
  };
}

// ---- audit mode (TK-008) --------------------------------------------------
//
// The launch gate answers one question about one ticket. The audit answers
// two questions about every ticket: is it really blocked, and do we have what
// we need to finish it? It reads Canon and Actuality rather than trusting the
// projection, and it never authorizes anything — a launch still goes through
// runPreflight.

const OWNER_MARKERS = /kayden-only|kayden-reserved|owner-gated|grill first|owner command/i;

export function auditSpecs({ root = DEFAULT_ROOT, repos = [], spec = null } = {}) {
  const resolvedRoot = path.resolve(root);
  let specs;
  try {
    specs = loadSpecs(resolvedRoot);
  } catch (error) {
    return { error: `spec catalog could not be read: ${error.message}`, specs: [] };
  }
  const scope = specs
    .filter((item) => (spec ? item.id === spec : item.status === 'active'))
    .sort((a, b) => a.id.localeCompare(b.id));

  const audited = scope.map((target) => {
    const staleRefs = staleRefFailures(target, repos);
    const proof = proofFailures(resolvedRoot, target, repos, specs);
    const staleBlockers = new Map(
      proof.filter((f) => f.check === 'stale-blocker').map((f) => [f.ticket, f.reason]),
    );
    const dangling = new Set(
      proof.filter((f) => f.check === 'proof-dangling').map((f) => f.ticket),
    );
    const gateNames = ticketMentions(target.nextGate);

    const tickets = target.tickets.map((ticket) => {
      const ownerGated = OWNER_MARKERS.test(`${ticket.slice} ${ticket.blockers}`);
      const blockerParse = ticket.blockerParse;
      const unmet = unresolvedDependencies(specs, blockerParse);
      const opaqueBlocker = !isNone(ticket.blockers) && blockerParse.residual;
      const { commits, paths, refs } = proofReferences(ticket.proof);
      const proofCited = commits.size + paths.size + refs.size;

      let verdict;
      let because;
      if (dangling.has(ticket.id)) {
        verdict = 'proof-dangling';
        because = 'recorded done, but its cited proof does not resolve in any scanned repo';
      } else if (staleBlockers.has(ticket.id)) {
        verdict = 'blocked-stale';
        because = staleBlockers.get(ticket.id);
      } else if (ownerGated && ticket.status !== 'done') {
        verdict = 'owner-gated';
        because = 'the slice or blocker text reserves this to Kayden; only an Owner Command clears it';
      } else if (['ready', 'in-progress'].includes(ticket.status) && unmet.length === 0 && !opaqueBlocker) {
        verdict = gateNames.length === 0 || gateNames.includes(ticket.id) ? 'launchable' : 'gate-elsewhere';
        because = verdict === 'launchable'
          ? 'blockers satisfied and the Next gate authorizes it'
          : `blockers satisfied, but Next gate names ${gateNames.join(', ')}`;
      } else if (ticket.status === 'done') {
        verdict = 'done';
        because = proofCited > 0 ? 'proof resolves in Actuality' : 'no machine-checkable proof cited';
      } else if (ticket.status === 'deferred') {
        // Deferred is a decision, not a block. Saying "BLOCKED" here invents
        // an obstacle that nobody is waiting on.
        verdict = 'deferred';
        because = isNone(ticket.blockers)
          ? 'deliberately deferred; no obstacle to clear'
          : `deliberately deferred — ${ticket.blockers}`;
      } else if (unmet.length > 0) {
        verdict = 'blocked-verified';
        because = `held by ${unmet.map((dependency) => dependency.identity).join(', ')}, which ${unmet.length === 1 ? 'is' : 'are'} not done`;
      } else if (opaqueBlocker) {
        // The blockers cell is prose, not a ticket reference. No tool can
        // settle it; say so plainly instead of guessing.
        verdict = 'blocked-unverifiable';
        because = `held by a condition no tool can check: "${ticket.blockers}"`;
      } else {
        verdict = 'unevaluable';
        because = `status "${ticket.status}" with no reachable evidence either way`;
      }

      return {
        id: ticket.id,
        status: ticket.status,
        blockers: ticket.blockers,
        verdict,
        because,
        ownerGated,
        proofCited,
      };
    });

    return {
      id: target.id,
      status: target.status,
      updated: target.updated,
      nextGate: target.nextGate,
      staleRefs: staleRefs.map((f) => f.detail),
      tickets,
    };
  });

  return { checkedAt: new Date().toISOString(), root: resolvedRoot, specs: audited };
}

// ---- CLI ------------------------------------------------------------------

function usage() {
  return [
    'usage: preflight.mjs [--root PATH] [--repo PATH ...] [--push-to BRANCH]',
    '                     [--spec S-### --ticket TK-### --job-order JO-XXXXXX]',
    '                     [--audit] [--json]',
    '',
    'Read-only launch preflight (S-023).',
    '',
    '  exit 0  every check passed; the launch is authorized',
    '  exit 3  only reconcilable failures remain — the record disagrees with',
    '          source. Go verify and update the record; do not wait on Kayden.',
    '  exit 1  something blocking failed; this is an owner report, never a',
    '          warning to scroll past',
    '  exit 2  usage error',
    '',
    'Launch mode requires the exact --spec, --ticket, and --job-order triple.',
    'A ticket-only launch fails job-order-required and authorizes nothing.',
    '',
    'Naming no part of the triple runs the repository-state checks only. That',
    'report authorizes nothing and never claims a launch; per ADR-0020 it may',
    'not be wired into a release gate.',
    '',
    '--audit diagnoses every ticket instead of gating one launch: is each',
    'ticket really blocked, and is its cited proof actually there? Audit is a',
    'diagnostic and never authorizes execution.',
  ].join('\n');
}

function auditLine(ticket) {
  const mark = {
    launchable: 'READY',
    done: 'done',
    deferred: 'deferred',
    'blocked-verified': 'BLOCKED',
    'blocked-unverifiable': 'BLOCKED?',
    'blocked-stale': 'STALE',
    'proof-dangling': 'DANGLING',
    'owner-gated': 'OWNER',
    'gate-elsewhere': 'gated',
    unevaluable: 'UNKNOWN',
  }[ticket.verdict] ?? ticket.verdict;
  return `    ${mark.padEnd(9)} ${ticket.id} (recorded ${ticket.status}) — ${ticket.because}`;
}

function printAudit(audit) {
  if (audit.error) {
    process.stderr.write(`FAIL - audit-unevaluable: ${audit.error}\n`);
    return 1;
  }
  let reconcilable = 0;
  for (const spec of audit.specs) {
    process.stdout.write(`\n${spec.id} (updated ${spec.updated})\n`);
    process.stdout.write(`  next gate: ${spec.nextGate ?? 'none'}\n`);
    for (const detail of spec.staleRefs) {
      reconcilable += 1;
      process.stdout.write(`    STALE     ${detail}\n`);
    }
    for (const ticket of spec.tickets) {
      if (['blocked-stale', 'proof-dangling'].includes(ticket.verdict)) reconcilable += 1;
      process.stdout.write(`${auditLine(ticket)}\n`);
    }
  }
  process.stdout.write(reconcilable === 0
    ? '\nok - audit found no record/source disagreement\n'
    : `\nRECONCILE - ${reconcilable} finding(s) where the record disagrees with source; verify each against Actuality and update the record\n`);
  return reconcilable === 0 ? 0 : 3;
}

function parseArgs(argv) {
  const options = { repos: [] };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg !== '--repo') {
      if (seen.has(arg)) throw new Error(`duplicate argument ${arg}`);
      seen.add(arg);
    }
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[i];
    };
    if (arg === '--root') options.root = next();
    else if (arg === '--repo') options.repos.push(next());
    else if (arg === '--push-to') options.pushTo = next();
    else if (arg === '--spec') options.spec = next();
    else if (arg === '--ticket') options.ticket = next();
    else if (arg === '--job-order') options.jobOrder = next();
    else if (arg === '--json') options.json = true;
    else if (arg === '--audit') options.audit = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (options.spec && !/^S-\d{3}$/.test(options.spec)) throw new Error('--spec expects S-###');
  if (options.ticket && !/^TK-\d+$/.test(options.ticket)) throw new Error('--ticket expects TK-###');
  if (options.jobOrder && !/^JO-[0-9A-Z]{6}$/.test(options.jobOrder)) throw new Error('--job-order expects JO-XXXXXX');
  if (options.audit && options.ticket) throw new Error('--audit diagnoses every ticket; drop --ticket');
  if (options.audit && options.jobOrder) throw new Error('--audit is ticket-oriented; drop --job-order');
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (options.repos.length === 0) options.repos = [options.root ?? DEFAULT_ROOT];

  if (options.audit) {
    const audit = auditSpecs(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
      process.exit(audit.error ? 1 : audit.specs.some((s) => s.staleRefs.length > 0
        || s.tickets.some((t) => ['blocked-stale', 'proof-dangling'].includes(t.verdict))) ? 3 : 0);
    }
    process.exit(printAudit(audit));
  }

  const result = runPreflight(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const note of result.notes) process.stdout.write(`note - ${note}\n`);
    for (const failure of result.failures) {
      const label = failure.band === 'reconcilable' ? 'RECONCILE' : 'FAIL';
      process.stdout.write(`${label} - ${failure.check}: ${failure.detail}\n`);
    }
    if (result.verdict === 'pass') {
      if (result.launchRequested) {
        process.stdout.write(`ok - preflight passed for ${result.jobOrder.alias}; launch authorized\n`);
      } else {
        process.stdout.write('ok - repository state check passed; no launch was requested and nothing is authorized\n');
      }
    } else if (result.verdict === 'reconcile') {
      process.stdout.write(`RECONCILE - nothing blocks this launch, but ${result.reconcilable.length} record(s) disagree with source; verify against Actuality, update the record, re-run. Do not wait on the owner for this.\n`);
    } else {
      process.stdout.write(`BLOCKED - preflight failed with ${result.blocking.length} blocking failure(s)${result.reconcilable.length > 0 ? ` and ${result.reconcilable.length} reconcilable finding(s)` : ''}; this is a blocking owner report\n`);
    }
  }
  process.exit(result.verdict === 'pass' ? 0 : result.verdict === 'reconcile' ? 3 : 1);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
