#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.join(scriptDir, '..', 'SKILL.md');
const problems = [];

function check(name, callback) {
  try {
    callback();
  } catch (error) {
    problems.push(`${name}: ${error.message}`);
  }
}

check('skill exists', () => assert.ok(fs.existsSync(skillPath), 'launch-flight/SKILL.md must exist'));
const skill = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';

check('frontmatter', () => {
  assert.match(skill, /^---\n[\s\S]*?^name:\s*launch-flight\s*$[\s\S]*?^---$/m);
  assert.doesNotMatch(skill, /^disable-model-invocation:\s*true\s*$/m);
});

for (const binding of [
  'canonBinding',
  'actor',
  'role',
  'manualSerialization',
  'writerLane',
  'sourceRef',
  'targetRef',
  'recoveryRef',
  'repository',
  'allowedPaths',
  'exclusions',
  'preflightFacts',
  'proofExpectations',
]) {
  check(`binding ${binding}`, () => assert.match(skill, new RegExp(`^${binding}:`, 'm')));
}

for (const absentFact of ['laneExists', 'worktreeExists', 'branchExists', 'recoveryRefExists']) {
  check(`absent entry fact ${absentFact}`, () => {
    assert.match(skill, new RegExp(`\\b${absentFact}: false\\b`));
  });
}

const unavailableFields = [
  'exactOrderReceipt',
  'lifecycleTip',
  'claimFuid',
  'runFuid',
  'handoffFuid',
  'handoffDigest',
];
for (const unavailable of unavailableFields) {
  check(`bootstrap field ${unavailable}`, () => {
    assert.match(skill, new RegExp(`\\b${unavailable}: bootstrap-unavailable\\b`));
  });
}

check('existing lane ambiguity removed', () => {
  assert.doesNotMatch(skill, /or already\s+form the same clean, registered, no-track lane/i);
  assert.match(skill, /pre-existing[\s\S]*lane or recovery ref[\s\S]*recovery-required/i);
  assert.match(skill, /bootstrap-unavailable[\s\S]*never[\s\S]*idempotency proof/i);
});

const desiredDecisionOrder = [
  'recovery-ambiguous',
  'duplicate',
  'denied',
  'scope-growth',
  'stale',
  'mismatched',
  'valid',
];
const orderMatch = skill.match(/<!-- launch-flight-decision-order:v1\s+([^\n]+) -->/);
const observedDecisionOrder = orderMatch?.[1]?.split('>').map((value) => value.trim()) ?? [];
check('deterministic decision order', () => assert.deepEqual(observedDecisionOrder, desiredDecisionOrder));

const expectedContract = new Map([
  ['valid', {
    outcome: 'bootstrap-ready',
    next: '/in-flight',
    response: 'Emit the bound non-flight bootstrap record. If the next skill is unavailable, name that dependency without claiming it ran.',
  }],
  ['stale', {
    outcome: 'blocked',
    next: '/preflight',
    response: 'A bound live fact moved; rerun the complete ticket-level Preflight and serialization check.',
  }],
  ['mismatched', {
    outcome: 'blocked',
    next: '/preflight',
    response: 'Identity, role, lane, repository, ref, scope, or proof differs from the accepted record.',
  }],
  ['duplicate', {
    outcome: 'recovery-required',
    next: 'none',
    response: 'A lane, worktree, branch, recovery ref, or serialization already exists without real authoritative idempotency proof; preserve known state and stop.',
  }],
  ['denied', {
    outcome: 'blocked',
    next: 'none',
    response: 'Preserve the denial and name the exact owner, Clearance, privacy, credential, or protected-action gate.',
  }],
  ['scope-growth', {
    outcome: 'blocked',
    next: '/preflight',
    response: 'Return new work to Canon issuance, then rerun Preflight; never widen the live lane.',
  }],
  ['recovery-ambiguous', {
    outcome: 'recovery-required',
    next: 'none',
    response: 'Preserve known refs and stop until the authoritative source, target, lane, or recovery state is readable.',
  }],
]);
const expectedChecksPerformed = [
  'entry-schema',
  'authority-correlation',
  'preflight-schema',
  'ref-bindings',
  'lane-state',
  'decision-order',
];
const expectedInvalidationReason = new Map([
  ['valid', 'none'],
  ['stale', 'bound-live-fact-stale'],
  ['mismatched', 'binding-schema-mismatch'],
  ['duplicate', 'pre-existing-state-without-idempotency-proof'],
  ['denied', 'authorization-denied'],
  ['scope-growth', 'scope-growth'],
  ['recovery-ambiguous', 'recovery-state-ambiguous'],
]);

const observedContract = new Map();
const contractMarker = '<!-- launch-flight-contract:v1 -->';
const markerIndex = skill.indexOf(contractMarker);
check('contract marker', () => assert.notEqual(markerIndex, -1));
for (const line of skill.slice(Math.max(0, markerIndex)).split('\n')) {
  if (!line.startsWith('|') || !line.endsWith('|')) continue;
  const cells = line.slice(1, -1).split('|').map((cell) => cell.trim().replaceAll('`', ''));
  if (!expectedContract.has(cells[0])) continue;
  observedContract.set(cells[0], { outcome: cells[1], next: cells[2], response: cells[3] });
}
check('contract dispositions', () => assert.deepEqual(observedContract, expectedContract));

