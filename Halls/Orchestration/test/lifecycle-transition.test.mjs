import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestCanonical, validateJournalEvent } from '../../Knowledge/src/index.mjs';
import { compileClearancePolicy, evaluateClearance } from '../../Gatehouse/src/index.mjs';
import {
  classifyCasOutcome,
  createLifecycleTransitionExecutor,
} from '../src/index.mjs';

const syntheticJobOrder = Object.freeze({ id: 'JO-SYNTHETIC-001', revision: 'R1' });

function request(overrides = {}) {
  const nextState = {
    schemaVersion: '2.0',
    status: 'unclaimed',
    journal: { eventId: 'EVT-001', sequence: 1 },
    migration: { sourceSchemaVersion: '1.0' },
  };
  const event = {
    schemaVersion: '1.0',
    eventId: 'EVT-001',
    sequence: 1,
    type: 'migration.steward-serialization-imported',
    priorDigest: 'none',
    stateDigest: digestCanonical(nextState),
    payload: { source: 'synthetic-v1-unclaimed' },
  };
  return {
    schemaVersion: '1.0',
    currentState: { schemaVersion: '1.0', status: 'unclaimed' },
    nextState,
    event,
    predecessor: null,
    expectedTip: 'a'.repeat(40),
    actualTip: 'a'.repeat(40),
    jobOrder: syntheticJobOrder,
    action: 'lifecycle.migrate.v1-to-v2',
    requestedScope: ['state/lifecycle.json', 'journal/events/001-EVT-001.json'],
    clearance: { decision: 'allow', policyDigest: clearancePolicy.policyDigest },
    ...overrides,
  };
}

function continuationRequest(predecessor, overrides = {}) {
  const nextState = {
    schemaVersion: '2.0',
    status: 'unclaimed',
    journal: { eventId: 'EVT-002', sequence: 2 },
    migration: { sourceSchemaVersion: '1.0' },
  };
  return request({
    nextState,
    event: {
      schemaVersion: '1.0',
      eventId: 'EVT-002',
      sequence: 2,
      type: 'migration.steward-serialization-imported',
      priorDigest: digestCanonical(predecessor),
      stateDigest: digestCanonical(nextState),
      payload: { source: 'synthetic-v1-unclaimed' },
    },
    predecessor,
    requestedScope: ['state/lifecycle.json', 'journal/events/002-EVT-002.json'],
    ...overrides,
  });
}

const journalContract = { canonicalJson, validateJournalEvent };
const clearancePolicy = compileClearancePolicy(JSON.parse(readFileSync(
  new URL('../../Gatehouse/contracts/clearance-policy.json', import.meta.url),
  'utf8',
)));
function trustedConfigFor(input, overrides = {}) {
  return {
    journalContract,
    compiledPolicy: clearancePolicy,
    expectedPolicyDigest: clearancePolicy.policyDigest,
    jobOrder: syntheticJobOrder,
    actorClass: 'engineer',
    authorizedScope: { actions: ['lifecycle.migrate.v1-to-v2'], paths: input.requestedScope },
    gateEvidence: ['authority', 'freshness', 'single-writer'],
    evaluatedAt: '2026-08-28T12:00:00.000Z',
    ownerCommand: null,
    ...overrides,
  };
}

function clearanceFor(input, overrides = {}) {
  const context = trustedConfigFor(input, overrides);
  return evaluateClearance({
    compiledPolicy: context.compiledPolicy,
    actorClass: context.actorClass,
    authorizedScope: context.authorizedScope,
    gateEvidence: context.gateEvidence,
    evaluatedAt: context.evaluatedAt,
    ownerCommand: context.ownerCommand,
    request: { action: input.action, paths: input.requestedScope },
  });
}

function executorFor(input = request(), overrides = {}) {
  return createLifecycleTransitionExecutor(trustedConfigFor(input, overrides));
}

function git(cwd, args, input = undefined) {
  return execFileSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Lifecycle Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Lifecycle Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
  }).trim();
}

