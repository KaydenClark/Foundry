import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalJson,
  digestCanonical,
  projectJournalHealth,
  recoverJournal,
  validateJournalEvent,
} from '../../Knowledge/src/index.mjs';
import { compileClearancePolicy } from '../../Gatehouse/src/index.mjs';
import {
  createLifecycleEngine,
  projectLifecycle,
  reconcileParentState,
  repairKeyFor,
} from '../src/index.mjs';

const syntheticJobOrder = Object.freeze({ id: 'JO-SYNTHETIC-ENGINE', revision: 'R1' });
const policy = compileClearancePolicy(JSON.parse(readFileSync(
  new URL('../../Gatehouse/contracts/clearance-policy.json', import.meta.url),
  'utf8',
)));
const journalContract = {
  canonicalJson,
  digestCanonical,
  projectJournalHealth,
  recoverJournal,
  validateJournalEvent,
};

function git(cwd, args, input = undefined) {
  return execFileSync('/usr/bin/git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      GIT_AUTHOR_NAME: 'Lifecycle Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Lifecycle Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim();
}

function repositoryFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'foundry-lifecycle-engine-'));
  const remote = join(root, 'remote.git');
  const source = join(root, 'source');
  const lifecycleRef = 'refs/heads/instance-flights/synthetic-order';
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--bare', remote]);
  git(root, ['init', source]);
  mkdirSync(join(source, 'state'), { recursive: true });
  writeFileSync(join(source, 'state/lifecycle.json'), canonicalJson({ schemaVersion: '2.0', kind: 'child', status: 'unclaimed' }));
  writeFileSync(join(source, 'README.md'), 'preserve me\n');
  git(source, ['add', '.']);
  git(source, ['commit', '-m', 'synthetic lifecycle root']);
  const base = git(source, ['rev-parse', 'HEAD']);
  git(source, ['push', remote, `${base}:${lifecycleRef}`]);
  return { root, remote, source, lifecycleRef, base };
}

function engine(overrides = {}) {
  return createLifecycleEngine({
    journalContract,
    compiledPolicy: policy,
    expectedPolicyDigest: policy.policyDigest,
    jobOrder: syntheticJobOrder,
    actorClass: 'engineer',
    authorizedActions: [
      'lifecycle.claim',
      'lifecycle.handoff',
      'lifecycle.terminal',
      'lifecycle.repair',
      'lifecycle.parent.ingest-child',
    ],
    authorizedPathPrefixes: ['state/', 'journal/events/'],
    gateEvidence: ['authority', 'freshness', 'single-writer'],
    evaluatedAt: '2026-08-29T12:00:00.000Z',
    gitExecutable: '/usr/bin/git',
    ...overrides,
  });
}

function mutation({ action, currentState, nextState, predecessor, expectedTip, eventId, type, payload }) {
  const sequence = (predecessor?.sequence ?? 0) + 1;
  const event = {
    schemaVersion: '2.0',
    eventId,
    sequence,
    type,
    priorDigest: predecessor ? digestCanonical(predecessor) : 'none',
    stateDigest: digestCanonical(nextState),
    payload,
  };
  const requestedScope = [
    'state/lifecycle.json',
    `journal/events/${String(sequence).padStart(3, '0')}-${eventId}.json`,
  ];
  const request = {
    schemaVersion: '2.0',
    currentState,
    nextState,
    event,
    predecessor,
    expectedTip,
    jobOrder: syntheticJobOrder,
    action,
    requestedScope,
  };
  request.clearance = engine().clearanceFor(request);
  return request;
}

