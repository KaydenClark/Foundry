#!/usr/bin/env node
// S-023 TK-001 - Red/green tests for the read-only launch preflight.
//
// Uses disposable Git repositories and a fixture WORKSPACE-like root under a
// scratch dir. Exercises every named check, the fail-closed contract, the
// no-mutation contract, and the CLI exit/JSON surface. The incident fixture
// reproduces the exact 2026-07-25 failure: a feature branch created from
// origin/main that inherited main as its upstream.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditSpecs, proofReferences, referencedRefs, runPreflightChecks as runPreflight } from './preflight.mjs';
import * as preflightModule from './preflight.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PREFLIGHT = path.join(SCRIPT_DIR, 'preflight.mjs');
const SCRATCH =
  process.env.CLAUDE_SCRATCHPAD || path.join(os.tmpdir(), 'preflight-tests');

function g(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function commitAt(cwd, file, content, message, isoDate) {
  writeFileSync(path.join(cwd, file), content);
  g(['add', file], cwd);
  execFileSync('git', ['commit', '-m', message], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  });
}

function tmp(prefix) {
  return mkdtempSync(path.join(SCRATCH.endsWith('/') ? SCRATCH : SCRATCH + '/', prefix));
}

// A bare origin whose default branch is `main`, plus a working clone.
function initOriginAndClone() {
  const base = tmp('repo-');
  const origin = path.join(base, 'origin.git');
  const work = path.join(base, 'work');
  execFileSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'ignore' });
  execFileSync('git', ['clone', origin, work], { stdio: 'ignore' });
  g(['config', 'user.email', 'test@example.com'], work);
  g(['config', 'user.name', 'Test'], work);
  writeFileSync(path.join(work, 'README.md'), 'hello\n');
  g(['add', '.'], work);
  g(['commit', '-m', 'initial'], work);
  g(['push', '-u', 'origin', 'main'], work);
  return { base, origin, work };
}

const SPEC_TEMPLATE = ({
  id,
  title = 'Fixture Spec',
  status = 'active',
  updated = '2026-07-25',
  blockers = 'none',
  nextGate,
  tickets,
}) => `# ${id} - ${title}

**Spec ID:** ${id}
**FUID:** 000001
**Status:** ${status}
**Priority:** 0
**Owner:** fixture
**Created:** 2026-07-24
**Last worked:** ${updated}
**Updated:** ${updated}
**Catalog description:** Fixture spec for preflight tests.
**Blockers:** ${blockers}
**Latest event:** fixture event.
**Next gate:** ${nextGate}

## Vertical Implementation Slices

| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |
|---|---|---|---|---|---|---|---|
${tickets.map((t, index) => `| ${t.id} | ${String(index + 2).padStart(6, '0')} | ${t.slice ?? 'Fixture slice.'} | ${t.status} | ${t.blockers ?? 'none'} | 2026-07-24 | ${updated} | ${t.proof ?? '—'} |`).join('\n')}
`;

// A fixture WORKSPACE-like root: specs/ and a protected-checkout config.
function makeFixtureRoot({ specs = [], protectedCheckouts = [] } = {}) {
  const root = tmp('root-');
  mkdirSync(path.join(root, 'specs'), { recursive: true });
  mkdirSync(path.join(root, 'tools'), { recursive: true });
  for (const spec of specs) {
    const dir = path.join(root, 'specs', `${spec.id}-fixture`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SPEC.md'), SPEC_TEMPLATE(spec));
  }
  writeFileSync(
    path.join(root, 'tools', 'protected-checkouts.json'),
    JSON.stringify({ checkouts: protectedCheckouts }, null, 2),
  );
  return root;
}

function failuresByCheck(result) {
  return new Set(result.failures.map((f) => f.check));
}

// Full observable git state: refs, HEAD, and porcelain status.
function gitStateSnapshot(repo) {
  return [
    g(['for-each-ref', '--format=%(refname) %(objectname)'], repo),
    g(['rev-parse', 'HEAD'], repo),
    g(['status', '--porcelain', '--untracked-files=all'], repo),
    g(['rev-parse', '--abbrev-ref', 'HEAD'], repo),
  ].join('\n---\n');
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`  ok - ${name}`);
}

function eligibleSpec(id = 'S-101') {
  return {
    id,
    nextGate: `Claim ${id === 'S-101' ? 'TK-001' : 'TK-001'} (preflight fixture).`,
    tickets: [{ id: 'TK-001', status: 'ready' }],
  };
}

function exactLaunchValidation({
  jobOrder = 'JO-00008B',
  spec = 'S-037',
  ticket = 'TK-013',
  launchEligible = true,
  errors = [],
} = {}) {
  return {
    ok: errors.length === 0,
    errors,
    launchModel: errors.length ? null : {
      schema: 'gpt-os.job-order-launch.v2',
      jobOrder: { alias: jobOrder, fuid: jobOrder.slice(3), revision: 'R1' },
      spec: { id: spec, fuid: 'ABC123' },
      ticket: { alias: `${spec}/${ticket}`, fuid: 'ABC124' },
      lifecycle: { status: launchEligible ? 'ready' : 'blocked', dependencies: [], launchEligible },
    },
  };
}