function repositoryFixture(t, {
  state = { schemaVersion: '1.0', status: 'unclaimed' },
  events = [],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'foundry-lifecycle-'));
  const remote = join(root, 'remote.git');
  const source = join(root, 'source');
  const lifecycleRef = 'refs/heads/instance-flights/fixture-order';
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--bare', remote]);
  git(root, ['init', source]);
  git(source, ['config', 'user.name', 'Lifecycle Fixture']);
  git(source, ['config', 'user.email', 'fixture@example.invalid']);
  if (state !== null) {
    mkdirSync(join(source, 'state'), { recursive: true });
    writeFileSync(join(source, 'state/lifecycle.json'), canonicalJson(state));
  }
  for (const { path, event } of events) {
    mkdirSync(join(source, 'journal/events'), { recursive: true });
    writeFileSync(join(source, path), canonicalJson(event));
  }
  writeFileSync(join(source, 'README.md'), 'preserve me\n');
  git(source, ['add', '.']);
  git(source, ['commit', '-m', 'fixture v1 state']);
  const base = git(source, ['rev-parse', 'HEAD']);
  git(source, ['push', remote, `${base}:${lifecycleRef}`]);
  return { remote, source, lifecycleRef, base };
}

function executeFor(fixture, input, clearanceOverrides = {}) {
  return executorFor(input, clearanceOverrides).execute({
    repositoryPath: fixture.source,
    remote: fixture.remote,
    lifecycleRef: fixture.lifecycleRef,
    request: input,
  });
}

function assertRejectedWithoutMutation(fixture, input, clearanceOverrides = {}) {
  const beforeTree = git(fixture.source, ['ls-tree', '-r', fixture.base]);
  const result = executeFor(fixture, input, clearanceOverrides);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.receiptDisposition, 'invalidate');
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
  assert.equal(git(fixture.source, ['ls-tree', '-r', fixture.base]), beforeTree);
}

function findingsFor(input, clearanceOverrides = {}) {
  return executorFor(request(), clearanceOverrides).validate(input);
}

function planFor(input, clearanceOverrides = {}) {
  return executorFor(request(), clearanceOverrides).plan(input);
}

test('only v1-unclaimed to v2-unclaimed with exact scope, tip, Clearance, and Journal pair is valid', () => {
  assert.deepEqual(findingsFor(request()), []);
  assert.ok(findingsFor(request({ schemaVersion: '9.0' })).some((finding) => finding.includes('schemaVersion')));
  assert.ok(findingsFor(request({ currentState: { schemaVersion: '1.0', status: 'claimed' } })).length > 0);
  assert.ok(findingsFor(request({ nextState: { schemaVersion: '2.0', status: 'claimed' } })).length > 0);
  assert.ok(findingsFor(request({ actualTip: 'c'.repeat(40) })).some((finding) => finding.includes('tip')));
  assert.ok(findingsFor(request({ requestedScope: ['state/lifecycle.json'] })).some((finding) => finding.includes('scope')));
  assert.ok(findingsFor(request({
    requestedScope: ['state/lifecycle.json', 'journal/events/001-EVT-001.json', 'extra.json'],
  })).some((finding) => finding.includes('exactly lifecycle state')));
  assert.ok(findingsFor(request({ clearance: { decision: 'deny', policyDigest: clearancePolicy.policyDigest } })).some((finding) => finding.includes('Clearance')));
});

test('plan contains exactly one canonical state write and one canonical Journal write', () => {
  const input = request();
  const plan = planFor(input);
  assert.equal(plan.outcome, 'ready');
  assert.equal(plan.expectedTip, input.expectedTip);
  assert.equal(plan.receiptDisposition, 'pending');
  assert.deepEqual(plan.findings, []);
  assert.deepEqual(plan.treePlan.writes.map(({ path }) => path), [
    'journal/events/001-EVT-001.json',
    'state/lifecycle.json',
  ]);
  assert.equal(plan.treePlan.writes[0].bytes, canonicalJson(input.event));
  assert.equal(plan.treePlan.writes[1].bytes, canonicalJson(input.nextState));
  assert.match(plan.treePlan.treeDigest, /^[a-f0-9]{64}$/);
});