test('durable engine commits claim, handoff, and terminal events with recoverable receipts', (t) => {
  const fixture = repositoryFixture(t);
  const projections = [];
  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
    projectionSink: (capture) => projections.push(capture),
  });
  const unclaimed = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const claimed = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const claim = mutation({
    action: 'lifecycle.claim', currentState: unclaimed, nextState: claimed,
    predecessor: null, expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  claim.clearance = lifecycle.clearanceFor(claim);
  const acceptedClaim = lifecycle.execute({ request: claim });
  assert.equal(acceptedClaim.outcome, 'accepted');
  assert.match(acceptedClaim.receipt.receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(acceptedClaim.receipt.recovery.sha, acceptedClaim.candidateSha);

  const active = {
    ...claimed,
    status: 'closing',
    handoff: { handoffFuid: 'HND001' },
    journal: { eventId: 'EVT-HANDOFF', sequence: 2 },
  };
  const handoff = mutation({
    action: 'lifecycle.handoff', currentState: claimed, nextState: active,
    predecessor: claim.event, expectedTip: acceptedClaim.candidateSha,
    eventId: 'EVT-HANDOFF', type: 'handoff.accepted',
    payload: { handoffFuid: 'HND001', accepted: true },
  });
  handoff.clearance = lifecycle.clearanceFor(handoff);
  const acceptedHandoff = lifecycle.execute({ request: handoff });
  assert.equal(acceptedHandoff.outcome, 'accepted');

  const terminal = {
    ...active,
    status: 'terminal',
    disposition: 'closed-complete',
    recovery: { ref: 'synthetic-integration', sha: 'b'.repeat(40) },
    journal: { eventId: 'EVT-TERMINAL', sequence: 3 },
  };
  const terminalPayload = {
    disposition: 'closed-complete',
    artifactDigest: 'c'.repeat(64),
    postflightDigest: 'd'.repeat(64),
    recoveryRef: 'synthetic-integration',
    recoverySha: 'b'.repeat(40),
    planeDigests: {
      canon: '1'.repeat(64), intent: '2'.repeat(64), actuality: '3'.repeat(64),
      grounding: '4'.repeat(64), enduringContext: '5'.repeat(64), projection: '6'.repeat(64),
    },
  };
  const close = mutation({
    action: 'lifecycle.terminal', currentState: active, nextState: terminal,
    predecessor: handoff.event, expectedTip: acceptedHandoff.candidateSha,
    eventId: 'EVT-TERMINAL', type: 'terminal.accepted', payload: terminalPayload,
  });
  close.clearance = lifecycle.clearanceFor(close);
  const acceptedClose = lifecycle.execute({ request: close });
  assert.equal(acceptedClose.outcome, 'accepted');
  assert.equal(acceptedClose.closureBlocked, false);
  assert.equal(projections.length, 3);
  assert.equal(projections.at(-1).lifecycle.status, 'terminal');

  const replay = lifecycle.execute({ request: close });
  assert.equal(replay.outcome, 'accepted-idempotent');
  assert.equal(replay.receipt.receiptDigest, acceptedClose.receipt.receiptDigest);
  const conflict = structuredClone(close);
  conflict.event.payload.artifactDigest = 'e'.repeat(64);
  assert.equal(lifecycle.execute({ request: conflict }).outcome, 'recovery-required');
});

test('a denied target persists one non-recursive denial event and never performs the target transition', (t) => {
  const fixture = repositoryFixture(t);
  const blockedEngine = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
    gateEvidence: ['authority', 'single-writer'],
  });
  const unclaimed = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const claimed = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState: unclaimed, nextState: claimed,
    predecessor: null, expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = blockedEngine.clearanceFor(request);
  assert.equal(request.clearance.decision, 'deny');
  const result = blockedEngine.execute({ request });
  assert.equal(result.outcome, 'deny-recorded');
  assert.equal(git(fixture.source, ['show', `${result.candidateSha}:state/lifecycle.json`]).includes('"status":"claimed"'), false);
  assert.match(git(fixture.source, ['show', `${result.candidateSha}:${result.denialEventPath}`]), /"type":"passage.denied"/);
  const replayed = blockedEngine.execute({ request });
  assert.equal(replayed.outcome, 'deny-recorded-idempotent');
  assert.equal(replayed.receipt.receiptDigest, result.receipt.receiptDigest);

  const rejected = repositoryFixture(t);
  const hook = join(rejected.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const retryRequest = structuredClone(request);
  retryRequest.expectedTip = rejected.base;
  const rejectedEngine = engine({
    repositoryPath: rejected.source, remote: rejected.remote, lifecycleRef: rejected.lifecycleRef,
    gateEvidence: ['authority', 'single-writer'],
  });
  const unrecorded = rejectedEngine.execute({ request: retryRequest });
  assert.equal(unrecorded.outcome, 'deny-unrecorded');
  assert.equal(unrecorded.recoveryRequired, true);
  assert.equal(git(rejected.source, ['ls-remote', rejected.remote, rejected.lifecycleRef]).split(/\s+/)[0], rejected.base);
});

