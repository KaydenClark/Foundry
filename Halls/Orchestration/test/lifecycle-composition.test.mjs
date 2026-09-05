import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestCanonical } from '../../Knowledge/src/index.mjs';

const cli = new URL('../bin/lifecycle.mjs', import.meta.url).pathname;

const jobOrder = Object.freeze({ id: 'JO-COMPOSITION-FIXTURE', revision: 'R1' });
const planeDigests = {
  actuality: '3'.repeat(64),
  canon: '1'.repeat(64),
  enduringContext: '5'.repeat(64),
  grounding: '4'.repeat(64),
  intent: '2'.repeat(64),
  projection: '6'.repeat(64),
};
const terminalPayload = {
  disposition: 'closed-complete',
  artifactDigest: 'c'.repeat(64),
  postflightDigest: 'd'.repeat(64),
  recoveryRef: 'refs/heads/integration',
  recoverySha: 'b'.repeat(40),
  planeDigests,
};

function git(cwd, args, input = undefined) {
  return execFileSync('/usr/bin/git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      GIT_AUTHOR_NAME: 'Composition Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Composition Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim();
}

/** Seeds one lifecycle ref already sitting at `delivered-unclosed`. */
function deliveredUnclosedFixture(t, status = 'delivered-unclosed') {
  const root = mkdtempSync(join(tmpdir(), 'foundry-lifecycle-composition-'));
  const remote = join(root, 'remote.git');
  const source = join(root, 'source');
  const lifecycleRef = 'refs/heads/instance-flights/composition-fixture';
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--bare', remote]);
  git(root, ['init', source]);

  const state = {
    schemaVersion: '2.0',
    kind: 'child',
    status,
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    handoff: { handoffFuid: 'HND001' },
    journal: { eventId: 'EVT-DELIVERED', sequence: 1 },
  };
  const event = {
    schemaVersion: '2.0',
    eventId: 'EVT-DELIVERED',
    sequence: 1,
    type: 'delivery.accepted',
    priorDigest: 'none',
    stateDigest: digestCanonical(state),
    payload: { handoffFuid: 'HND001', accepted: true },
  };
  mkdirSync(join(source, 'state'), { recursive: true });
  mkdirSync(join(source, 'journal/events'), { recursive: true });
  writeFileSync(join(source, 'state/lifecycle.json'), canonicalJson(state));
  writeFileSync(join(source, 'journal/events/001-EVT-DELIVERED.json'), canonicalJson(event));
  git(source, ['add', '.']);
  git(source, ['commit', '-m', 'delivered-unclosed lifecycle boundary']);
  const base = git(source, ['rev-parse', 'HEAD']);
  git(source, ['push', remote, `${base}:${lifecycleRef}`]);
  return { root, remote, source, lifecycleRef, base, state, event };
}

function runCli(fixture, overrides = []) {
  return spawnSync(process.execPath, [
    cli, 'close',
    '--repository', fixture.source,
    '--remote', fixture.remote,
    '--lifecycle-ref', fixture.lifecycleRef,
    '--job-order', jobOrder.id,
    '--revision', jobOrder.revision,
    '--actor-class', 'engineer',
    '--gate-evidence', 'authority,freshness,single-writer',
    '--evaluated-at', '2026-09-01T12:00:00.000Z',
    '--event-id', 'EVT-TERMINAL',
    '--payload', JSON.stringify(terminalPayload),
    ...overrides,
  ], { encoding: 'utf8' });
}

test('a CLI invocation closes a delivered-unclosed Job Order and the lifecycle ref shows the commit', (t) => {
  const fixture = deliveredUnclosedFixture(t);

  const closed = runCli(fixture);
  assert.equal(closed.status, 0, closed.stderr);
  const result = JSON.parse(closed.stdout);
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.state.status, 'terminal');
  assert.equal(result.state.disposition, 'closed-complete');
  assert.match(result.lifecycleCommitId, /^[a-f0-9]{40}$/);
  assert.equal(result.receipt.recovery.ref, fixture.lifecycleRef);
  assert.equal(result.receipt.recovery.sha, result.lifecycleCommitId);

  // the authoritative ref actually moved to that commit
  const tip = git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0];
  assert.equal(tip, result.lifecycleCommitId);
  assert.notEqual(tip, fixture.base);

  // and the committed state is the closed one
  const committed = JSON.parse(git(fixture.source, ['show', `${tip}:state/lifecycle.json`]));
  assert.equal(committed.status, 'terminal');
  assert.equal(committed.disposition, 'closed-complete');
  assert.equal(committed.recovery.ref, terminalPayload.recoveryRef);
  assert.equal(committed.journal.eventId, 'EVT-TERMINAL');
});