test('invalid input produces no partial tree plan', () => {
  const input = request({ requestedScope: ['state/lifecycle.json'] });
  const result = planFor(input);
  assert.equal(result.outcome, 'rejected');
  assert.equal('treePlan' in result, false);
  assert.ok(result.findings.length > 0);

  const forged = request({ clearance: { decision: 'allow', policyDigest: '0'.repeat(64) } });
  assert.equal(planFor(forged).outcome, 'rejected');
});

test('CAS outcomes distinguish accepted, conflict, ambiguous, retryable pre-CAS, and recovery-required', () => {
  const plan = planFor(request());
  const candidate = { sha: 'c'.repeat(40), treeDigest: plan.treePlan.treeDigest };
  assert.deepEqual(classifyCasOutcome({ plan, candidate, pushResult: 'accepted', authoritativeTip: candidate.sha, authoritativeTreeDigest: candidate.treeDigest }), {
    outcome: 'accepted', receiptDisposition: 'consume', retry: false,
  });
  assert.equal(classifyCasOutcome({ plan, candidate, pushResult: 'conflict', authoritativeTip: 'd'.repeat(40) }).outcome, 'conflict');
  assert.equal(classifyCasOutcome({ plan, candidate, pushResult: 'ambiguous', authoritativeTip: candidate.sha, authoritativeTreeDigest: candidate.treeDigest }).outcome, 'ambiguous-resolved-accepted');
  assert.equal(classifyCasOutcome({ plan, candidate, pushResult: 'ambiguous', authoritativeTip: 'd'.repeat(40), authoritativeTreeDigest: 'e'.repeat(64) }).outcome, 'ambiguous-conflict');
  assert.equal(classifyCasOutcome({ plan, candidate: null, pushResult: 'not-attempted', preCasRetrySafe: true }).outcome, 'retryable-pre-cas');
  assert.equal(classifyCasOutcome({ plan, candidate, pushResult: 'ambiguous', authoritativeTip: null }).outcome, 'recovery-required');
  assert.equal(classifyCasOutcome({
    plan,
    candidate: { ...candidate, treeDigest: 'f'.repeat(64) },
    pushResult: 'accepted',
    authoritativeTip: candidate.sha,
    authoritativeTreeDigest: 'f'.repeat(64),
  }).outcome, 'recovery-required');
});

test('durable writer atomically advances one lifecycle ref and rejects a stale expected tip', (t) => {
  const fixture = repositoryFixture(t);
  const input = request({ expectedTip: fixture.base, actualTip: fixture.base });
  input.clearance = clearanceFor(input);
  assert.equal(input.clearance.decision, 'allow');
  const accepted = executeFor(fixture, input);

  assert.equal(accepted.outcome, 'accepted');
  assert.equal(accepted.receiptDisposition, 'consume');
  assert.match(accepted.candidateSha, /^[a-f0-9]{40}$/);
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], accepted.candidateSha);
  assert.equal(git(fixture.source, ['rev-parse', `${accepted.candidateSha}^`]), fixture.base);
  assert.equal(git(fixture.source, ['show', `${accepted.candidateSha}:README.md`]), 'preserve me');
  assert.equal(git(fixture.source, ['show', `${accepted.candidateSha}:state/lifecycle.json`]), canonicalJson(input.nextState));
  assert.equal(git(fixture.source, ['show', `${accepted.candidateSha}:journal/events/001-EVT-001.json`]), canonicalJson(input.event));

  const stale = executeFor(fixture, input);
  assert.equal(stale.outcome, 'conflict');
  assert.equal(stale.receiptDisposition, 'invalidate');
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], accepted.candidateSha);
});

test('durable writer rejects malformed input and unsafe transport arguments before mutation', (t) => {
  const fixture = repositoryFixture(t);
  const deniedInput = request({ expectedTip: fixture.base, actualTip: fixture.base });
  const missingGate = { gateEvidence: ['authority', 'freshness'] };
  deniedInput.clearance = clearanceFor(deniedInput, missingGate);
  assert.equal(executeFor(fixture, deniedInput, missingGate).outcome, 'rejected');

  const malformedInput = request({ requestedScope: ['state/lifecycle.json'] });
  const malformed = executeFor(fixture, malformedInput);
  assert.equal(malformed.outcome, 'rejected');
  assert.equal('candidateSha' in malformed, false);
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);

  assert.equal(executorFor().execute({
    repositoryPath: fixture.source,
    remote: '--upload-pack=unsafe',
    lifecycleRef: fixture.lifecycleRef,
    request: request({ expectedTip: fixture.base, actualTip: fixture.base }),
  }).outcome, 'recovery-required');
  assert.equal(executorFor().execute({
    repositoryPath: fixture.source,
    remote: fixture.remote,
    lifecycleRef: 'refs/heads/instance-flights/../unsafe',
    request: request({ expectedTip: fixture.base, actualTip: fixture.base }),
  }).outcome, 'recovery-required');
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
});