const bootstrapUnavailable = Object.fromEntries(unavailableFields.map((field) => [field, 'bootstrap-unavailable']));
const acceptedScopeBindings = {
  allowedPaths: ['launch-flight/SKILL.md', 'launch-flight/scripts/check-fixtures.mjs'],
  exclusions: ['protected branches', 'private instance bindings', 'lifecycle receipts'],
};
const acceptedCanonBinding = {
  exactJobOrder: 'JO-ABCDEF/R1',
  spec: 'SPEC-ABCDEF',
  ticket: 'TICKET-ABCDEF',
};
const acceptedIdentityBindings = {
  actor: 'engineer-alpha',
  role: 'engineer',
};
const acceptedWriterLane = {
  worktree: '/workspace/isolated-lane',
  branch: 'codex/example-lane',
};
const acceptedIntegrationRef = { ref: 'refs/heads/integration', sha: 'b'.repeat(40) };
const acceptedSourceRef = { ...acceptedIntegrationRef };
const acceptedTargetRef = { ...acceptedIntegrationRef };
const acceptedRecoveryRef = { ref: 'refs/heads/codex/example-lane', exists: false };
const acceptedRecoveryRemote = {
  name: 'origin',
  url: 'https://example.invalid/shared-skills.git',
};
const acceptedRepository = {
  identity: 'shared-skills',
  recoveryRemote: acceptedRecoveryRemote,
};
const acceptedProofExpectations = [
  'focused-red-green',
  'independent-fixed-sha-review',
  'remote-read-back',
];
const acceptedManualSerialization = {
  stewardPacketVerified: true,
  verifiedByRole: 'steward',
  exactJobOrder: acceptedCanonBinding.exactJobOrder,
  spec: acceptedCanonBinding.spec,
  ticket: acceptedCanonBinding.ticket,
  actor: acceptedIdentityBindings.actor,
  role: acceptedIdentityBindings.role,
  writerLane: structuredClone(acceptedWriterLane),
  repositoryIdentity: acceptedRepository.identity,
  recoveryRemote: structuredClone(acceptedRecoveryRemote),
  recoveryRef: structuredClone(acceptedRecoveryRef),
  allowedPaths: [...acceptedScopeBindings.allowedPaths],
  exclusions: [...acceptedScopeBindings.exclusions],
  proofExpectations: [...acceptedProofExpectations],
};
const acceptedPreflightRepositories = [
  {
    repository: structuredClone(acceptedRepository),
    clean: true,
    sourceRef: { ...acceptedIntegrationRef },
    targetRef: { ...acceptedIntegrationRef },
    blocking: [],
    reconcilable: [],
    failures: [],
  },
  {
    repository: {
      identity: 'control-canon',
      recoveryRemote: {
        name: 'control-origin',
        url: 'https://example.invalid/control-canon.git',
      },
    },
    clean: true,
    sourceRef: { ref: 'refs/heads/integration', sha: 'c'.repeat(40) },
    targetRef: { ref: 'refs/heads/integration', sha: 'c'.repeat(40) },
    blocking: [],
    reconcilable: [],
    failures: [],
  },
];
const validRecord = {
  canonBinding: structuredClone(acceptedCanonBinding),
  actor: acceptedIdentityBindings.actor,
  role: acceptedIdentityBindings.role,
  manualSerialization: structuredClone(acceptedManualSerialization),
  writerLane: structuredClone(acceptedWriterLane),
  sourceRef: { ...acceptedSourceRef },
  targetRef: { ...acceptedTargetRef },
  recoveryRef: structuredClone(acceptedRecoveryRef),
  repository: structuredClone(acceptedRepository),
  allowedPaths: [...acceptedScopeBindings.allowedPaths],
  exclusions: [...acceptedScopeBindings.exclusions],
  preflightFacts: {
    spec: acceptedCanonBinding.spec,
    ticket: acceptedCanonBinding.ticket,
    exactJobOrder: 'bootstrap-unavailable',
    pass: true,
    pushDestination: acceptedRecoveryRef.ref,
    repositories: structuredClone(acceptedPreflightRepositories),
    blocking: [],
    reconcilable: [],
    failures: [],
  },
  proofExpectations: [...acceptedProofExpectations],
  entryFacts: {
    sourceReadable: true,
    targetReadable: true,
    recoveryReadable: true,
    laneExists: false,
    worktreeExists: false,
    branchExists: false,
    recoveryRefExists: false,
    authoritativeIdempotencyProof: 'bootstrap-unavailable',
  },
  denied: false,
  scopeGrowth: false,
  stale: false,
  mismatched: false,
  ...bootstrapUnavailable,
};

check('valid fixture is concrete and placeholder-free', () => {
  assert.match(validRecord.canonBinding.exactJobOrder, /^JO-[A-Z0-9]{6}\/R[1-9][0-9]*$/);
  assert.doesNotMatch(JSON.stringify(validRecord), /<[^>]*>/);
});