test('bounded repair permits one exact failure identity and exhausts its budget', () => {
  const input = {
    jobOrder: syntheticJobOrder,
    runFuid: 'RUN001',
    failureIdentity: 'verification.failed',
    exactTip: 'a'.repeat(40),
    affectedRefsDigest: 'b'.repeat(64),
    authorizedScopeDigest: 'c'.repeat(64),
  };
  const repairKey = repairKeyFor(input);
  const current = { schemaVersion: '2.0', kind: 'child', status: 'blocked' };
  const first = engine().planRepair(current, input);
  assert.equal(first.outcome, 'ready');
  assert.deepEqual(first.nextState.repair, { repairKey, repairAttempt: 1, repairBudget: 1 });
  assert.equal(engine().planRepair(first.nextState, input).outcome, 'repair-exhausted');
  assert.equal(engine().planRepair(current, { ...input, protectedScope: true }).outcome, 'rejected');
});

test('parent reconciliation is idempotent and conflicting child reuse requires recovery', () => {
  const parent = {
    schemaVersion: '2.0', kind: 'parent', status: 'active',
    requiredChildIds: ['CHILD-A', 'CHILD-B'], childReceipts: {},
  };
  const childA = {
    childId: 'CHILD-A', childEventId: 'EVT-A', childLifecycleCommitId: 'a'.repeat(40),
    revision: 'R1', runFuid: 'RUNA01', disposition: 'closed-complete',
    artifactDigest: '1'.repeat(64), postflightDigest: '2'.repeat(64),
    recoveryRef: 'synthetic-a', recoverySha: '3'.repeat(40), payloadDigest: '4'.repeat(64),
  };
  const first = reconcileParentState(parent, childA);
  assert.equal(first.outcome, 'updated');
  assert.equal(first.state.status, 'active');
  assert.equal(reconcileParentState(first.state, structuredClone(childA)).outcome, 'idempotent');
  assert.equal(reconcileParentState(first.state, { ...childA, payloadDigest: '5'.repeat(64) }).outcome, 'recovery-required');
  const priorParent = structuredClone(first.state);
  const rewrittenIdentity = reconcileParentState(first.state, {
    ...childA,
    childEventId: 'EVT-A-REWRITTEN',
    payloadDigest: '5'.repeat(64),
  });
  assert.equal(rewrittenIdentity.outcome, 'recovery-required');
  assert.equal(rewrittenIdentity.state, undefined);
  assert.deepEqual(first.state, priorParent);

  const childB = { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B', childLifecycleCommitId: 'b'.repeat(40) };
  const complete = reconcileParentState(first.state, childB);
  assert.equal(complete.state.status, 'closing');
});

test('parent reconciliation rejects lifecycle commit reuse across child receipts without mutation', () => {
  const parent = {
    schemaVersion: '2.0', kind: 'parent', status: 'active',
    requiredChildIds: ['CHILD-A', 'CHILD-B'], childReceipts: {},
  };
  const childA = {
    childId: 'CHILD-A', childEventId: 'EVT-A', childLifecycleCommitId: 'a'.repeat(40),
    revision: 'R1', runFuid: 'RUNA01', disposition: 'closed-complete',
    artifactDigest: '1'.repeat(64), postflightDigest: '2'.repeat(64),
    recoveryRef: 'synthetic-a', recoverySha: '3'.repeat(40), payloadDigest: '4'.repeat(64),
  };
  const first = reconcileParentState(parent, childA);
  assert.equal(first.outcome, 'updated');
  assert.equal(reconcileParentState(first.state, structuredClone(childA)).outcome, 'idempotent');

  const collisions = [
    { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B' },
    { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B-PAYLOAD', payloadDigest: '5'.repeat(64) },
    { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B-DISPOSITION', disposition: 'blocked' },
    { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B-RUN', runFuid: 'RUNB01' },
    { ...childA, childId: 'CHILD-B', childEventId: 'EVT-B-STATUS', status: 'closed' },
  ];
  const before = structuredClone(first.state);
  for (const collision of collisions) {
    const result = reconcileParentState(first.state, collision);
    assert.equal(result.outcome, 'recovery-required');
    assert.equal(result.state, undefined);
    assert.deepEqual(first.state, before);
  }

  const corruptParent = structuredClone(first.state);
  corruptParent.childReceipts['EVT-B'] = {
    ...childA,
    childId: 'CHILD-B',
    childEventId: 'EVT-B',
  };
  const corruptBefore = structuredClone(corruptParent);
  const result = reconcileParentState(corruptParent, structuredClone(childA));
  assert.equal(result.outcome, 'recovery-required');
  assert.equal(result.state, undefined);
  assert.deepEqual(corruptParent, corruptBefore);
});

test('parent reconciliation returns recovery-required for malformed child receipt maps without mutation', () => {
  const childReceipt = {
    childId: 'CHILD-A', childEventId: 'EVT-A', childLifecycleCommitId: 'a'.repeat(40),
    revision: 'R1', runFuid: 'RUNA01', disposition: 'closed-complete',
    artifactDigest: '1'.repeat(64), postflightDigest: '2'.repeat(64),
    recoveryRef: 'synthetic-a', recoverySha: '3'.repeat(40), payloadDigest: '4'.repeat(64),
  };
  for (const malformed of [null, [], { 'EVT-BROKEN': null }]) {
    const parent = {
      schemaVersion: '2.0', kind: 'parent', status: 'active',
      requiredChildIds: ['CHILD-A'], childReceipts: malformed,
    };
    const before = structuredClone(parent);
    let result;
    assert.doesNotThrow(() => { result = reconcileParentState(parent, childReceipt); });
    assert.equal(result.outcome, 'recovery-required');
    assert.equal(result.state, undefined);
    assert.deepEqual(parent, before);
  }
});

test('Projection is exact-commit-bound and a sink failure blocks closure without rolling back authority', (t) => {
  assert.throws(() => projectLifecycle({ state: {}, event: {}, lifecycleCommitId: 'bad' }), /commit/);
  const fixture = repositoryFixture(t);
  const failing = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
    projectionSink: () => { throw new Error('synthetic sink failure'); },
  });
  const currentState = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const nextState = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState, nextState, predecessor: null,
    expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = failing.clearanceFor(request);
  const result = failing.execute({ request });
  assert.equal(result.outcome, 'accepted-projection-failed');
  assert.equal(result.closureBlocked, true);
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], result.candidateSha);
});

test('engine rejects malformed historical Journal events before advancing the lifecycle ref', (t) => {
  const fixture = repositoryFixture(t);
  mkdirSync(join(fixture.source, 'journal/events'), { recursive: true });

  const badState = {
    schemaVersion: '2.0', kind: 'child', status: 'unclaimed',
    journal: { eventId: 'EVT-BAD', sequence: 1 },
  };
  const badEvent = {
    schemaVersion: '2.0', eventId: 'EVT-BAD', sequence: 1, type: 'not-valid',
    priorDigest: 'none', stateDigest: digestCanonical(badState),
    payload: { secret: 'must-not-survive' },
  };
  writeFileSync(join(fixture.source, 'state/lifecycle.json'), canonicalJson(badState));
  writeFileSync(join(fixture.source, 'journal/events/001-EVT-BAD.json'), canonicalJson(badEvent));
  git(fixture.source, ['add', 'state/lifecycle.json', 'journal/events/001-EVT-BAD.json']);
  git(fixture.source, ['commit', '-m', 'seed malformed history']);

  const currentState = {
    schemaVersion: '2.0', kind: 'child', status: 'unclaimed',
    journal: { eventId: 'EVT-GOOD', sequence: 2 },
  };
  const goodEvent = {
    schemaVersion: '2.0', eventId: 'EVT-GOOD', sequence: 2, type: 'history.imported',
    priorDigest: digestCanonical(badEvent), stateDigest: digestCanonical(currentState), payload: {},
  };
  writeFileSync(join(fixture.source, 'state/lifecycle.json'), canonicalJson(currentState));
  writeFileSync(join(fixture.source, 'journal/events/002-EVT-GOOD.json'), canonicalJson(goodEvent));
  git(fixture.source, ['add', 'state/lifecycle.json', 'journal/events/002-EVT-GOOD.json']);
  git(fixture.source, ['commit', '-m', 'seed superficially valid tip']);
  const seededTip = git(fixture.source, ['rev-parse', 'HEAD']);
  git(fixture.source, ['push', fixture.remote, `${seededTip}:${fixture.lifecycleRef}`]);

  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const nextState = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 3 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState, nextState, predecessor: goodEvent,
    expectedTip: seededTip, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = lifecycle.clearanceFor(request);

  const result = lifecycle.execute({ request });
  assert.equal(result.outcome, 'recovery-required');
  assert.ok(result.findings.some((finding) => finding.includes("EVT-BAD")));
  assert.ok(result.findings.some((finding) => finding.includes('dotted identifier')));
  assert.ok(result.findings.some((finding) => finding.includes("forbids private operational field 'secret'")));
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], seededTip);
});

