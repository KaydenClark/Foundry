import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  compileClearancePolicy,
  createDenialRecord,
  evaluateClearance,
  projectPassage,
} from '../src/index.mjs';

const policy = JSON.parse(readFileSync(new URL('../contracts/clearance-policy.json', import.meta.url), 'utf8'));

function request(overrides = {}) {
  return {
    compiledPolicy: compileClearancePolicy(policy),
    actorClass: 'engineer',
    authorizedScope: {
      actions: ['lifecycle.migrate.v1-to-v2'],
      paths: ['state/lifecycle.json', 'journal/events/001-migration.json'],
    },
    request: {
      action: 'lifecycle.migrate.v1-to-v2',
      paths: ['state/lifecycle.json', 'journal/events/001-migration.json'],
    },
    gateEvidence: ['authority', 'freshness', 'single-writer'],
    evaluatedAt: '2026-08-28T12:00:00.000Z',
    ...overrides,
  };
}

test('compiler is deterministic and rejects malformed policy', () => {
  const first = compileClearancePolicy(policy);
  const second = compileClearancePolicy(structuredClone(policy));
  assert.equal(first.policyDigest, second.policyDigest);
  assert.throws(() => compileClearancePolicy({ ...policy, schemaVersion: '9.0' }), /schemaVersion/);
  assert.throws(() => compileClearancePolicy({ ...policy, actorClasses: {} }), /actorClasses/);
  assert.throws(() => evaluateClearance(request({
    compiledPolicy: { ...first, policyDigest: '0'.repeat(64) },
  })), /digest mismatch/);
});

test('allow is a cap over exact authorized action, paths, class, and gates', () => {
  const result = evaluateClearance(request());
  assert.equal(result.decision, 'allow');
  assert.deepEqual(result.deniedRuleIds, []);
  assert.equal(result.denialReceipt, null);

  for (const changed of [
    { actorClass: 'observer' },
    { request: { action: 'lifecycle.close', paths: ['state/lifecycle.json'] } },
    { request: { action: 'lifecycle.migrate.v1-to-v2', paths: ['state/other.json'] } },
    { authorizedScope: { actions: ['lifecycle.migrate.v1-to-v2', 'lifecycle.close'], paths: request().request.paths } },
    { authorizedScope: { actions: ['lifecycle.migrate.v1-to-v2'], paths: [...request().request.paths, 'state/extra.json'] } },
    { gateEvidence: ['authority', 'freshness'] },
    { evaluatedAt: 'not-a-time' },
  ]) {
    assert.equal(evaluateClearance(request(changed)).decision, 'deny');
  }
});

test('denial is deterministic, redacted, and never becomes a grant', () => {
  const input = request({
    request: { action: 'lifecycle.close', paths: ['private/credential.txt'], secret: 'do-not-copy' },
  });
  const first = evaluateClearance(input);
  const second = evaluateClearance(input);
  assert.equal(first.decision, 'deny');
  assert.deepEqual(first, second);
  assert.ok(first.deniedRuleIds.length > 0);
  assert.equal(JSON.stringify(first).includes('do-not-copy'), false);
  assert.equal(JSON.stringify(first).includes('credential.txt'), false);
});

test('owner command must be exact, expiring, reasoned, and gate-bound', () => {
  const base = request({ actorClass: 'owner', gateEvidence: ['owner-command', 'audit'] });
  const ownerCommand = {
    commandId: 'CMD-001',
    actions: ['lifecycle.migrate.v1-to-v2'],
    paths: ['state/lifecycle.json', 'journal/events/001-migration.json'],
    expiresAt: '2026-08-28T13:00:00.000Z',
    reason: 'synthetic migration fixture',
    proofGates: ['audit'],
  };
  assert.equal(evaluateClearance({ ...base, ownerCommand }).decision, 'allow');
  assert.equal(evaluateClearance({ ...base, ownerCommand: { ...ownerCommand, expiresAt: '2026-08-28T11:00:00.000Z' } }).decision, 'deny');
  assert.equal(evaluateClearance({ ...base, ownerCommand: { ...ownerCommand, reason: '' } }).decision, 'deny');
  assert.equal(evaluateClearance({ ...base, ownerCommand: { ...ownerCommand, paths: [...ownerCommand.paths, 'state/extra.json'] } }).decision, 'deny');
});

test('denial record is deterministic, redacted, and projects only after lifecycle persistence', () => {
  const denied = evaluateClearance(request({ gateEvidence: ['authority'] }));
  const input = {
    decision: denied,
    jobOrder: { id: 'JO-SYNTHETIC-001', revision: 'R1' },
    requestedTransition: 'lifecycle.claim',
    requestedScope: ['state/lifecycle.json', 'journal/events/002-EVT-CLAIM.json'],
    evaluatedAt: '2026-08-28T12:00:00.000Z',
  };
  const first = createDenialRecord(input);
  const second = createDenialRecord(structuredClone(input));
  assert.deepEqual(first, second);
  assert.match(first.denialId, /^DENY-[A-F0-9]{16}$/);
  assert.equal(JSON.stringify(first).includes('journal/events/002-EVT-CLAIM.json'), false);
  assert.equal(first.jobOrder.id, 'JO-SYNTHETIC-001');

  assert.throws(() => projectPassage({ denialRecord: first }), /lifecycle commit/);
  const projection = projectPassage({ denialRecord: first, lifecycleCommitId: 'a'.repeat(40) });
  assert.equal(projection.owner, 'Gatehouse');
  assert.equal(projection.decision, 'deny');
  assert.match(projection.sourceDigest, /^[a-f0-9]{64}$/);
});