check('valid fixture has a structured Canon binding', () => {
  assert.ok(isPlainObject(validRecord.canonBinding));
  assert.match(validRecord.canonBinding.exactJobOrder, /^JO-[A-Z0-9]{6}\/R[1-9][0-9]*$/);
  assert.match(validRecord.canonBinding.spec, /^SPEC-[A-Z0-9]{6}$/);
  assert.match(validRecord.canonBinding.ticket, /^TICKET-[A-Z0-9]{6}$/);
});

check('valid fixture has structured repository recovery authority', () => {
  assert.ok(isPlainObject(validRecord.repository));
  assert.ok(isPlainObject(validRecord.repository.recoveryRemote));
  assert.ok(isBoundString(validRecord.repository.identity));
  assert.ok(isBoundString(validRecord.repository.recoveryRemote.name));
  assert.ok(isBoundString(validRecord.repository.recoveryRemote.url));
});

check('valid fixture has structured Steward serialization', () => {
  assert.ok(isPlainObject(validRecord.manualSerialization));
  assert.equal(validRecord.manualSerialization.stewardPacketVerified, true);
  assert.equal(validRecord.manualSerialization.verifiedByRole, 'steward');
  assert.equal(validRecord.manualSerialization.exactJobOrder, validRecord.canonBinding.exactJobOrder);
  assert.equal(validRecord.manualSerialization.spec, validRecord.canonBinding.spec);
  assert.equal(validRecord.manualSerialization.ticket, validRecord.canonBinding.ticket);
  assert.equal(validRecord.manualSerialization.actor, validRecord.actor);
  assert.equal(validRecord.manualSerialization.role, validRecord.role);
  assert.deepEqual(validRecord.manualSerialization.writerLane, validRecord.writerLane);
  assert.notStrictEqual(validRecord.manualSerialization.writerLane, validRecord.writerLane);
  assert.equal(validRecord.manualSerialization.repositoryIdentity, validRecord.repository.identity);
  assert.deepEqual(validRecord.manualSerialization.recoveryRemote, validRecord.repository.recoveryRemote);
  assert.notStrictEqual(validRecord.manualSerialization.recoveryRemote, validRecord.repository.recoveryRemote);
  assert.deepEqual(validRecord.manualSerialization.recoveryRef, validRecord.recoveryRef);
  assert.notStrictEqual(validRecord.manualSerialization.recoveryRef, validRecord.recoveryRef);
  assert.deepEqual(validRecord.manualSerialization.allowedPaths, validRecord.allowedPaths);
  assert.deepEqual(validRecord.manualSerialization.exclusions, validRecord.exclusions);
  assert.deepEqual(validRecord.manualSerialization.proofExpectations, validRecord.proofExpectations);
});

check('Preflight carries spec and ticket but no exact order selection', () => {
  assert.equal(validRecord.preflightFacts.spec, validRecord.canonBinding.spec);
  assert.equal(validRecord.preflightFacts.ticket, validRecord.canonBinding.ticket);
  assert.equal(validRecord.preflightFacts.exactJobOrder, 'bootstrap-unavailable');
});

check('bootstrap source and target are the same fresh integration commit', () => {
  assert.deepEqual(validRecord.sourceRef, validRecord.targetRef);
  assert.notStrictEqual(validRecord.sourceRef, validRecord.targetRef);
  assert.equal(validRecord.sourceRef.ref, 'refs/heads/integration');
  assert.ok(isFullCommit(validRecord.sourceRef.sha));
});

function withRecord(record, overrides = {}) {
  const copy = structuredClone(record);
  return {
    ...copy,
    ...overrides,
    writerLane: { ...copy.writerLane, ...overrides.writerLane },
    recoveryRef: { ...copy.recoveryRef, ...overrides.recoveryRef },
    preflightFacts: { ...copy.preflightFacts, ...overrides.preflightFacts },
    entryFacts: { ...copy.entryFacts, ...overrides.entryFacts },
  };
}

function alteredRecord(mutator) {
  const record = structuredClone(validRecord);
  mutator(record);
  return record;
}

function assertMismatchedDisposition(record) {
  const actual = evaluate(record);
  assert.deepEqual(
    { case: actual.case, outcome: actual.outcome, next: actual.next },
    { case: 'mismatched', outcome: 'blocked', next: '/preflight' },
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundString(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length > 0
    && normalized.toLowerCase() !== 'none'
    && !/<[^>]*>/.test(normalized);
}

function isBoundStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isBoundString);
}

function isFullCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isBranchRef(value) {
  return isBoundString(value)
    && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('/');
}