test('engine rejects duplicate historical event identities before advancing the lifecycle ref', (t) => {
  const fixture = repositoryFixture(t);
  mkdirSync(join(fixture.source, 'journal/events'), { recursive: true });

  const claimedState = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-DUP', sequence: 1 },
  };
  const claimEvent = {
    schemaVersion: '2.0', eventId: 'EVT-DUP', sequence: 1, type: 'claim.accepted',
    priorDigest: 'none', stateDigest: digestCanonical(claimedState),
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  };
  writeFileSync(join(fixture.source, 'state/lifecycle.json'), canonicalJson(claimedState));
  writeFileSync(join(fixture.source, 'journal/events/001-EVT-DUP.json'), canonicalJson(claimEvent));
  git(fixture.source, ['add', 'state/lifecycle.json', 'journal/events/001-EVT-DUP.json']);
  git(fixture.source, ['commit', '-m', 'seed first duplicate identity']);

  const currentState = {
    ...claimedState,
    status: 'active',
    handoff: { handoffFuid: 'HND001' },
    journal: { eventId: 'EVT-DUP', sequence: 2 },
  };
  const handoffEvent = {
    schemaVersion: '2.0', eventId: 'EVT-DUP', sequence: 2, type: 'handoff.accepted',
    priorDigest: digestCanonical(claimEvent), stateDigest: digestCanonical(currentState),
    payload: { handoffFuid: 'HND001', accepted: true },
  };
  writeFileSync(join(fixture.source, 'state/lifecycle.json'), canonicalJson(currentState));
  writeFileSync(join(fixture.source, 'journal/events/002-EVT-DUP.json'), canonicalJson(handoffEvent));
  git(fixture.source, ['add', 'state/lifecycle.json', 'journal/events/002-EVT-DUP.json']);
  git(fixture.source, ['commit', '-m', 'seed second duplicate identity']);
  const seededTip = git(fixture.source, ['rev-parse', 'HEAD']);
  git(fixture.source, ['push', fixture.remote, `${seededTip}:${fixture.lifecycleRef}`]);

  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const nextState = {
    ...currentState,
    status: 'closing',
    handoff: { handoffFuid: 'HND002' },
    journal: { eventId: 'EVT-NEXT', sequence: 3 },
  };
  const request = mutation({
    action: 'lifecycle.handoff', currentState, nextState, predecessor: handoffEvent,
    expectedTip: seededTip, eventId: 'EVT-NEXT', type: 'handoff.accepted',
    payload: { handoffFuid: 'HND002', accepted: true },
  });
  request.clearance = lifecycle.clearanceFor(request);

  const result = lifecycle.execute({ request });
  assert.equal(result.outcome, 'recovery-required');
  assert.ok(result.findings.some((finding) => finding.includes("duplicate historical event identity 'EVT-DUP'")));
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], seededTip);
});