test('durable writer retains a retryable pre-CAS candidate after a proven remote rejection', (t) => {
  const fixture = repositoryFixture(t);
  const hook = join(fixture.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const input = request({ expectedTip: fixture.base, actualTip: fixture.base });
  input.clearance = clearanceFor(input);

  const result = executeFor(fixture, input);
  assert.equal(result.outcome, 'retryable-pre-cas');
  assert.equal(result.receiptDisposition, 'retain');
  assert.equal(result.retry, true);
  assert.match(result.candidateSha, /^[a-f0-9]{40}$/);
  assert.equal(result.authoritativeTip, fixture.base);
  assert.equal(git(fixture.source, ['ls-remote', fixture.remote, fixture.lifecycleRef]).split(/\s+/)[0], fixture.base);
});

test('durable writer rejects a missing authoritative lifecycle state without mutation', (t) => {
  const fixture = repositoryFixture(t, { state: null });
  assertRejectedWithoutMutation(fixture, request({ expectedTip: fixture.base, actualTip: fixture.base }));
});

test('durable writer rejects a caller state that differs from the authoritative tree without mutation', (t) => {
  const fixture = repositoryFixture(t, {
    state: { schemaVersion: '1.0', status: 'unclaimed', source: 'different' },
  });
  assertRejectedWithoutMutation(fixture, request({ expectedTip: fixture.base, actualTip: fixture.base }));
});

test('durable writer rejects pre-existing Journal history at a first-event boundary without mutation', (t) => {
  const fixture = repositoryFixture(t, {
    events: [{
      path: 'journal/events/001-EVT-OLD.json',
      event: { ...request().event, eventId: 'EVT-OLD' },
    }],
  });
  assertRejectedWithoutMutation(fixture, request({ expectedTip: fixture.base, actualTip: fixture.base }));
});

test('durable writer rejects an occupied target Journal event path without mutation', (t) => {
  const fixture = repositoryFixture(t, {
    events: [{
      path: 'journal/events/001-EVT-001.json',
      event: { ...request().event, payload: { source: 'pre-existing' } },
    }],
  });
  assertRejectedWithoutMutation(fixture, request({ expectedTip: fixture.base, actualTip: fixture.base }));
});

test('durable writer derives and rejects a mismatched caller predecessor without mutation', (t) => {
  const authoritativePredecessor = { ...request().event, eventId: 'EVT-OLD' };
  const callerPredecessor = {
    ...authoritativePredecessor,
    payload: { source: 'fabricated-predecessor' },
  };
  const fixture = repositoryFixture(t, {
    events: [{
      path: 'journal/events/001-EVT-OLD.json',
      event: authoritativePredecessor,
    }],
  });
  assertRejectedWithoutMutation(fixture, continuationRequest(callerPredecessor, {
    expectedTip: fixture.base,
    actualTip: fixture.base,
  }));
});

test('durable writer rejects nonempty Journal history beside authoritative v1 state without mutation', (t) => {
  const authoritativePredecessor = request().event;
  const fixture = repositoryFixture(t, {
    events: [{
      path: 'journal/events/001-EVT-001.json',
      event: authoritativePredecessor,
    }],
  });
  assertRejectedWithoutMutation(fixture, continuationRequest(authoritativePredecessor, {
    expectedTip: fixture.base,
    actualTip: fixture.base,
  }));
});

test('durable writer binds caller Clearance to trusted Gatehouse evaluation before mutation', async (t) => {
  const cases = [
    {
      name: 'forged allow digest',
      prepare: (input) => {
        input.clearance = { decision: 'allow', policyDigest: '0'.repeat(64) };
        return {};
      },
    },
    { name: 'wrong actor', prepare: () => ({ actorClass: 'observer' }) },
    { name: 'omitted required gate', prepare: () => ({ gateEvidence: ['authority', 'freshness'] }) },
    {
      name: 'wrong authorized action',
      prepare: (input) => ({
        authorizedScope: { actions: ['lifecycle.close'], paths: input.requestedScope },
      }),
    },
    {
      name: 'wrong authorized path',
      prepare: () => ({
        authorizedScope: { actions: ['lifecycle.migrate.v1-to-v2'], paths: ['state/lifecycle.json'] },
      }),
    },
    {
      name: 'expired Owner Command',
      prepare: (input) => ({
        actorClass: 'owner',
        authorizedScope: { actions: ['lifecycle.migrate.v1-to-v2'], paths: input.requestedScope },
        gateEvidence: ['owner-command', 'audit'],
        ownerCommand: {
          commandId: 'CMD-EXPIRED',
          actions: ['lifecycle.migrate.v1-to-v2'],
          paths: input.requestedScope,
          expiresAt: '2026-08-28T11:00:00.000Z',
          reason: 'expired synthetic override',
          proofGates: ['audit'],
        },
      }),
    },
    {
      name: 'mismatched compiled policy digest',
      prepare: (input) => {
        input.clearance = { decision: 'allow', policyDigest: '0'.repeat(64) };
        return { compiledPolicy: { ...clearancePolicy, policyDigest: '0'.repeat(64) } };
      },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, (fixtureTest) => {
      const fixture = repositoryFixture(fixtureTest);
      const input = request({ expectedTip: fixture.base, actualTip: fixture.base });
      assertRejectedWithoutMutation(fixture, input, scenario.prepare(input));
    });
  }
});

test('durable writer rejects a caller-substituted Clearance trust root before Git read or mutation', (t) => {
  const fixture = repositoryFixture(t);
  let substitutedEvaluatorCalls = 0;
  const input = request({
    expectedTip: fixture.base,
    actualTip: fixture.base,
    clearanceContext: {
      contract: {
        evaluateClearance: () => {
          substitutedEvaluatorCalls += 1;
          return { decision: 'allow', policyDigest: '0'.repeat(64) };
        },
      },
      compiledPolicy: { policy: {}, policyDigest: '0'.repeat(64) },
      expectedPolicyDigest: '0'.repeat(64),
      authorizedScope: {
        actions: ['lifecycle.migrate.v1-to-v2'],
        paths: ['state/lifecycle.json', 'journal/events/001-EVT-001.json'],
      },
    },
  });
  input.clearance = { decision: 'allow', policyDigest: '0'.repeat(64) };

  assertRejectedWithoutMutation(fixture, input);
  const noGit = executorFor().execute({
    repositoryPath: join(fixture.source, 'must-not-be-read'),
    remote: fixture.remote,
    lifecycleRef: fixture.lifecycleRef,
    request: input,
  });
  assert.equal(noGit.outcome, 'rejected');
  assert.ok(noGit.findings.some((finding) => finding.includes('trusted Clearance configuration')));
  assert.equal(substitutedEvaluatorCalls, 0);
});

test('durable writer rejects the wrong bound Job Order ID or revision before Git read or mutation', async (t) => {
  for (const [name, jobOrder] of [
    ['wrong id', { id: 'JO-SYNTHETIC-999', revision: 'R1' }],
    ['wrong revision', { id: 'JO-SYNTHETIC-001', revision: 'R2' }],
  ]) {
    await t.test(name, (fixtureTest) => {
      const fixture = repositoryFixture(fixtureTest);
      const input = request({ expectedTip: fixture.base, actualTip: fixture.base, jobOrder });
      assertRejectedWithoutMutation(fixture, input);
      const noGit = executorFor().execute({
        repositoryPath: join(fixture.source, 'must-not-be-read'),
        remote: fixture.remote,
        lifecycleRef: fixture.lifecycleRef,
        request: input,
      });
      assert.equal(noGit.outcome, 'rejected');
      assert.ok(noGit.findings.some((finding) => finding.includes('Job Order')));
    });
  }
});