function isRecoveryRemote(value, expected) {
  if (!isPlainObject(value)
    || !isBoundString(value.name)
    || !isBoundString(value.url)
    || !isDeepStrictEqual(value, expected)) {
    return false;
  }
  try {
    return new URL(value.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isRepositoryBinding(value, expected) {
  return isPlainObject(value)
    && isBoundString(value.identity)
    && isRecoveryRemote(value.recoveryRemote, expected.recoveryRemote)
    && isDeepStrictEqual(value, expected);
}

function isCanonBinding(value) {
  return isPlainObject(value)
    && /^JO-[A-Z0-9]{6}\/R[1-9][0-9]*$/.test(value.exactJobOrder)
    && /^SPEC-[A-Z0-9]{6}$/.test(value.spec)
    && /^TICKET-[A-Z0-9]{6}$/.test(value.ticket)
    && isDeepStrictEqual(value, acceptedCanonBinding);
}

function isExactRefBinding(value, expected) {
  return isPlainObject(value)
    && isBranchRef(value.ref)
    && isFullCommit(value.sha)
    && isDeepStrictEqual(value, expected);
}

function isWriterLane(value) {
  return isPlainObject(value)
    && isBoundString(value.worktree)
    && path.isAbsolute(value.worktree)
    && isBoundString(value.branch)
    && /^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.branch)
    && !value.branch.includes('..')
    && !value.branch.includes('//')
    && !value.branch.endsWith('/')
    && isDeepStrictEqual(value, acceptedWriterLane);
}

function isRecoveryRef(value, writerLane) {
  return isPlainObject(value)
    && isBranchRef(value.ref)
    && value.exists === false
    && isPlainObject(writerLane)
    && value.ref === `refs/heads/${writerLane.branch}`
    && isDeepStrictEqual(value, acceptedRecoveryRef);
}

function isManualSerialization(value, record) {
  return isPlainObject(value)
    && value.stewardPacketVerified === true
    && value.verifiedByRole === 'steward'
    && value.exactJobOrder === record.canonBinding?.exactJobOrder
    && value.spec === record.canonBinding?.spec
    && value.ticket === record.canonBinding?.ticket
    && value.actor === record.actor
    && value.role === record.role
    && isWriterLane(value.writerLane)
    && isDeepStrictEqual(value.writerLane, record.writerLane)
    && value.repositoryIdentity === record.repository?.identity
    && isRecoveryRemote(value.recoveryRemote, acceptedRecoveryRemote)
    && isDeepStrictEqual(value.recoveryRemote, record.repository?.recoveryRemote)
    && isRecoveryRef(value.recoveryRef, value.writerLane)
    && isDeepStrictEqual(value.recoveryRef, record.recoveryRef)
    && isBoundStringArray(value.allowedPaths)
    && isDeepStrictEqual(value.allowedPaths, record.allowedPaths)
    && isBoundStringArray(value.exclusions)
    && isDeepStrictEqual(value.exclusions, record.exclusions)
    && isBoundStringArray(value.proofExpectations)
    && isDeepStrictEqual(value.proofExpectations, record.proofExpectations)
    && isDeepStrictEqual(value, acceptedManualSerialization);
}

const findingBands = ['blocking', 'reconcilable', 'failures'];
function hasEmptyFindingBands(value) {
  return isPlainObject(value)
    && findingBands.every((band) => Array.isArray(value[band]) && value[band].length === 0);
}

function isPreflightRepository(value, expected) {
  return isPlainObject(value)
    && isRepositoryBinding(value.repository, expected.repository)
    && value.clean === true
    && isExactRefBinding(value.sourceRef, expected.sourceRef)
    && isExactRefBinding(value.targetRef, expected.targetRef)
    && hasEmptyFindingBands(value)
    && isDeepStrictEqual(value, expected);
}

function isPassedPreflight(value, record) {
  if (!isPlainObject(value)
    || value.spec !== record.canonBinding?.spec
    || value.ticket !== record.canonBinding?.ticket
    || value.exactJobOrder !== 'bootstrap-unavailable'
    || value.pass !== true
    || !isBranchRef(value.pushDestination)
    || value.pushDestination !== record.recoveryRef?.ref
    || !Array.isArray(value.repositories)
    || value.repositories.length !== acceptedPreflightRepositories.length
    || !hasEmptyFindingBands(value)) {
    return false;
  }
  const names = value.repositories.map((repositoryRecord) => repositoryRecord?.repository?.identity);
  if (new Set(names).size !== acceptedPreflightRepositories.length) return false;
  const expectedByName = new Map(acceptedPreflightRepositories
    .map((repositoryRecord) => [repositoryRecord.repository.identity, repositoryRecord]));
  return value.repositories.every((repositoryRecord) => {
    const expected = expectedByName.get(repositoryRecord?.repository?.identity);
    return expected !== undefined && isPreflightRepository(repositoryRecord, expected);
  });
}

function hasBindingSchemaMismatch(record) {
  if (!isPlainObject(record)) return true;
  const identityMismatch = Object.entries(acceptedIdentityBindings).some(([field, expected]) => (
    !isBoundString(record[field]) || record[field] !== expected
  ));
  return identityMismatch
    || !isCanonBinding(record.canonBinding)
    || !isWriterLane(record.writerLane)
    || !isExactRefBinding(record.sourceRef, acceptedSourceRef)
    || !isExactRefBinding(record.targetRef, acceptedTargetRef)
    || !isDeepStrictEqual(record.sourceRef, record.targetRef)
    || !isRecoveryRef(record.recoveryRef, record.writerLane)
    || !isRepositoryBinding(record.repository, acceptedRepository)
    || !isBoundStringArray(record.allowedPaths)
    || !isDeepStrictEqual(record.allowedPaths, acceptedScopeBindings.allowedPaths)
    || !isBoundStringArray(record.exclusions)
    || !isDeepStrictEqual(record.exclusions, acceptedScopeBindings.exclusions)
    || !isPassedPreflight(record.preflightFacts, record)
    || !isBoundStringArray(record.proofExpectations)
    || !isDeepStrictEqual(record.proofExpectations, acceptedProofExpectations)
    || !isManualSerialization(record.manualSerialization, record)
    || unavailableFields.some((field) => record[field] !== 'bootstrap-unavailable')
    || record.entryFacts?.authoritativeIdempotencyProof !== 'bootstrap-unavailable';
}

function classify(record) {
  const absenceFacts = ['laneExists', 'worktreeExists', 'branchExists', 'recoveryRefExists'];
  const entryFacts = isPlainObject(record?.entryFacts) ? record.entryFacts : {};
  const preExisting = absenceFacts
    .some((field) => entryFacts[field] === true);
  const bindingMismatch = record?.mismatched === true || hasBindingSchemaMismatch(record);
  const conditions = {
    'recovery-ambiguous': ['sourceReadable', 'targetReadable', 'recoveryReadable']
      .some((field) => entryFacts[field] !== true)
      || absenceFacts.some((field) => ![true, false].includes(entryFacts[field])),
    duplicate: preExisting && entryFacts.authoritativeIdempotencyProof !== true,
    denied: record?.denied === true,
    'scope-growth': record?.scopeGrowth === true,
    stale: record?.stale === true,
    mismatched: bindingMismatch,
    valid: true,
  };
  return desiredDecisionOrder.find((caseName) => conditions[caseName]);
}

function evaluate(record) {
  const caseName = classify(record);
  const disposition = observedContract.get(caseName) ?? expectedContract.get(caseName);
  const result = {
    case: caseName,
    ...disposition,
    checksPerformed: [...expectedChecksPerformed],
    invalidationReason: expectedInvalidationReason.get(caseName),
    nextGate: disposition.next,
  };
  if (caseName !== 'valid') return result;
  return {
    ...result,
    bindings: {
      canonBinding: record.canonBinding,
      actor: record.actor,
      role: record.role,
      manualSerialization: record.manualSerialization,
      writerLane: record.writerLane,
      sourceRef: record.sourceRef,
      targetRef: record.targetRef,
      recoveryRef: record.recoveryRef,
      repository: record.repository,
      allowedPaths: record.allowedPaths,
      exclusions: record.exclusions,
      preflightFacts: record.preflightFacts,
      proofExpectations: record.proofExpectations,
      entryFacts: record.entryFacts,
    },
    unavailable: Object.fromEntries(unavailableFields.map((field) => [field, record[field]])),
    disclaimer: 'This is not a Claim, Run, lifecycle receipt, or closure.',
  };
}

const cases = new Map([
  ['valid', validRecord],
  ['stale', withRecord(validRecord, { stale: true })],
  ['mismatched', withRecord(validRecord, { preflightFacts: { pass: false } })],
  ['duplicate', withRecord(validRecord, {
    entryFacts: { laneExists: true, authoritativeIdempotencyProof: 'bootstrap-unavailable' },
  })],
  ['denied', withRecord(validRecord, { denied: true })],
  ['scope-growth', withRecord(validRecord, { scopeGrowth: true })],
  ['recovery-ambiguous', withRecord(validRecord, { entryFacts: { recoveryReadable: false } })],
]);

for (const [caseName, record] of cases) {
  check(`structured ${caseName}`, () => {
    const actual = evaluate(record);
    assert.equal(actual.case, caseName);
    assert.deepEqual(
      { outcome: actual.outcome, next: actual.next, response: actual.response },
      expectedContract.get(caseName),
    );
  });
  check(`trace ${caseName}`, () => {
    const actual = evaluate(record);
    assert.deepEqual(
      {
        checksPerformed: actual.checksPerformed,
        invalidationReason: actual.invalidationReason,
        nextGate: actual.nextGate,
      },
      {
        checksPerformed: expectedChecksPerformed,
        invalidationReason: expectedInvalidationReason.get(caseName),
        nextGate: expectedContract.get(caseName).next,
      },
    );
    if (caseName !== 'valid') assert.notEqual(actual.invalidationReason, 'none');
  });
}

for (const existingFact of ['laneExists', 'worktreeExists', 'branchExists', 'recoveryRefExists']) {
  check(`pre-existing ${existingFact}`, () => {
    const result = evaluate(withRecord(validRecord, {
      entryFacts: { [existingFact]: true, authoritativeIdempotencyProof: 'bootstrap-unavailable' },
    }));
    assert.deepEqual(
      { case: result.case, outcome: result.outcome, next: result.next },
      { case: 'duplicate', outcome: 'recovery-required', next: 'none' },
    );
  });
}

for (const missingFact of ['laneExists', 'worktreeExists', 'branchExists', 'recoveryRefExists']) {
  check(`missing ${missingFact}`, () => {
    const result = evaluate(withRecord(validRecord, { entryFacts: { [missingFact]: undefined } }));
    assert.deepEqual(
      { case: result.case, outcome: result.outcome, next: result.next },
      { case: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none' },
    );
  });
}

const mismatchedScopeBindings = {
  allowedPaths: [...acceptedScopeBindings.allowedPaths, 'unapproved/path'],
  exclusions: acceptedScopeBindings.exclusions.slice(0, -1),
};
for (const binding of ['allowedPaths', 'exclusions']) {
  check(`missing scope binding ${binding}`, () => {
    const record = withRecord(validRecord);
    delete record[binding];
    const result = evaluate(record);
    assert.deepEqual(
      { case: result.case, outcome: result.outcome, next: result.next },
      { case: 'mismatched', outcome: 'blocked', next: '/preflight' },
    );
  });
  check(`mismatched scope binding ${binding}`, () => {
    const result = evaluate(withRecord(validRecord, { [binding]: mismatchedScopeBindings[binding] }));
    assert.deepEqual(
      { case: result.case, outcome: result.outcome, next: result.next },
      { case: 'mismatched', outcome: 'blocked', next: '/preflight' },
    );
  });
}

for (const [binding, invalidValues] of Object.entries({
  actor: ['', 'none', '<placeholder>', 'engineer-beta'],
  role: ['', 'none', '<placeholder>', 'auditor'],
})) {
  check(`missing mandatory binding ${binding}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => delete record[binding]));
  });
  for (const invalidValue of invalidValues) {
    check(`invalid mandatory binding ${binding} ${JSON.stringify(invalidValue)}`, () => {
      assertMismatchedDisposition(alteredRecord((record) => { record[binding] = invalidValue; }));
    });
  }
}

for (const [field, invalidValues] of Object.entries({
  exactJobOrder: ['', 'none', '<order>', 'JO-ABCDE/R1', 'JO-ABCDEF/R0', 'jo-ABCDEF/R1', 'JO-ZYXWVU/R1'],
  spec: ['', 'none', '<spec>', 'SPEC-ABCDE', 'SPEC-ZYXWVU'],
  ticket: ['', 'none', '<ticket>', 'TICKET-ABCDE', 'TICKET-ZYXWVU'],
})) {
  check(`missing Canon binding ${field}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => delete record.canonBinding[field]));
  });
  for (const invalidValue of invalidValues) {
    check(`invalid Canon binding ${field} ${JSON.stringify(invalidValue)}`, () => {
      assertMismatchedDisposition(alteredRecord((record) => {
        record.canonBinding[field] = invalidValue;
      }));
    });
  }
}