function run() {
  execFileSync('mkdir', ['-p', SCRATCH]);
  const cleanup = [];

  try {
    // ---- TK-016 exact Job Order ingress ---------------------------------

    assert.equal(typeof preflightModule.evaluateExactJobOrder, 'function',
      'Preflight must expose one deterministic exact-order binding evaluator');
    const ticketOnly = preflightModule.evaluateExactJobOrder({ spec: 'S-037', ticket: 'TK-013' });
    assert.deepEqual(ticketOnly.failures.map((failure) => failure.check), ['job-order-required']);

    const b = preflightModule.evaluateExactJobOrder({
      spec: 'S-037', ticket: 'TK-013', jobOrder: 'JO-00008B',
      validation: exactLaunchValidation({ jobOrder: 'JO-00008B' }),
    });
    assert.deepEqual(b.failures, []);
    assert.equal(b.record.launchEligible, true);

    const c = preflightModule.evaluateExactJobOrder({
      spec: 'S-037', ticket: 'TK-013', jobOrder: 'JO-00008C',
      validation: exactLaunchValidation({
        jobOrder: 'JO-00008C',
        launchEligible: false,
        errors: [{ code: 'dependency.held' }, { code: 'lifecycle.blocked' }],
      }),
    });
    assert.deepEqual(c.failures.map((failure) => failure.check), ['job-order-not-eligible']);
    assert.match(c.failures[0].detail, /dependency\.held,lifecycle\.blocked/);

    const mismatch = preflightModule.evaluateExactJobOrder({
      spec: 'S-037', ticket: 'TK-013', jobOrder: 'JO-00008B',
      validation: exactLaunchValidation({ jobOrder: 'JO-00008B', ticket: 'TK-099' }),
    });
    assert.deepEqual(mismatch.failures.map((failure) => failure.check), ['job-order-mismatched']);
    assert.equal(mismatch.record.launchEligible, false);

    const ambiguous = preflightModule.evaluateExactJobOrder({
      spec: 'S-037', ticket: 'TK-013', jobOrder: 'JO-00008B',
      validation: exactLaunchValidation({ errors: [{ code: 'structure.ambiguous' }] }),
    });
    assert.deepEqual(ambiguous.failures.map((failure) => failure.check), ['job-order-not-eligible']);
    assert.match(ambiguous.failures[0].detail, /structure\.ambiguous/);
    ok('exact-order binding distinguishes B from held C without ticket inference');

    // ---- (a) push destination -------------------------------------------

    // 1. THE INCIDENT FIXTURE: branch created from origin/main inherits main
    //    as upstream; preflight must name main and fail before any push.
    const incident = initOriginAndClone();
    cleanup.push(incident.base);
    g(['checkout', '-b', 'feature', '--track', 'origin/main'], incident.work);
    const root1 = makeFixtureRoot({ specs: [eligibleSpec()] });
    cleanup.push(root1);
    let result = runPreflight({ root: root1, repos: [incident.work] });
    assert.equal(result.pass, false);
    assert.ok(failuresByCheck(result).has('push-target-protected'),
      `expected push-target-protected, got ${JSON.stringify(result.failures)}`);
    assert.ok(result.failures.some((f) => f.check === 'push-target-protected' && /\bmain\b/.test(f.detail)),
      'failure detail must name main as the push destination');
    ok('incident fixture: inherited-main upstream names main and fails');

    // 2. --no-track branch with an explicit non-protected destination passes
    //    the push check.
    const clean = initOriginAndClone();
    cleanup.push(clean.base);
    g(['checkout', '-b', 'feature', '--no-track'], clean.work);
    result = runPreflight({ root: root1, repos: [clean.work], pushTo: 'feature' });
    assert.ok(!failuresByCheck(result).has('push-target-protected'));
    assert.ok(!failuresByCheck(result).has('push-target-unresolvable'));
    ok('no-track branch with explicit feature refspec passes the push check');

    // 3. An explicit destination of main/master fails even from a feature branch.
    result = runPreflight({ root: root1, repos: [clean.work], pushTo: 'main' });
    assert.ok(failuresByCheck(result).has('push-target-protected'));
    result = runPreflight({ root: root1, repos: [clean.work], pushTo: 'master' });
    assert.ok(failuresByCheck(result).has('push-target-protected'));
    ok('explicit main/master destination fails');

    // 4. Fail closed: no upstream and no declared destination is a failure,
    //    not a skip.
    result = runPreflight({ root: root1, repos: [clean.work] });
    assert.ok(failuresByCheck(result).has('push-target-unresolvable'));
    ok('unresolvable push destination fails closed');

    // ---- (b) tree state --------------------------------------------------

    // 5. Dirty tree fails.
    writeFileSync(path.join(clean.work, 'wip.txt'), 'wip\n');
    result = runPreflight({ root: root1, repos: [clean.work], pushTo: 'feature' });
    assert.ok(failuresByCheck(result).has('dirty-tree'));
    rmSync(path.join(clean.work, 'wip.txt'));
    ok('dirty tree fails');

    // 6. Diverged branch fails.
    const diverged = initOriginAndClone();
    cleanup.push(diverged.base);
    const second = path.join(diverged.base, 'second');
    execFileSync('git', ['clone', diverged.origin, second], { stdio: 'ignore' });
    g(['config', 'user.email', 'test@example.com'], second);
    g(['config', 'user.name', 'Test'], second);
    writeFileSync(path.join(second, 'other.txt'), 'other\n');
    g(['add', '.'], second);
    g(['commit', '-m', 'remote work'], second);
    g(['push', 'origin', 'main'], second);
    writeFileSync(path.join(diverged.work, 'local.txt'), 'local\n');
    g(['add', '.'], diverged.work);
    g(['commit', '-m', 'local work'], diverged.work);
    g(['fetch', 'origin'], diverged.work); // test setup, not preflight
    result = runPreflight({ root: root1, repos: [diverged.work], pushTo: 'feature' });
    assert.ok(failuresByCheck(result).has('diverged'));
    ok('diverged branch fails');

    // 7. Unreadable repo path fails closed.
    result = runPreflight({ root: root1, repos: [path.join(diverged.base, 'nope')] });
    assert.ok(failuresByCheck(result).has('unreadable-repo'));
    ok('unreadable repo path fails closed');

    // ---- (d) spec gate ---------------------------------------------------

    // 8. Lifecycle `ready` with an unmet Next gate fails: the S-009 lesson.
    const gateRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Observe one capped daily pass.',
        tickets: [{ id: 'TK-004', status: 'ready' }],
      }],
    });
    cleanup.push(gateRoot);
    result = runPreflight({
      root: gateRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-004',
    });
    assert.equal(result.pass, false);
    assert.ok(failuresByCheck(result).has('next-gate-unmet'));
    ok('ready ticket with unmet Next gate fails (the S-009 lesson)');

    // 9. A gate naming the target ticket passes; spec-level blockers naming
    //    only other tickets do not block this lane; a blanket blocker does.
    const gateOkRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        blockers: 'TK-005 is a Kayden-only action.',
        nextGate: 'Claim TK-001 or TK-003.',
        tickets: [
          { id: 'TK-001', status: 'ready' },
          { id: 'TK-005', status: 'blocked', blockers: 'Kayden-only' },
        ],
      }],
    });
    cleanup.push(gateOkRoot);
    result = runPreflight({
      root: gateOkRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-001',
    });
    assert.equal(result.pass, true, JSON.stringify(result.failures));
    ok('met gate + other-ticket blockers pass; launch is authorized');

    const blanketRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        blockers: 'Waiting on owner decision.',
        nextGate: 'Claim TK-001.',
        tickets: [{ id: 'TK-001', status: 'ready' }],
      }],
    });
    cleanup.push(blanketRoot);
    result = runPreflight({
      root: blanketRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-001',
    });
    assert.ok(failuresByCheck(result).has('spec-blockers-active'));
    ok('a blanket spec-level blocker fails the launch');

    // 10. A blocked target ticket and a missing spec both fail closed.
    result = runPreflight({
      root: gateOkRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-005',
    });
    assert.ok(failuresByCheck(result).has('ticket-not-eligible'));
    result = runPreflight({
      root: gateOkRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-999', ticket: 'TK-001',
    });
    assert.ok(failuresByCheck(result).has('spec-missing'));
    ok('blocked target ticket and missing spec fail closed');

    // ---- (c) lane collision ---------------------------------------------

    // 11. Another spec with an in-progress ticket is an active-lane collision.
    const collisionRoot = makeFixtureRoot({
      specs: [
        {
          id: 'S-101',
          nextGate: 'Claim TK-001.',
          tickets: [{ id: 'TK-001', status: 'ready' }],
        },
        {
          id: 'S-102',
          nextGate: 'Close TK-001.',
          tickets: [{ id: 'TK-001', status: 'in-progress' }],
        },
      ],
    });
    cleanup.push(collisionRoot);
    result = runPreflight({
      root: collisionRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-001',
    });
    assert.ok(failuresByCheck(result).has('active-lane-collision'));
    assert.ok(result.failures.some((f) => f.check === 'active-lane-collision' && f.detail.includes('S-102')),
      'collision detail must name the colliding lane');
    ok('in-progress ticket on another spec is a named collision');

    // 12. The target spec/ticket being in-progress itself is NOT a collision
    //     (that is the caller resuming its own claimed lane).
    const resumeRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Close TK-001.',
        tickets: [{ id: 'TK-001', status: 'in-progress' }],
      }],
    });
    cleanup.push(resumeRoot);
    result = runPreflight({
      root: resumeRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-001',
    });
    assert.equal(result.pass, true, JSON.stringify(result.failures));
    ok('resuming the claimed target lane is not a collision');

    // 13. Fresher branch activity on the same spec fails a stale spec.
    const staleRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        updated: '2020-01-01',
        nextGate: 'Claim TK-001.',
        tickets: [{ id: 'TK-001', status: 'ready' }],
      }],
    });
    cleanup.push(staleRoot);
    const branchRepo = initOriginAndClone();
    cleanup.push(branchRepo.base);
    g(['checkout', '-b', 'codex/s101-old-work', '--no-track'], branchRepo.work);
    writeFileSync(path.join(branchRepo.work, 'w.txt'), 'w\n');
    g(['add', '.'], branchRepo.work);
    g(['commit', '-m', 'spec work'], branchRepo.work);
    result = runPreflight({
      root: staleRoot, repos: [branchRepo.work], pushTo: 'codex/s101-old-work',
      spec: 'S-101', ticket: 'TK-001',
    });
    assert.ok(failuresByCheck(result).has('spec-branch-activity-fresher'),
      JSON.stringify(result.failures));
    ok('branch activity fresher than the spec record fails the stale claim');

    // ---- (e) protected checkouts ----------------------------------------

    // 14. A protected checkout moved off its pinned branch fails; on the pin
    //     it passes.
    const pinned = initOriginAndClone();
    cleanup.push(pinned.base);
    g(['checkout', '-b', 'pinned-branch', '--no-track'], pinned.work);
    const protRoot = makeFixtureRoot({
      specs: [eligibleSpec()],
      protectedCheckouts: [{ path: pinned.work, pinnedBranch: 'pinned-branch' }],
    });
    cleanup.push(protRoot);
    result = runPreflight({ root: protRoot, repos: [clean.work], pushTo: 'feature' });
    assert.equal(result.pass, true, JSON.stringify(result.failures));
    g(['checkout', '-b', 'somewhere-else', '--no-track'], pinned.work);
    result = runPreflight({ root: protRoot, repos: [clean.work], pushTo: 'feature' });
    assert.ok(failuresByCheck(result).has('protected-checkout-moved'));
    ok('protected checkout off its pin fails; on its pin passes');

    // 14b. A Hall tracked by the WORKSPACE root is not a separate checkout. A
    // branch pin on that subdirectory aliases the root branch and blocks every
    // legitimate feature worktree, which is the producer/product regression.
    const shippedProtected = JSON.parse(
      readFileSync(path.join(SCRIPT_DIR, 'protected-checkouts.json'), 'utf8'),
    );
    assert.ok(
      !shippedProtected.checkouts.some((entry) => entry.path === 'Foundry/Halls/Forge'),
      'root-owned Forge source must not be enrolled as a separate protected checkout',
    );
    assert.equal(
      Object.hasOwn(shippedProtected, 'skillsSnapshot'),
      false,
      'the ignored generated skill catalog is not a preflight prerequisite',
    );
    ok('root-owned Hall source is not pinned as a separate checkout');

    // 15. An ignored generated skill catalog cannot block a clean worktree;
    // unreadable pin configuration still fails closed.
    const noSkillsRoot = makeFixtureRoot({ specs: [eligibleSpec()] });
    cleanup.push(noSkillsRoot);
    result = runPreflight({ root: noSkillsRoot, repos: [clean.work], pushTo: 'feature' });
    assert.equal(result.pass, true, JSON.stringify(result.failures));
    const noConfigRoot = makeFixtureRoot({ specs: [eligibleSpec()] });
    cleanup.push(noConfigRoot);
    rmSync(path.join(noConfigRoot, 'tools', 'protected-checkouts.json'));
    result = runPreflight({ root: noConfigRoot, repos: [clean.work], pushTo: 'feature' });
    assert.ok(failuresByCheck(result).has('protected-config-unreadable'));
    ok('ignored skill catalogs do not block; unreadable protected-checkout config fails closed');

    // ---- read-only + CLI contracts --------------------------------------

    // 16. Preflight performs no git mutation and edits no file.
    const before = gitStateSnapshot(incident.work);
    runPreflight({ root: root1, repos: [incident.work], spec: 'S-101', ticket: 'TK-001' });
    const after = gitStateSnapshot(incident.work);
    assert.equal(after, before, 'repo state must be identical before and after preflight');
    ok('preflight is read-only: repo state hash identical before/after');

    // 17. CLI: nonzero exit with named failures on the incident fixture,
    //     zero exit on a passing launch, JSON output parses.
    const cliFail = spawnSync('node', [
      PREFLIGHT, '--root', root1, '--repo', incident.work, '--json',
    ], { encoding: 'utf8' });
    assert.equal(cliFail.status, 1, cliFail.stderr);
    const parsed = JSON.parse(cliFail.stdout);
    assert.equal(parsed.pass, false);
    assert.ok(parsed.failures.some((f) => f.check === 'push-target-protected'));
    const cliTicketOnly = spawnSync('node', [
      PREFLIGHT, '--root', gateOkRoot, '--repo', clean.work, '--push-to', 'feature',
      '--spec', 'S-101', '--ticket', 'TK-001', '--json',
    ], { encoding: 'utf8' });
    assert.equal(cliTicketOnly.status, 1, `${cliTicketOnly.stdout}\n${cliTicketOnly.stderr}`);
    const ticketOnlyResult = JSON.parse(cliTicketOnly.stdout);
    assert.equal(ticketOnlyResult.launchAuthorized, false);
    assert.ok(ticketOnlyResult.failures.some((failure) => failure.check === 'job-order-required'));
    const duplicateOrder = spawnSync('node', [
      PREFLIGHT, '--root', gateOkRoot, '--repo', clean.work, '--push-to', 'feature',
      '--spec', 'S-101', '--ticket', 'TK-001', '--job-order', 'JO-ABC125',
      '--job-order', 'JO-ABC126', '--json',
    ], { encoding: 'utf8' });
    assert.equal(duplicateOrder.status, 2, duplicateOrder.stdout);
    assert.match(duplicateOrder.stderr, /duplicate argument --job-order/);
    ok('CLI fails closed on ticket-only and duplicate exact-order launch arguments');

    // ---- TK-008: reference matching -------------------------------------

    // 18. The staleness matcher sees spec ids, ticket ids, and branches the
    //     spec names in prose — but not shared trunks, which every spec cites.
    const refTarget = {
      id: 'S-024',
      tickets: [
        { id: 'TK-005', slice: 'Land it by merging `claude/vendor-forge`.', blockers: 'none', proof: '—' },
      ],
      blockers: 'none',
      nextGate: 'Claim TK-005.',
    };
    const referenced = referencedRefs(refTarget);
    const matches = (name) => {
      const lower = name.toLowerCase();
      return referenced.patterns.some((p) => p.test(lower))
        || referenced.qualifiedPatterns.some(({ specPattern, ticketPattern }) =>
          specPattern.test(lower) && ticketPattern.test(lower))
        || referenced.literals.has(name)
        || referenced.literals.has(name.slice(name.indexOf('/') + 1));
    };
    assert.ok(matches('codex/s024-work'), 'spec-id-named ref must match');
    assert.ok(matches('codex/s024-tk005-land'), 'spec+ticket-named ref must match');
    assert.ok(matches('claude/vendor-forge'), 'a branch named in spec prose must match');
    assert.ok(matches('origin/claude/vendor-forge'), 'the remote form of a named branch must match');
    // A bare ticket id is ambiguous: nearly every spec has a TK-005, so
    // matching it alone reported one branch against fifteen specs.
    assert.ok(!matches('claude/tk005-land'), 'a bare ticket id must not match without the spec id');
    assert.ok(!matches('origin/integration'), 'shared trunks must not match literally');
    assert.ok(!matches('claude/unrelated-thing'), 'unrelated branches must not match');
    ok('ref matching needs a spec id or a prose-named branch, never a bare ticket id');

    // 19. A branch name in a Proof cell is a ref, not a filesystem path.
    //     Classifying `claude/vendor-forge` as a path made every
    //     branch-citing ticket look like dangling proof.
    const parsed19 = proofReferences('Foundry `13b64bf` on `claude/vendor-forge`; see `tools/test-foundry.mjs`.');
    assert.deepEqual([...parsed19.commits], ['13b64bf']);
    assert.deepEqual([...parsed19.refs], ['claude/vendor-forge']);
    assert.deepEqual([...parsed19.paths], ['tools/test-foundry.mjs']);
    assert.equal(proofReferences('—').commits.size, 0);
    ok('proof references split into commits, refs, and paths');

    // ---- TK-008: blocking vs reconcilable --------------------------------

    // 20. THE S-024 REGRESSION. A ticket recorded blocked whose blocker's own
    //     cited proof resolves is a bookkeeping lag, not an owner gate: it
    //     must land in the reconcilable band and exit 3, never halt as a
    //     blocking owner report.
    const staleBlockerRepo = initOriginAndClone();
    cleanup.push(staleBlockerRepo.base);
    g(['checkout', '-b', 'claude/topic-named-branch', '--no-track'], staleBlockerRepo.work);
    writeFileSync(path.join(staleBlockerRepo.work, 'landed.txt'), 'landed\n');
    g(['add', '.'], staleBlockerRepo.work);
    g(['commit', '-m', 'the work that actually landed'], staleBlockerRepo.work);
    const landedSha = g(['rev-parse', '--short', 'HEAD'], staleBlockerRepo.work);
    const s024Root = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        updated: '2026-07-25',
        nextGate: 'Claim TK-003.',
        tickets: [
          { id: 'TK-002', status: 'blocked', blockers: 'none', proof: `Landed in \`${landedSha}\`.` },
          { id: 'TK-003', status: 'blocked', blockers: 'S-101/TK-002', proof: '—' },
        ],
      }],
    });
    cleanup.push(s024Root);
    result = runPreflight({
      root: s024Root, repos: [staleBlockerRepo.work], pushTo: 'claude/topic-named-branch',
      spec: 'S-101', ticket: 'TK-003',
    });
    assert.ok(failuresByCheck(result).has('stale-blocker'), JSON.stringify(result.failures));
    assert.ok(result.failures.some((f) => f.check === 'stale-blocker' && f.band === 'reconcilable'),
      'a stale blocker must be reconcilable, not blocking');
    ok('S-024 regression: a blocker whose proof already resolves is reconcilable');

    // 20b. TK-012: blocker dependencies are deliberately narrow. Only a
    // complete cell made exclusively of fully-qualified ticket identities and
    // supported separators is machine-resolvable. Everything else is opaque.
    const blockerCases = [
      ['S-101/TK-001', true, 'one fully-qualified ticket'],
      ['S-101/TK-001, S-101/TK-002', true, 'comma-separated tickets'],
      ['S-101/TK-001 and S-101/TK-002', true, 'and-separated tickets'],
      ['S-101/TK-001 & S-101/TK-002', true, 'ampersand-separated tickets'],
      ['S-101/TK-001 \\| S-101/TK-002', true, 'escaped-pipe-separated tickets'],
      ['TK-001', false, 'bare ticket'],
      ['TK-011, A2, and Phase-B acceptance', false, 'historical TK-009 blocker'],
      ['S-101/TK-001 and owner approval', false, 'owner constraint'],
      ['S-101/TK-001 and external certification', false, 'external constraint'],
      ['S-101/TK-001 and runtime verification', false, 'runtime constraint'],
      ['not S-101/TK-001', false, 'negation'],
      ['future S-101/TK-001', false, 'future statement'],
      ['after S-101/TK-001', false, 'after statement'],
      ['history: S-101/TK-001', false, 'historical statement'],
      ['"S-101/TK-001"', false, 'quoted statement'],
      ['S-101/TK-001 after 2026-08-28 America/Denver', false, 'date/timezone prose'],
      ['S-102/TK-001', false, 'cross-Spec same-number ticket', 'blocked-verified'],
      ['S-101/TK-001,', false, 'trailing separator'],
      ['(S-101/TK-001', false, 'unmatched delimiter'],
      ['S-101/TK-001 "', false, 'unmatched quote'],
    ];
    for (const [blockers, resolvable, label, blockedVerdict = 'blocked-unverifiable'] of blockerCases) {
      const root = makeFixtureRoot({
        specs: [{
          id: 'S-101',
          nextGate: 'Claim TK-003.',
          tickets: [
            { id: 'TK-001', status: 'done', blockers: 'none', proof: '—' },
            { id: 'TK-002', status: 'done', blockers: 'none', proof: '—' },
            { id: 'TK-003', status: 'ready', blockers, proof: '—' },
          ],
        }],
      });
      cleanup.push(root);
      const launch = runPreflight({
        root, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-003',
      });
      assert.equal(
        !failuresByCheck(launch).has('ticket-not-eligible'),
        resolvable,
        `${label}: launch classification ${JSON.stringify(launch.failures)}`,
      );
      const audited = auditSpecs({ root, repos: [clean.work], spec: 'S-101' });
      const ticket = audited.specs[0].tickets.find((item) => item.id === 'TK-003');
      assert.equal(
        ticket.verdict,
        resolvable ? 'launchable' : blockedVerdict,
        `${label}: audit classification ${JSON.stringify(ticket)}`,
      );
    }
    ok('TK-012 ticket-only blocker grammar is exhaustive and opaque on residual prose');

    // 20c. The same blocker parse drives proof reconciliation. A pure ticket
    // dependency whose proof resolves is stale; prose containing that same
    // ticket text remains opaque and must not be inferred away.
    const proofInteractionRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Claim TK-004.',
        tickets: [
          { id: 'TK-001', status: 'blocked', blockers: 'none', proof: `Landed in \`${landedSha}\`.` },
          { id: 'TK-003', status: 'blocked', blockers: 'S-101/TK-001', proof: '—' },
          { id: 'TK-004', status: 'blocked', blockers: 'after S-101/TK-001 runtime verification', proof: '—' },
        ],
      }],
    });
    cleanup.push(proofInteractionRoot);
    result = runPreflight({
      root: proofInteractionRoot,
      repos: [staleBlockerRepo.work],
      pushTo: 'feature',
      spec: 'S-101',
      ticket: 'TK-004',
    });
    assert.ok(result.failures.some((failure) => failure.check === 'stale-blocker' && failure.ticket === 'TK-003'));
    assert.ok(!result.failures.some((failure) => failure.check === 'stale-blocker' && failure.ticket === 'TK-004'));
    const proofAudit = auditSpecs({ root: proofInteractionRoot, repos: [staleBlockerRepo.work], spec: 'S-101' });
    const proofVerdicts = Object.fromEntries(proofAudit.specs[0].tickets.map((ticket) => [ticket.id, ticket.verdict]));
    assert.equal(proofVerdicts['TK-003'], 'blocked-stale');
    assert.equal(proofVerdicts['TK-004'], 'blocked-unverifiable');
    ok('TK-012 shared blocker parse preserves proof interaction across launch and audit');

    const unfinishedRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Claim TK-003.',
        tickets: [
          { id: 'TK-001', status: 'done', blockers: 'none', proof: '—' },
          { id: 'TK-002', status: 'in-progress', blockers: 'none', proof: '—' },
          { id: 'TK-003', status: 'ready', blockers: 'S-101/TK-001 and S-101/TK-002', proof: '—' },
        ],
      }],
    });
    cleanup.push(unfinishedRoot);
    result = runPreflight({
      root: unfinishedRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-003',
    });
    assert.ok(failuresByCheck(result).has('ticket-not-eligible'));
    const unfinishedAudit = auditSpecs({ root: unfinishedRoot, repos: [clean.work], spec: 'S-101' });
    const unfinishedTicket = unfinishedAudit.specs[0].tickets.find((ticket) => ticket.id === 'TK-003');
    assert.equal(unfinishedTicket.verdict, 'blocked-verified');
    assert.match(unfinishedTicket.because, /S-101\/TK-002/);
    ok('TK-012 ticket-only lists retain unfinished dependencies');

    // 21. Reconcilable-only findings exit 3 and report verdict "reconcile";
    //     a genuine owner gate still exits 1 and reports "blocked".
    const reconcileOnlyRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        updated: '2020-01-01', // guarantees fresher branch activity
        nextGate: 'Claim TK-001.',
        tickets: [{ id: 'TK-001', status: 'ready', blockers: 'none', proof: '—' }],
      }],
    });
    cleanup.push(reconcileOnlyRoot);
    const s101Repo = initOriginAndClone();
    cleanup.push(s101Repo.base);
    g(['checkout', '-b', 'codex/s101-topic', '--no-track'], s101Repo.work);
    writeFileSync(path.join(s101Repo.work, 'w.txt'), 'w\n');
    g(['add', '.'], s101Repo.work);
    g(['commit', '-m', 'later work'], s101Repo.work);
    result = runPreflight({
      root: reconcileOnlyRoot, repos: [s101Repo.work], pushTo: 'codex/s101-topic',
      spec: 'S-101', ticket: 'TK-001',
    });
    assert.equal(result.verdict, 'reconcile', JSON.stringify(result.failures));
    assert.equal(result.blocking.length, 0);
    assert.ok(result.reconcilable.length > 0);
    const cliReconcile = spawnSync('node', [
      PREFLIGHT, '--root', reconcileOnlyRoot, '--repo', s101Repo.work,
      '--push-to', 'codex/s101-topic', '--spec', 'S-101', '--ticket', 'TK-001',
    ], { encoding: 'utf8' });
    assert.equal(cliReconcile.status, 1, cliReconcile.stdout);
    assert.match(cliReconcile.stdout, /RECONCILE/);
    assert.match(cliReconcile.stdout, /job-order-required/);
    assert.match(cliReconcile.stdout, /BLOCKED/);
    ok('diagnostic checks retain reconcile while ticket-only launch fails closed');

    // 22. A blocking failure dominates: any blocking check present means
    //     verdict "blocked" and exit 1 even when reconcilable ones exist.
    // Same stale-record fixture, but with no --push-to on an untracked
    // branch: the unresolvable push destination is blocking.
    result = runPreflight({
      root: reconcileOnlyRoot, repos: [s101Repo.work], spec: 'S-101', ticket: 'TK-001',
    });
    assert.equal(result.verdict, 'blocked');
    assert.ok(result.blocking.length > 0 && result.reconcilable.length > 0,
      'fixture must produce both bands to prove blocking dominates');
    ok('a blocking failure dominates reconcilable ones: verdict "blocked", exit 1');

    // 23. A done ticket citing proof that does not resolve is reported as
    //     proof-dangling — the record claiming evidence Actuality lacks.
    const danglingRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Claim TK-002.',
        tickets: [
          { id: 'TK-001', status: 'done', blockers: 'none', proof: 'Shipped in `deadbee` and `tools/nonexistent-file.mjs`.' },
          { id: 'TK-002', status: 'ready', blockers: 'none', proof: '—' },
        ],
      }],
    });
    cleanup.push(danglingRoot);
    result = runPreflight({
      root: danglingRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-002',
    });
    assert.ok(failuresByCheck(result).has('proof-dangling'), JSON.stringify(result.failures));
    assert.equal(result.verdict, 'reconcile');
    ok('a done ticket citing unresolvable proof reports proof-dangling');

    // 23b. Real-but-awkward paths must NOT read as dangling: a path relative
    //      to a different repo root, a bare filename, a gitignored generated
    //      artifact, and a `~` path. Each of these was a live false positive.
    const ignoredDir = path.join(clean.work, 'generated');
    mkdirSync(ignoredDir, { recursive: true });
    writeFileSync(path.join(ignoredDir, 'ARTIFACT.md'), 'generated\n');
    writeFileSync(path.join(clean.work, '.gitignore'), 'generated/\n');
    mkdirSync(path.join(clean.work, 'deep', 'nested'), { recursive: true });
    writeFileSync(path.join(clean.work, 'deep', 'nested', 'thing.mjs'), 'x\n');
    g(['add', '.'], clean.work);
    g(['commit', '-m', 'fixtures'], clean.work);
    const awkwardRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        nextGate: 'Claim TK-002.',
        tickets: [
          {
            id: 'TK-001',
            status: 'done',
            blockers: 'none',
            proof: 'See `nested/thing.mjs`, `thing.mjs`, `generated/ARTIFACT.md`, and `~`.',
          },
          { id: 'TK-002', status: 'ready', blockers: 'none', proof: '—' },
        ],
      }],
    });
    cleanup.push(awkwardRoot);
    result = runPreflight({
      root: awkwardRoot, repos: [clean.work], pushTo: 'feature', spec: 'S-101', ticket: 'TK-002',
    });
    assert.ok(!failuresByCheck(result).has('proof-dangling'),
      `real paths must not read as dangling: ${JSON.stringify(result.failures)}`);
    ok('paths relative to another root, bare filenames, and ignored artifacts resolve');

    // ---- TK-008: audit mode ----------------------------------------------

    // 24. Audit returns a verdict for every ticket, distinguishing a real
    //     owner gate from a stale one, and never authorizes anything.
    const auditRoot = makeFixtureRoot({
      specs: [{
        id: 'S-101',
        updated: '2026-07-25',
        nextGate: 'Claim TK-004.',
        tickets: [
          { id: 'TK-001', status: 'done', blockers: 'none', proof: `Landed in \`${landedSha}\`.` },
          { id: 'TK-002', status: 'ready', blockers: 'none', slice: 'GRILL FIRST (Kayden-reserved): decide the boundary.', proof: '—' },
          { id: 'TK-003', status: 'blocked', blockers: 'S-101/TK-001', proof: '—' },
          { id: 'TK-004', status: 'ready', blockers: 'none', proof: '—' },
          { id: 'TK-005', status: 'blocked', blockers: 'S-101/TK-002', proof: '—' },
        ],
      }],
    });
    cleanup.push(auditRoot);
    const audit = auditSpecs({ root: auditRoot, repos: [staleBlockerRepo.work], spec: 'S-101' });
    const verdicts = Object.fromEntries(audit.specs[0].tickets.map((t) => [t.id, t.verdict]));
    assert.equal(verdicts['TK-001'], 'done');
    assert.equal(verdicts['TK-002'], 'owner-gated', 'a Kayden-reserved slice must be named as owner-gated');
    assert.equal(verdicts['TK-004'], 'launchable');
    assert.equal(verdicts['TK-005'], 'blocked-verified', 'blocked by a genuinely unfinished ticket');
    // TK-003 is parked at `blocked` on TK-001, which is already done. Nothing
    // holds it; the row was never updated. That is the commonest bookkeeping
    // lag and must read as stale, never as a genuine block.
    assert.equal(verdicts['TK-003'], 'blocked-stale',
      `TK-003's blocker is already done; got ${verdicts['TK-003']}`);
    ok('audit returns a per-ticket verdict and separates owner gates from stale ones');

    // 25. Audit is read-only and exits 3 when it finds record/source
    //     disagreement, 0 when clean.
    const auditBefore = gitStateSnapshot(staleBlockerRepo.work);
    const cliAudit = spawnSync('node', [
      PREFLIGHT, '--root', s024Root, '--repo', staleBlockerRepo.work, '--spec', 'S-101', '--audit',
    ], { encoding: 'utf8' });
    assert.equal(cliAudit.status, 3, cliAudit.stdout);
    assert.match(cliAudit.stdout, /STALE/);
    assert.equal(gitStateSnapshot(staleBlockerRepo.work), auditBefore, 'audit must mutate nothing');
    const cleanAudit = spawnSync('node', [
      PREFLIGHT, '--root', gateOkRoot, '--repo', clean.work, '--spec', 'S-101', '--audit', '--json',
    ], { encoding: 'utf8' });
    assert.equal(cleanAudit.status, 0, cleanAudit.stdout);
    assert.ok(Array.isArray(JSON.parse(cleanAudit.stdout).specs));
    ok('audit is read-only, exits 3 on disagreement and 0 when clean');

    // 26. --audit with --ticket is a usage error: audit covers every ticket.
    const badAudit = spawnSync('node', [
      PREFLIGHT, '--root', auditRoot, '--spec', 'S-101', '--ticket', 'TK-001', '--audit',
    ], { encoding: 'utf8' });
    assert.equal(badAudit.status, 2, badAudit.stderr);
    ok('--audit rejects --ticket as a usage error');

    // ---- TK-010 Phase A1: shared freshness collector -------------------

    // 27. One exported collector owns the existing reference selection and
    // returns separate local/remote-tracking facts with complete timestamps.
    assert.equal(
      typeof preflightModule.collectFreshnessRefs,
      'function',
      'preflight must export collectFreshnessRefs with structured freshness fields',
    );
    const collectorRepo = initOriginAndClone();
    cleanup.push(collectorRepo.base);
    g(['checkout', '-b', 'codex/s101-collector', '--no-track'], collectorRepo.work);
    writeFileSync(path.join(collectorRepo.work, 'collector.txt'), 'collector\n');
    g(['add', '.'], collectorRepo.work);
    g(['commit', '-m', 'collector fixture'], collectorRepo.work);
    g(['push', 'origin', 'codex/s101-collector:codex/s101-collector'], collectorRepo.work);
    const collectorTarget = {
      id: 'S-101',
      updated: '2020-01-01',
      blockers: 'none',
      nextGate: 'Claim TK-001.',
      tickets: [{ id: 'TK-001', slice: 'Fixture.', blockers: 'none', proof: '—' }],
    };
    const collected = preflightModule.collectFreshnessRefs(
      collectorTarget,
      [collectorRepo.work],
      { timeZone: 'America/Denver' },
    );
    assert.deepEqual(collected.errors, []);
    assert.equal(collected.timeZone, 'America/Denver');
    assert.equal(collected.records.length, 2, JSON.stringify(collected));
    assert.deepEqual(
      collected.records.map((record) => record.refClass).sort(),
      ['local', 'remote-tracking'],
    );
    assert.deepEqual(
      collected.records.map((record) => record.fullRef).sort(),
      [
        'refs/heads/codex/s101-collector',
        'refs/remotes/origin/codex/s101-collector',
      ],
    );
    assert.deepEqual(
      collected.records.map((record) => record.shortRef).sort(),
      ['codex/s101-collector', 'origin/codex/s101-collector'],
    );
    assert.equal(new Set(collected.records.map((record) => record.objectSha)).size, 1);
    for (const record of collected.records) {
      assert.equal(Number.isInteger(record.committerEpoch), true);
      assert.match(record.committerIso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      assert.equal(record.findingCode, 'spec-branch-activity-fresher');
      assert.equal(
        record.localDate,
        (() => {
          const parts = new Intl.DateTimeFormat('en', {
          timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit',
          }).formatToParts(new Date(record.committerEpoch * 1000));
          const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
          return `${values.year}-${values.month}-${values.day}`;
        })(),
      );
    }
    const collectedResult = runPreflight({
      root: reconcileOnlyRoot,
      repos: [collectorRepo.work],
      pushTo: 'codex/s101-collector',
      spec: 'S-101',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    assert.deepEqual(collectedResult.freshness.errors, []);
    assert.deepEqual(collectedResult.freshness.records, collected.records);
    assert.equal(
      collectedResult.failures.filter((failure) => failure.check === 'spec-branch-activity-fresher').length,
      new Set(collected.records.map((record) => `${record.repoIndex}\0${record.objectSha}`)).size,
      'staleRefFailures must adapt and coherently evaluate the same collector records without selecting refs again',
    );
    const collectedCli = spawnSync('node', [
      PREFLIGHT,
      '--root', reconcileOnlyRoot,
      '--repo', collectorRepo.work,
      '--push-to', 'codex/s101-collector',
      '--spec', 'S-101',
      '--ticket', 'TK-001',
      '--json',
    ], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Denver' } });
    assert.equal(collectedCli.status, 1, collectedCli.stderr);
    const collectedCliResult = JSON.parse(collectedCli.stdout);
    assert.deepEqual(collectedCliResult.freshness, collected);
    assert.equal(collectedCliResult.launchAuthorized, false);
    assert.ok(collectedCliResult.failures.some((failure) => failure.check === 'job-order-required'));
    ok('shared collector exposes complete, distinct local and remote-tracking freshness facts');

    // 28. Ref enumeration is strict and structured: unreadable, malformed,
    // symbolic, or otherwise unevaluable output fails closed without raw Git
    // stderr or remote URLs in the diagnostic.
    const fakeTarget = { ...collectorTarget, id: 'S-777' };
    const cases = [
      { name: 'unreadable', output: null },
      { name: 'malformed', output: 'not-enough-fields' },
      {
        name: 'symbolic',
        output: [
          'refs/remotes/origin/s777-symbolic',
          'origin/s777-symbolic',
          'a'.repeat(40),
          '1787896000',
          'refs/remotes/origin/s777-target',
          '2026-08-27T23:46:40-06:00',
        ].join('\t'),
      },
    ];
    for (const fixture of cases) {
      const outcome = preflightModule.collectFreshnessRefs(fakeTarget, ['/private/fixture'], {
        timeZone: 'America/Denver',
        gitRunner: () => fixture.output,
      });
      assert.equal(outcome.records.length, 0, fixture.name);
      assert.equal(outcome.errors.length, 1, fixture.name);
      assert.equal(outcome.errors[0].check, 'freshness-ref-unevaluable');
      assert.doesNotMatch(outcome.errors[0].detail, /https?:\/\/|Authorization|token|credential/i);
    }
    ok('freshness collector fails closed with structured, redacted enumeration errors');

    // 29. A trustworthy full ref selects the row. Missing or inconsistent
    // short-ref metadata must not silently turn that selected fact into an
    // unrelated row.
    for (const fixture of [
      { name: 'empty short ref', shortRef: '' },
      { name: 'mismatched short ref', shortRef: 'codex/s888-corrupt' },
    ]) {
      const outcome = preflightModule.collectFreshnessRefs(fakeTarget, ['/private/fixture'], {
        timeZone: 'America/Denver',
        gitRunner: () => [
          'refs/heads/codex/s777-bad',
          fixture.shortRef,
          'a'.repeat(40),
          '1787896000',
          '',
          '2026-08-27T23:46:40-06:00',
        ].join('\t'),
      });
      assert.equal(outcome.records.length, 0, fixture.name);
      assert.equal(
        outcome.errors.length,
        1,
        `${fixture.name}: selected full ref with bad short-ref metadata must fail closed`,
      );
      assert.equal(outcome.errors[0].check, 'freshness-ref-unevaluable');
      assert.doesNotMatch(outcome.errors[0].detail, /https?:\/\/|Authorization|token|credential/i);
    }
    ok('selected full refs reject missing or inconsistent short-ref metadata');

    // ---- TK-009: local-day freshness and equivalent-ref evaluation ------

    // 30. Date-only Updated fields are calendar days in the declared
    // workspace timezone. UTC midnight must not manufacture a next-day fact.
    const tk009RedGaps = [];
    const localDayRoot = makeFixtureRoot({
      specs: [{
        id: 'S-201',
        updated: '2026-08-28',
        nextGate: 'Claim TK-001.',
        tickets: [{ id: 'TK-001', status: 'ready', blockers: 'none', proof: '—' }],
      }],
    });
    cleanup.push(localDayRoot);
    const localDayRepo = initOriginAndClone();
    cleanup.push(localDayRepo.base);
    g(['checkout', '-b', 'codex/s201-local-day', '--no-track'], localDayRepo.work);
    commitAt(
      localDayRepo.work,
      'same-day.txt',
      'same Denver day\n',
      'same Denver local day after UTC midnight',
      '2026-08-29T01:30:00Z',
    );
    result = runPreflight({
      root: localDayRoot,
      repos: [localDayRepo.work],
      pushTo: 'codex/s201-local-day',
      spec: 'S-201',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    if (failuresByCheck(result).has('spec-branch-activity-fresher')) {
      tk009RedGaps.push(`same Denver local day was fresher: ${JSON.stringify(result.failures)}`);
    }
    assert.equal(result.freshness.records[0].localDate, '2026-08-28');

    // 31. A genuine next Denver local day remains fresher.
    commitAt(
      localDayRepo.work,
      'next-day.txt',
      'next Denver day\n',
      'next Denver local day',
      '2026-08-29T06:30:00Z',
    );
    result = runPreflight({
      root: localDayRoot,
      repos: [localDayRepo.work],
      pushTo: 'codex/s201-local-day',
      spec: 'S-201',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    assert.ok(failuresByCheck(result).has('spec-branch-activity-fresher'));
    assert.equal(result.freshness.records[0].localDate, '2026-08-29');
    ok('genuine next Denver local day remains fresher');

    // 32. The collector's timezone conversion remains authoritative across
    // DST fall-back; a late Nov 1 Denver commit is still Nov 1, not Nov 2.
    const dstRoot = makeFixtureRoot({
      specs: [{
        id: 'S-202',
        updated: '2026-11-01',
        nextGate: 'Claim TK-001.',
        tickets: [{ id: 'TK-001', status: 'ready', blockers: 'none', proof: '—' }],
      }],
    });
    cleanup.push(dstRoot);
    const dstRepo = initOriginAndClone();
    cleanup.push(dstRepo.base);
    g(['checkout', '-b', 'codex/s202-dst', '--no-track'], dstRepo.work);
    commitAt(dstRepo.work, 'dst.txt', 'dst\n', 'Denver DST boundary', '2026-11-02T06:30:00Z');
    result = runPreflight({
      root: dstRoot,
      repos: [dstRepo.work],
      pushTo: 'codex/s202-dst',
      spec: 'S-202',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    assert.equal(result.freshness.records[0].localDate, '2026-11-01');
    if (failuresByCheck(result).has('spec-branch-activity-fresher')) {
      tk009RedGaps.push(`Denver DST local day was fresher: ${JSON.stringify(result.failures)}`);
    }

    // 33. Local and remote-tracking records remain represented, while the
    // same repository/object identity produces one freshness evaluation.
    const equivalentRepo = initOriginAndClone();
    cleanup.push(equivalentRepo.base);
    g(['checkout', '-b', 'codex/s201-equivalent', '--no-track'], equivalentRepo.work);
    commitAt(equivalentRepo.work, 'equivalent.txt', 'same object\n', 'equivalent refs', '2026-08-29T06:45:00Z');
    g(['push', 'origin', 'codex/s201-equivalent:codex/s201-equivalent'], equivalentRepo.work);
    result = runPreflight({
      root: localDayRoot,
      repos: [equivalentRepo.work],
      pushTo: 'codex/s201-equivalent',
      spec: 'S-201',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    assert.equal(result.freshness.records.length, 2, JSON.stringify(result.freshness));
    assert.deepEqual(
      result.freshness.records.map((record) => record.refClass).sort(),
      ['local', 'remote-tracking'],
    );
    const equivalentFindings = result.failures
      .filter((failure) => failure.check === 'spec-branch-activity-fresher').length;
    if (equivalentFindings !== 1) {
      tk009RedGaps.push(`equivalent repository/object produced ${equivalentFindings} findings`);
    }

    // 34. Different object identities remain distinct freshness facts.
    const distinctRepo = initOriginAndClone();
    cleanup.push(distinctRepo.base);
    g(['checkout', '-b', 'codex/s201-distinct', '--no-track'], distinctRepo.work);
    commitAt(distinctRepo.work, 'remote.txt', 'remote object\n', 'remote object', '2026-08-29T06:50:00Z');
    g(['push', 'origin', 'codex/s201-distinct:codex/s201-distinct'], distinctRepo.work);
    commitAt(distinctRepo.work, 'local.txt', 'local object\n', 'local object', '2026-08-29T06:55:00Z');
    result = runPreflight({
      root: localDayRoot,
      repos: [distinctRepo.work],
      pushTo: 'codex/s201-distinct',
      spec: 'S-201',
      ticket: 'TK-001',
      timeZone: 'America/Denver',
    });
    assert.equal(new Set(result.freshness.records.map((record) => record.objectSha)).size, 2);
    assert.equal(
      result.failures.filter((failure) => failure.check === 'spec-branch-activity-fresher').length,
      2,
    );
    ok('non-equivalent local and remote-tracking refs remain distinct');

    // 35. Cross-repository proof remains dangling until the exact proof
    // repository is supplied; no direct filesystem reach-around is allowed.
    const externalProofRepo = initOriginAndClone();
    cleanup.push(externalProofRepo.base);
    const externalSha = g(['rev-parse', '--short', 'HEAD'], externalProofRepo.work);
    const externalProofRoot = makeFixtureRoot({
      specs: [{
        id: 'S-203',
        updated: '2026-08-28',
        nextGate: 'Claim TK-002.',
        tickets: [
          { id: 'TK-001', status: 'done', blockers: 'none', proof: `Shared skills proof \`${externalSha}\`.` },
          { id: 'TK-002', status: 'ready', blockers: 'none', proof: '—' },
        ],
      }],
    });
    cleanup.push(externalProofRoot);
    result = runPreflight({
      root: externalProofRoot,
      repos: [clean.work],
      pushTo: 'feature',
      spec: 'S-203',
      ticket: 'TK-002',
      timeZone: 'America/Denver',
    });
    assert.ok(failuresByCheck(result).has('proof-dangling'));
    result = runPreflight({
      root: externalProofRoot,
      repos: [clean.work, externalProofRepo.work],
      pushTo: 'feature',
      spec: 'S-203',
      ticket: 'TK-002',
      timeZone: 'America/Denver',
    });
    assert.ok(!failuresByCheck(result).has('proof-dangling'), JSON.stringify(result.failures));
    ok('external proof dangles root-only and resolves with the exact proof repository');

    // 36. Unknown timezone input remains a structured fail-closed error.
    result = runPreflight({
      root: localDayRoot,
      repos: [localDayRepo.work],
      pushTo: 'codex/s201-local-day',
      spec: 'S-201',
      ticket: 'TK-001',
      timeZone: 'Mars/Olympus_Mons',
    });
    assert.equal(result.verdict, 'blocked');
    assert.ok(failuresByCheck(result).has('freshness-ref-unevaluable'));
    assert.equal(result.freshness.timeZone, 'Mars/Olympus_Mons');
    assert.deepEqual(result.freshness.records, []);
    ok('unknown timezone fails closed with structured freshness output');

    assert.deepEqual(tk009RedGaps, [], 'TK-009 focused behavior gaps');
    ok('same-day, DST, and equivalent-ref freshness semantics are coherent');

    console.log(`\nok - preflight: ${passed} checks passed`);
  } finally {
    for (const dir of cleanup) {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

run();
