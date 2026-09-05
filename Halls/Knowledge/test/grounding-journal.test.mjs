import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalJson,
  digestCanonical,
  projectJournalHealth,
  recoverJournal,
  replayJournal,
  validateJournalEvent,
} from '../src/index.mjs';

function fixture() {
  const state = {
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
    stateDigest: digestCanonical(state),
    payload: { source: 'synthetic-v1-unclaimed' },
  };
  return { state, event };
}

test('canonical JSON and digests are stable across key order', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');
  assert.equal(digestCanonical({ b: 2, a: 1 }), digestCanonical({ a: 1, b: 2 }));
  assert.throws(() => canonicalJson({ invalid: undefined }), /JSON-safe/);
});

test('first migration event validates only with its paired v2-unclaimed state', () => {
  const { state, event } = fixture();
  const result = validateJournalEvent({ event, predecessor: null, pairedState: state });
  assert.equal(result.valid, true);
  assert.match(result.eventDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.findings, []);

  assert.equal(validateJournalEvent({ event, predecessor: null, pairedState: { ...state, status: 'claimed' } }).valid, false);
  assert.equal(validateJournalEvent({ event: { ...event, priorDigest: 'bad' }, predecessor: null, pairedState: state }).valid, false);
  assert.equal(validateJournalEvent({ event: { ...event, sequence: 2 }, predecessor: null, pairedState: state }).valid, false);
});

test('private operational fields are rejected before hashing', () => {
  const { state, event } = fixture();
  for (const forbidden of ['repository', 'branch', 'actor', 'credential', 'runtime']) {
    const unsafe = { ...event, payload: { ...event.payload, [forbidden]: 'private-value' } };
    const result = validateJournalEvent({ event: unsafe, predecessor: null, pairedState: state });
    assert.equal(result.valid, false);
    assert.ok(result.findings.some((finding) => finding.includes(forbidden)));
  }
  const topLevel = validateJournalEvent({ event: { ...event, branch: 'private-value' }, predecessor: null, pairedState: state });
  assert.equal(topLevel.valid, false);
  assert.ok(topLevel.findings.some((finding) => finding.includes('branch')));
});

test('replay is idempotent for an identical duplicate and fails on conflict or missing pair', () => {
  const { state, event } = fixture();
  const replayed = replayJournal([event, structuredClone(event)], { pairedStates: new Map([[event.eventId, state]]) });
  assert.equal(replayed.count, 1);
  assert.equal(replayed.health, 'healthy');

  assert.throws(
    () => replayJournal([event, { ...event, payload: { source: 'conflict' } }], { pairedStates: new Map([[event.eventId, state]]) }),
    /conflicting duplicate/,
  );
  assert.throws(() => replayJournal([event], { pairedStates: new Map() }), /paired state/);
});

test('replay rejects reordered or prior-digest-mismatched chains', () => {
  const first = fixture();
  const secondState = {
    schemaVersion: '2.0',
    status: 'unclaimed',
    journal: { eventId: 'EVT-002', sequence: 2 },
    migration: { sourceSchemaVersion: '1.0' },
  };
  const secondEvent = {
    schemaVersion: '1.0',
    eventId: 'EVT-002',
    sequence: 2,
    type: 'migration.steward-serialization-imported',
    priorDigest: digestCanonical(first.event),
    stateDigest: digestCanonical(secondState),
    payload: { source: 'synthetic-follow-up' },
  };
  const states = new Map([[first.event.eventId, first.state], [secondEvent.eventId, secondState]]);
  assert.equal(replayJournal([first.event, secondEvent], { pairedStates: states }).count, 2);
  assert.throws(() => replayJournal([secondEvent, first.event], { pairedStates: states }), /invalid Journal event/);
  assert.throws(
    () => replayJournal([first.event, { ...secondEvent, priorDigest: '0'.repeat(64) }], { pairedStates: states }),
    /priorDigest/,
  );
});

test('schema-v2 lifecycle events validate generically and retain a durable receipt digest', () => {
  const state = {
    schemaVersion: '2.0',
    status: 'claimed',
    claim: { claimFuid: 'CLM001', runFuid: 'RUN001' },
    journal: { eventId: 'EVT-CLAIM', sequence: 1 },
  };
  const event = {
    schemaVersion: '2.0',
    eventId: 'EVT-CLAIM',
    sequence: 1,
    type: 'claim.accepted',
    priorDigest: 'none',
    stateDigest: digestCanonical(state),
    payload: { claimFuid: 'CLM001', runFuid: 'RUN001' },
  };
  const result = validateJournalEvent({ event, predecessor: null, pairedState: state });
  assert.equal(result.valid, true);
  assert.equal(result.eventDigest, digestCanonical(event));
  const malformedType = validateJournalEvent({
    event: { ...event, type: 'not-valid' }, predecessor: null, pairedState: state,
  });
  assert.equal(malformedType.valid, false);
  assert.ok(malformedType.findings.some((finding) => finding.includes('dotted identifier')));
  assert.equal(validateJournalEvent({
    event: { ...event, type: 'child.terminal-ingested' }, predecessor: null, pairedState: state,
  }).valid, true);
});

test('recovery proves the exact chain tip and journal-health projection is deterministic', () => {
  const { state, event } = fixture();
  const recovered = recoverJournal([event], {
    pairedStates: new Map([[event.eventId, state]]),
    expectedLastDigest: digestCanonical(event),
  });
  assert.deepEqual(recovered, {
    count: 1,
    health: 'healthy',
    lastDigest: digestCanonical(event),
    recovery: 'exact',
  });
  assert.equal(recoverJournal([event], {
    pairedStates: new Map([[event.eventId, state]]),
    expectedLastDigest: '0'.repeat(64),
  }).recovery, 'mismatch');

  const first = projectJournalHealth(recovered, { recoveryRef: 'synthetic-ref', recoverySha: 'a'.repeat(40) });
  const second = projectJournalHealth(recovered, { recoverySha: 'a'.repeat(40), recoveryRef: 'synthetic-ref' });
  assert.deepEqual(first, second);
  assert.equal(first.owner, 'Knowledge');
  assert.equal(first.freshness, 'fresh');
});