const repositoryAuthorityCases = new Map([
  ['wrong repository identity', (record) => { record.repository.identity = 'other-repository'; }],
  ['wrong recovery remote name', (record) => { record.repository.recoveryRemote.name = 'backup'; }],
  ['wrong recovery remote URL', (record) => {
    record.repository.recoveryRemote.url = 'https://example.invalid/other.git';
  }],
]);
for (const [name, mutate] of repositoryAuthorityCases) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

const serializationCorrelationCases = new Map([
  ['unverified Steward packet', (record) => { record.manualSerialization.stewardPacketVerified = false; }],
  ['wrong serialization verifier role', (record) => { record.manualSerialization.verifiedByRole = 'auditor'; }],
  ['wrong serialized order', (record) => { record.manualSerialization.exactJobOrder = 'JO-ZYXWVU/R1'; }],
  ['wrong serialized spec', (record) => { record.manualSerialization.spec = 'SPEC-ZYXWVU'; }],
  ['wrong serialized ticket', (record) => { record.manualSerialization.ticket = 'TICKET-ZYXWVU'; }],
  ['wrong serialized actor', (record) => { record.manualSerialization.actor = 'engineer-beta'; }],
  ['wrong serialized role', (record) => { record.manualSerialization.role = 'auditor'; }],
  ['wrong serialized lane', (record) => { record.manualSerialization.writerLane.branch = 'codex/other-lane'; }],
  ['wrong serialized repository', (record) => { record.manualSerialization.repositoryIdentity = 'other-repository'; }],
  ['wrong serialized recovery remote', (record) => {
    record.manualSerialization.recoveryRemote.name = 'backup';
  }],
  ['wrong serialized recovery ref', (record) => {
    record.manualSerialization.recoveryRef.ref = 'refs/heads/codex/other-lane';
  }],
  ['wrong serialized allowed paths', (record) => {
    record.manualSerialization.allowedPaths.push('unapproved/path');
  }],
  ['wrong serialized exclusions', (record) => { record.manualSerialization.exclusions.pop(); }],
  ['wrong serialized proof', (record) => { record.manualSerialization.proofExpectations.pop(); }],
]);
for (const [name, mutate] of serializationCorrelationCases) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