test('replaying the same terminal request is idempotent and moves the ref no further', (t) => {
  const fixture = deliveredUnclosedFixture(t);

  const closed = JSON.parse(runCli(fixture).stdout);
  assert.equal(closed.outcome, 'accepted');

  const replay = runCli(fixture);
  assert.equal(replay.status, 0, replay.stderr);
  const replayed = JSON.parse(replay.stdout);
  assert.equal(replayed.outcome, 'accepted-idempotent');
  assert.equal(replayed.receipt.receiptDigest, closed.receipt.receiptDigest);

  const tip = git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0];
  assert.equal(tip, closed.lifecycleCommitId, 'the ref did not advance a second time');
});

test('a denied Clearance records the denial and performs no terminal transition', (t) => {
  const fixture = deliveredUnclosedFixture(t);

  // 'freshness' is a required engineer gate; withholding it must deny.
  const denied = runCli(fixture, ['--gate-evidence', 'authority,single-writer']);
  assert.equal(denied.status, 1, 'a denial is never a successful exit');
  const result = JSON.parse(denied.stdout);
  assert.equal(result.outcome, 'deny-recorded');
  assert.match(result.denialRecord.denialId, /^DENY-[A-F0-9]{16}$/);
  assert.ok(result.denialRecord.deniedRuleIds.includes('gate.freshness-missing'));

  const tip = git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0];
  const committed = JSON.parse(git(fixture.source, ['show', `${tip}:state/lifecycle.json`]));
  assert.equal(committed.status, 'delivered-unclosed', 'the target transition never happened');
  assert.notEqual(committed.disposition, 'closed-complete');
  assert.match(git(fixture.source, ['show', `${tip}:${result.denialEventPath}`]), /"type":"passage\.denied"/);
});

test('the composition root fails closed rather than closing what is not closable', (t) => {
  // The engine only accepts a terminal transition out of delivered-unclosed or
  // closing. An unclaimed lifecycle is rejected, not quietly closed.
  const unclaimed = deliveredUnclosedFixture(t, 'unclaimed');
  const refused = runCli(unclaimed);
  assert.equal(refused.status, 1);
  const rejection = JSON.parse(refused.stdout);
  assert.equal(rejection.outcome, 'rejected');
  assert.ok(
    rejection.findings.some((finding) => /delivered-unclosed or closing state/.test(finding)),
    JSON.stringify(rejection.findings),
  );
  assert.equal(
    git(unclaimed.source, ['ls-remote', unclaimed.remote, unclaimed.lifecycleRef]).split(/\s+/)[0],
    unclaimed.base,
    'the ref never moved',
  );

  // An unreadable lifecycle ref is recovery, never a silent allow.
  const fixture = deliveredUnclosedFixture(t);
  const missingRef = runCli(fixture, ['--lifecycle-ref', 'refs/heads/instance-flights/absent']);
  assert.equal(missingRef.status, 1);
  assert.equal(JSON.parse(missingRef.stdout).outcome, 'recovery-required');
  assert.equal(
    git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0],
    fixture.base,
  );
});

test('an unusable Gatehouse policy refuses the invocation instead of degrading', (t) => {
  const fixture = deliveredUnclosedFixture(t);
  const brokenPolicy = join(fixture.root, 'broken-policy.json');
  writeFileSync(brokenPolicy, JSON.stringify({ schemaVersion: '1.0', actorClasses: {} }));
  const refused = runCli(fixture, ['--policy', brokenPolicy]);
  assert.equal(refused.status, 2, refused.stdout);
  assert.match(refused.stderr, /actorClasses must be a non-empty object/);
  assert.equal(
    git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0],
    fixture.base,
  );
});

test('the CLI refuses malformed invocation without touching the lifecycle', (t) => {
  const fixture = deliveredUnclosedFixture(t);
  for (const argv of [['status'], ['close', '--repository', fixture.source]]) {
    const refused = spawnSync(process.execPath, [cli, ...argv], { encoding: 'utf8' });
    assert.equal(refused.status, 2, refused.stdout);
    assert.match(refused.stderr, /usage: lifecycle\.mjs close/);
  }
  const tip = git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0];
  assert.equal(tip, fixture.base);
});