test('engine rejects non-canonical or rewritten raw Journal bytes before idempotency or ref mutation', async (t) => {
  const variants = [
    ['pretty-print', (event) => JSON.stringify(event, null, 2)],
    ['key-order', (event) => JSON.stringify({
      type: event.type,
      schemaVersion: event.schemaVersion,
      sequence: event.sequence,
      payload: event.payload,
      eventId: event.eventId,
      stateDigest: event.stateDigest,
      priorDigest: event.priorDigest,
    })],
  ];
  for (const [name, rewrite] of variants) {
    await t.test(name, (st) => {
      const fixture = repositoryFixture(st);
      mkdirSync(join(fixture.source, 'journal/events'), { recursive: true });
      const currentState = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
      const claimedState = {
        schemaVersion: '2.0', kind: 'child', status: 'claimed',
        claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
        journal: { eventId: 'EVT-CLAIM', sequence: 1 },
      };
      const claimEvent = {
        schemaVersion: '2.0', eventId: 'EVT-CLAIM', sequence: 1, type: 'claim.accepted',
        priorDigest: 'none', stateDigest: digestCanonical(claimedState),
        payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
      };
      const eventFile = join(fixture.source, 'journal/events/001-EVT-CLAIM.json');
      writeFileSync(join(fixture.source, 'state/lifecycle.json'), canonicalJson(claimedState));
      writeFileSync(eventFile, canonicalJson(claimEvent));
      git(fixture.source, ['add', 'state/lifecycle.json', 'journal/events/001-EVT-CLAIM.json']);
      git(fixture.source, ['commit', '-m', 'introduce canonical event']);
      writeFileSync(eventFile, rewrite(claimEvent));
      git(fixture.source, ['add', 'journal/events/001-EVT-CLAIM.json']);
      git(fixture.source, ['commit', '-m', `rewrite event bytes ${name}`]);
      const rewrittenTip = git(fixture.source, ['rev-parse', 'HEAD']);
      git(fixture.source, ['push', fixture.remote, `${rewrittenTip}:${fixture.lifecycleRef}`]);

      const lifecycle = engine({
        repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
      });
      const request = mutation({
        action: 'lifecycle.claim', currentState, nextState: claimedState,
        predecessor: null, expectedTip: rewrittenTip, eventId: 'EVT-CLAIM', type: 'claim.accepted',
        payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
      });
      request.clearance = lifecycle.clearanceFor(request);
      const result = lifecycle.execute({ request });
      assert.equal(result.outcome, 'recovery-required');
      assert.ok(result.findings.some((finding) => finding.includes('canonical raw bytes')));
      assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], rewrittenTip);
    });
  }
});