const writerLaneCases = new Map([
  ['missing writerLane', (record) => delete record.writerLane],
  ['missing worktree', (record) => delete record.writerLane.worktree],
  ['blank worktree', (record) => { record.writerLane.worktree = ''; }],
  ['none worktree', (record) => { record.writerLane.worktree = 'none'; }],
  ['placeholder worktree', (record) => { record.writerLane.worktree = '<worktree>'; }],
  ['relative worktree', (record) => { record.writerLane.worktree = 'relative/lane'; }],
  ['missing branch', (record) => delete record.writerLane.branch],
  ['blank branch', (record) => { record.writerLane.branch = ''; }],
  ['none branch', (record) => { record.writerLane.branch = 'none'; }],
  ['placeholder branch', (record) => { record.writerLane.branch = '<branch>'; }],
  ['protected branch', (record) => { record.writerLane.branch = 'integration'; }],
  ['non-codex branch', (record) => { record.writerLane.branch = 'feature/example-lane'; }],
  ['recovery name mismatch', (record) => { record.writerLane.branch = 'codex/other-lane'; }],
]);
for (const [name, mutate] of writerLaneCases) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

for (const binding of ['sourceRef', 'targetRef', 'recoveryRef']) {
  check(`missing ${binding}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => delete record[binding]));
  });
}

for (const binding of [
  'canonBinding',
  'manualSerialization',
  'writerLane',
  'sourceRef',
  'targetRef',
  'recoveryRef',
  'repository',
  'preflightFacts',
  'proofExpectations',
]) {
  for (const invalidValue of ['', 'none', '<placeholder>']) {
    check(`invalid structured binding ${binding} ${JSON.stringify(invalidValue)}`, () => {
      assertMismatchedDisposition(alteredRecord((record) => { record[binding] = invalidValue; }));
    });
  }
}

for (const binding of ['canonBinding', 'manualSerialization', 'repository']) {
  check(`missing structured binding ${binding}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => delete record[binding]));
  });
}

for (const binding of ['sourceRef', 'targetRef']) {
  for (const [name, mutate] of new Map([
    ['blank ref', (value) => { value.ref = ''; }],
    ['none ref', (value) => { value.ref = 'none'; }],
    ['placeholder ref', (value) => { value.ref = '<ref>'; }],
    ['malformed ref', (value) => { value.ref = 'integration'; }],
    ['blank sha', (value) => { value.sha = ''; }],
    ['none sha', (value) => { value.sha = 'none'; }],
    ['placeholder sha', (value) => { value.sha = '<sha>'; }],
    ['short sha', (value) => { value.sha = 'a'.repeat(39); }],
    ['nonhex sha', (value) => { value.sha = 'g'.repeat(40); }],
    ['wrong full sha', (value) => { value.sha = 'd'.repeat(40); }],
  ])) {
    check(`${binding} ${name}`, () => {
      assertMismatchedDisposition(alteredRecord((record) => mutate(record[binding])));
    });
  }
}

for (const [name, mutate] of new Map([
  ['source ref divergence', (record) => { record.sourceRef.ref = 'refs/heads/other-integration'; }],
  ['target ref divergence', (record) => { record.targetRef.ref = 'refs/heads/other-integration'; }],
  ['source SHA divergence', (record) => { record.sourceRef.sha = 'd'.repeat(40); }],
  ['target SHA divergence', (record) => { record.targetRef.sha = 'd'.repeat(40); }],
])) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

for (const [name, mutate] of new Map([
  ['blank recovery ref', (record) => { record.recoveryRef.ref = ''; }],
  ['none recovery ref', (record) => { record.recoveryRef.ref = 'none'; }],
  ['placeholder recovery ref', (record) => { record.recoveryRef.ref = '<ref>'; }],
  ['malformed recovery ref', (record) => { record.recoveryRef.ref = 'codex/example-lane'; }],
  ['wrong recovery branch', (record) => { record.recoveryRef.ref = 'refs/heads/codex/other-lane'; }],
  ['existing recovery ref', (record) => { record.recoveryRef.exists = true; }],
])) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

for (const [binding, invalidValues] of Object.entries({
  allowedPaths: ['', 'none', '<placeholder>', [], [''], ['none'], ['<path>']],
  exclusions: ['', 'none', '<placeholder>', [], [''], ['none'], ['<exclusion>']],
})) {
  for (const invalidValue of invalidValues) {
    check(`invalid scope binding ${binding} ${JSON.stringify(invalidValue)}`, () => {
      assertMismatchedDisposition(alteredRecord((record) => { record[binding] = invalidValue; }));
    });
  }
}