test('engine ignores ambient mode-0777 TMPDIR and poisoned parent repositories', (t) => {
  const fixture = repositoryFixture(t);
  const forged = join(fixture.root, 'forged.git');
  git(fixture.root, ['init', '--bare', forged]);
  git(fixture.source, ['push', forged, `${fixture.base}:${fixture.lifecycleRef}`]);

  const poisonRoot = mkdtempSync(join(tmpdir(), 'foundry-lifecycle-engine-tmpdir-poison-'));
  t.after(() => rmSync(poisonRoot, { recursive: true, force: true }));
  chmodSync(poisonRoot, 0o777);
  git(poisonRoot, ['init']);
  git(poisonRoot, ['config', `url.${forged}.insteadOf`, fixture.remote]);
  const hook = join(fixture.remote, 'hooks/pre-receive');
  writeFileSync(hook, [
    '#!/bin/sh',
    'case "$TMPDIR" in',
    '  /private/tmp/foundry-lifecycle-engine-git-*) exit 0 ;;',
    '  *) exit 1 ;;',
    'esac',
    '',
  ].join('\n'));
  chmodSync(hook, 0o755);

  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const currentState = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const nextState = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState, nextState, predecessor: null,
    expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = lifecycle.clearanceFor(request);

  const previous = Object.fromEntries(['TMPDIR', 'TMP', 'TEMP'].map((key) => [key, process.env[key]]));
  let result;
  try {
    process.env.TMPDIR = poisonRoot;
    process.env.TMP = poisonRoot;
    process.env.TEMP = poisonRoot;
    result = lifecycle.execute({ request });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.equal(result.outcome, 'accepted');
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], result.candidateSha);
  assert.equal(git(fixture.source, ['ls-remote', forged, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
});

test('engine never executes a lifecycle checkout default pre-push hook', (t) => {
  const fixture = repositoryFixture(t);
  const marker = join(fixture.root, 'untrusted-pre-push-ran');
  const hook = join(fixture.source, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, `#!/bin/sh\nprintf hook-ran > "${marker}"\n`);
  chmodSync(hook, 0o755);

  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const unclaimed = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const claimed = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState: unclaimed, nextState: claimed,
    predecessor: null, expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = lifecycle.clearanceFor(request);

  assert.equal(lifecycle.execute({ request }).outcome, 'accepted');
  assert.equal(readFileSync(marker, { encoding: 'utf8', flag: 'a+' }), '');
});

test('engine rejects a mismatched request before any Git read or idempotent receipt', (t) => {
  const fixture = repositoryFixture(t);
  const marker = join(fixture.root, 'git-invocations');
  const recorder = join(fixture.root, 'recording-git');
  writeFileSync(recorder, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${marker}"\nexec /usr/bin/git "$@"\n`);
  chmodSync(recorder, 0o755);
  const lifecycle = engine({
    gitExecutable: recorder, repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const unclaimed = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const claimed = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState: unclaimed, nextState: claimed,
    predecessor: null, expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = lifecycle.clearanceFor(request);
  assert.equal(lifecycle.execute({ request }).outcome, 'accepted');
  writeFileSync(marker, '');

  const cases = [
    {
      name: 'Job Order identity',
      mutate: (candidate) => { candidate.jobOrder.id = 'JO-WRONG-IDENTITY'; },
      finding: /Job Order does not match trusted identity/i,
    },
    {
      name: 'action',
      mutate: (candidate) => { candidate.action = 'lifecycle.handoff'; },
      finding: /claimed Clearance|handoff/i,
    },
    {
      name: 'next-state digest',
      mutate: (candidate) => { candidate.nextState.status = 'handed-off'; },
      finding: /stateDigest|next state/i,
    },
  ];
  for (const testCase of cases) {
    const mismatched = structuredClone(request);
    testCase.mutate(mismatched);
    const result = lifecycle.execute({ request: mismatched });
    assert.equal(result.outcome, 'rejected', testCase.name);
    assert.match(result.findings.join('\n'), testCase.finding, testCase.name);
    assert.equal(readFileSync(marker, 'utf8'), '', testCase.name);
  }
});

test('engine rejects repository-local transport redirects before any lifecycle read or mutation', (t) => {
  const fixture = repositoryFixture(t);
  const forged = join(fixture.root, 'forged.git');
  git(fixture.root, ['init', '--bare', forged]);
  git(fixture.source, ['push', forged, `${fixture.base}:${fixture.lifecycleRef}`]);
  git(fixture.source, ['config', `url.${forged}.insteadOf`, fixture.remote]);

  const lifecycle = engine({
    repositoryPath: fixture.source, remote: fixture.remote, lifecycleRef: fixture.lifecycleRef,
  });
  const currentState = { schemaVersion: '2.0', kind: 'child', status: 'unclaimed' };
  const nextState = {
    schemaVersion: '2.0', kind: 'child', status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const request = mutation({
    action: 'lifecycle.claim', currentState, nextState, predecessor: null,
    expectedTip: fixture.base, eventId: 'EVT-CLAIM', type: 'claim.accepted',
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  });
  request.clearance = lifecycle.clearanceFor(request);
  const result = lifecycle.execute({ request, remote: forged, lifecycleRef: 'refs/heads/instance-flights/other' });
  assert.equal(result.outcome, 'recovery-required');
  assert.ok(result.findings.some((finding) => finding.includes('repository-local Git transport')));
  assert.equal(git(fixture.source, ['ls-remote', forged, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
});