check('missing proof expectations', () => {
  assertMismatchedDisposition(alteredRecord((record) => delete record.proofExpectations));
});
for (const invalidProof of [[], [''], ['none'], ['<proof>']]) {
  check(`invalid proof expectations ${JSON.stringify(invalidProof)}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => { record.proofExpectations = invalidProof; }));
  });
}

const preflightCases = new Map([
  ['missing preflight', (record) => delete record.preflightFacts],
  ['missing preflight spec', (record) => delete record.preflightFacts.spec],
  ['missing preflight ticket', (record) => delete record.preflightFacts.ticket],
  ['missing preflight exact-order boundary', (record) => delete record.preflightFacts.exactJobOrder],
  ['wrong preflight spec', (record) => { record.preflightFacts.spec = 'SPEC-ZYXWVU'; }],
  ['wrong preflight ticket', (record) => { record.preflightFacts.ticket = 'TICKET-ZYXWVU'; }],
  ['claimed exact Preflight order', (record) => {
    record.preflightFacts.exactJobOrder = record.canonBinding.exactJobOrder;
  }],
  ['different claimed Preflight order', (record) => {
    record.preflightFacts.exactJobOrder = 'JO-ZYXWVU/R1';
  }],
  ['zero repositories', (record) => { record.preflightFacts.repositories = []; }],
  ['one repository', (record) => { record.preflightFacts.repositories = record.preflightFacts.repositories.slice(0, 1); }],
  ['duplicate repositories', (record) => { record.preflightFacts.repositories[1] = structuredClone(record.preflightFacts.repositories[0]); }],
  ['dirty repository', (record) => { record.preflightFacts.repositories[0].clean = false; }],
  ['none repository identity', (record) => { record.preflightFacts.repositories[0].repository.identity = 'none'; }],
  ['wrong Preflight repository identity', (record) => {
    record.preflightFacts.repositories[0].repository.identity = 'other-repository';
  }],
  ['wrong Preflight recovery remote', (record) => {
    record.preflightFacts.repositories[0].repository.recoveryRemote.name = 'backup';
  }],
  ['wrong push destination', (record) => { record.preflightFacts.pushDestination = 'refs/heads/codex/wrong-lane'; }],
  ['none push destination', (record) => { record.preflightFacts.pushDestination = 'none'; }],
  ['malformed repository ref', (record) => { record.preflightFacts.repositories[0].sourceRef.ref = 'integration'; }],
  ['malformed repository sha', (record) => { record.preflightFacts.repositories[1].targetRef.sha = 'c'.repeat(39); }],
  ['wrong bound repository commit', (record) => { record.preflightFacts.repositories[0].targetRef.sha = 'd'.repeat(40); }],
]);
for (const [name, mutate] of preflightCases) {
  check(name, () => assertMismatchedDisposition(alteredRecord(mutate)));
}

for (const band of ['blocking', 'reconcilable', 'failures']) {
  check(`nonempty preflight ${band}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => { record.preflightFacts[band] = ['finding']; }));
  });
  check(`nonempty repository ${band}`, () => {
    assertMismatchedDisposition(alteredRecord((record) => {
      record.preflightFacts.repositories[0][band] = ['finding'];
    }));
  });
}

check('decision priority', () => {
  const allFailures = withRecord(validRecord, {
    denied: true,
    scopeGrowth: true,
    stale: true,
    mismatched: true,
    entryFacts: { recoveryReadable: false, laneExists: true },
  });
  assert.equal(evaluate(allFailures).case, 'recovery-ambiguous');
  assert.equal(evaluate(withRecord(allFailures, { entryFacts: { recoveryReadable: true } })).case, 'duplicate');
  assert.equal(evaluate(alteredRecord((record) => {
    record.canonBinding.exactJobOrder = '';
    record.entryFacts.laneExists = true;
  })).case, 'duplicate');
  assert.equal(evaluate(alteredRecord((record) => {
    record.canonBinding.exactJobOrder = '';
    record.entryFacts.recoveryReadable = false;
    record.entryFacts.laneExists = true;
  })).case, 'recovery-ambiguous');
});

check('valid output preserves bindings', () => {
  const actual = evaluate(validRecord);
  assert.deepEqual(actual, {
    case: 'valid',
    ...expectedContract.get('valid'),
    checksPerformed: expectedChecksPerformed,
    invalidationReason: 'none',
    nextGate: '/in-flight',
    bindings: {
      canonBinding: validRecord.canonBinding,
      actor: validRecord.actor,
      role: validRecord.role,
      manualSerialization: validRecord.manualSerialization,
      writerLane: validRecord.writerLane,
      sourceRef: validRecord.sourceRef,
      targetRef: validRecord.targetRef,
      recoveryRef: validRecord.recoveryRef,
      repository: validRecord.repository,
      allowedPaths: validRecord.allowedPaths,
      exclusions: validRecord.exclusions,
      preflightFacts: validRecord.preflightFacts,
      proofExpectations: validRecord.proofExpectations,
      entryFacts: validRecord.entryFacts,
    },
    unavailable: bootstrapUnavailable,
    disclaimer: 'This is not a Claim, Run, lifecycle receipt, or closure.',
  });
});

for (const privateBinding of [
  new RegExp(`/${'Users'}/`),
  /\bS-\d{3}\b/,
  /\bTK-\d{3}\b/,
  /\bJO-\d{5}[A-Z]\b/,
  /\b[a-f0-9]{40}\b/i,
  /\b01a[0-9a-f-]{30,}\b/i,
]) {
  check('private binding absent', () => assert.doesNotMatch(skill, privateBinding));
}

check('recovery and landing boundary', () => {
  assert.match(skill, /not a Claim, Run, lifecycle receipt, or closure/i);
  assert.match(skill, /candidate or target movement invalidates/i);
  assert.match(skill, /explicit non-force/i);
});

if (problems.length > 0) {
  console.error(`BLOCKED - launch-flight contract has ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('ok - launch-flight bootstrap contract: authority-correlated records, 7 dispositions, deterministic priority, complete traces');
