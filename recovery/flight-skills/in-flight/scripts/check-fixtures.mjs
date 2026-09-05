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

check('skill exists', () => assert.ok(fs.existsSync(skillPath), 'in-flight/SKILL.md must exist'));
const skill = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';

check('frontmatter', () => {
  assert.match(skill, /^---\n[\s\S]*?^name:\s*in-flight\s*$[\s\S]*?^---$/m);
  assert.doesNotMatch(skill, /^disable-model-invocation:\s*true\s*$/m);
});

for (const binding of [
  'launchHandoff',
  'observation',
  'repository',
  'writerLane',
  'targetLiveRef',
  'recoveryLiveRef',
  'laneFacts',
  'execution',
  'candidate',
  'handoffState',
]) {
  check(`binding ${binding}`, () => assert.match(skill, new RegExp(`^\\s*${binding}:`, 'm')));
}

const desiredDecisionOrder = [
  'recovery-ambiguous',
  'duplicate-ambiguous',
  'denied',
  'scope-growth',
  'stale',
  'mismatched',
  'execution-blocked',
  'running',
  'candidate-ready',
];
const orderMatch = skill.match(/<!-- in-flight-decision-order:v1\s+([^\n]+) -->/);
const observedDecisionOrder = orderMatch?.[1]?.split('>').map((value) => value.trim()) ?? [];
check('deterministic decision order', () => assert.deepEqual(observedDecisionOrder, desiredDecisionOrder));

const expectedContract = new Map([
  ['candidate-ready', {
    outcome: 'bootstrap-review-ready',
    next: '/landing-check',
    response: 'Emit one exact-candidate Intent handoff; require independent review and grant no landing or merge authority.',
  }],
  ['running', {
    outcome: 'bootstrap-in-progress',
    next: '/in-flight',
    response: 'Report only the checked bounded facts and the next observation gate.',
  }],
  ['execution-blocked', {
    outcome: 'blocked',
    next: '/in-flight',
    response: 'Preserve the recoverable checkpoint and name the smallest execution correction or owner gate.',
  }],
  ['mismatched', {
    outcome: 'blocked',
    next: '/launch-flight',
    response: 'The launch authority, identity, lane, repository, state, scope, or proof bindings do not agree.',
  }],
  ['stale', {
    outcome: 'blocked',
    next: '/preflight',
    response: 'A bound target or authority fact moved; rerun the complete ticket-level entry checks.',
  }],
  ['scope-growth', {
    outcome: 'blocked',
    next: '/preflight',
    response: 'Return the added path or action to Canon; never widen the active lane.',
  }],
  ['denied', {
    outcome: 'blocked',
    next: 'none',
    response: 'Preserve the denial and name the exact owner, privacy, credential, or protected-action gate.',
  }],
  ['duplicate-ambiguous', {
    outcome: 'recovery-required',
    next: 'none',
    response: 'Multiple actors, lanes, launch handoffs, candidate refs, or prior handoffs are ambiguous; preserve all known state.',
  }],
  ['recovery-ambiguous', {
    outcome: 'recovery-required',
    next: 'none',
    response: 'A required repository, target, lane, candidate, or recovery fact is unreadable; preserve known refs and stop.',
  }],
]);

const observedContract = new Map();
const markerIndex = skill.indexOf('<!-- in-flight-contract:v1 -->');
check('contract marker', () => assert.notEqual(markerIndex, -1));
for (const line of skill.slice(Math.max(0, markerIndex)).split('\n')) {
  if (!line.startsWith('|') || !line.endsWith('|')) continue;
  const cells = line.slice(1, -1).split('|').map((cell) => cell.trim().replaceAll('`', ''));
  if (!expectedContract.has(cells[0])) continue;
  observedContract.set(cells[0], { outcome: cells[1], next: cells[2], response: cells[3] });
}
check('contract dispositions', () => assert.deepEqual(observedContract, expectedContract));

const unavailableFields = [
  'exactOrderReceipt',
  'lifecycleTip',
  'claimFuid',
  'runFuid',
  'handoffFuid',
  'handoffDigest',
];
const unavailable = Object.fromEntries(unavailableFields.map((field) => [field, 'bootstrap-unavailable']));
const canonBinding = {
  exactJobOrder: 'JO-ABCDEF/R1',
  spec: 'SPEC-ABCDEF',
  ticket: 'TICKET-ABCDEF',
};
const actor = 'engineer-alpha';
const role = 'engineer';
const writerLane = {
  worktree: '/workspace/isolated-lane',
  branch: 'codex/example-lane',
};
const baseRef = { ref: 'refs/heads/integration', sha: 'b'.repeat(40) };
const candidateRef = { ref: 'refs/heads/codex/example-lane', sha: 'd'.repeat(40) };
const recoveryRemote = { name: 'origin', url: 'https://example.invalid/shared-skills.git' };
const repository = { identity: 'shared-skills', recoveryRemote };
const allowedPaths = ['in-flight/SKILL.md', 'in-flight/scripts/check-fixtures.mjs'];
const exclusions = ['protected branches', 'private instance bindings', 'lifecycle receipts'];
const proofExpectations = ['focused-red-green', 'independent-fixed-sha-review', 'remote-read-back'];
const manualSerialization = {
  stewardPacketVerified: true,
  verifiedByRole: 'steward',
  exactJobOrder: canonBinding.exactJobOrder,
  spec: canonBinding.spec,
  ticket: canonBinding.ticket,
  actor,
  role,
  writerLane: structuredClone(writerLane),
  repositoryIdentity: repository.identity,
  recoveryRemote: structuredClone(recoveryRemote),
  recoveryRef: { ref: candidateRef.ref, exists: false },
  allowedPaths: [...allowedPaths],
  exclusions: [...exclusions],
  proofExpectations: [...proofExpectations],
};
const launchHandoff = {
  outcome: 'bootstrap-ready',
  next: '/in-flight',
  canonBinding: structuredClone(canonBinding),
  actor,
  role,
  manualSerialization,
  writerLane: structuredClone(writerLane),
  sourceRef: { ...baseRef },
  targetRef: { ...baseRef },
  recoveryRef: { ref: candidateRef.ref, exists: false },
  repository: structuredClone(repository),
  allowedPaths: [...allowedPaths],
  exclusions: [...exclusions],
  preflightFacts: {
    spec: canonBinding.spec,
    ticket: canonBinding.ticket,
    exactJobOrder: 'bootstrap-unavailable',
    pass: true,
    pushDestination: candidateRef.ref,
    repositories: [
      { repository: structuredClone(repository), clean: true, sourceRef: { ...baseRef }, targetRef: { ...baseRef }, blocking: [], reconcilable: [], failures: [] },
      { repository: { identity: 'control-canon', recoveryRemote: { name: 'control-origin', url: 'https://example.invalid/control.git' } }, clean: true, sourceRef: { ref: 'refs/heads/integration', sha: 'c'.repeat(40) }, targetRef: { ref: 'refs/heads/integration', sha: 'c'.repeat(40) }, blocking: [], reconcilable: [], failures: [] },
    ],
    blocking: [],
    reconcilable: [],
    failures: [],
  },
  proofExpectations: [...proofExpectations],
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
  ...unavailable,
  disclaimer: 'This is not a Claim, Run, lifecycle receipt, or closure.',
};
const candidateReadyRecord = {
  launchHandoff,
  observation: {
    repository: structuredClone(repository),
    writerLane: structuredClone(writerLane),
    targetLiveRef: { ...baseRef },
    recoveryLiveRef: { ...candidateRef, exists: true },
    laneFacts: {
      readable: true,
      worktreeExists: true,
      worktreeCount: 1,
      branchExists: true,
      branchCount: 1,
      branchUpstream: null,
      protected: false,
      actor,
      claimantCount: 1,
    },
    execution: {
      state: 'candidate-ready',
      denied: false,
      scopeGrowth: false,
      blocking: [],
      failures: [],
      exclusionViolations: [],
      tests: [
        { name: 'focused-red-green', status: 'pass' },
        { name: 'layout-and-privacy', status: 'pass' },
      ],
    },
    candidate: {
      ref: candidateRef.ref,
      sha: candidateRef.sha,
      remoteSha: candidateRef.sha,
      baseSha: baseRef.sha,
      baseIsAncestor: true,
      changedPaths: [...allowedPaths],
      dirty: false,
    },
    handoffState: {
      accepted: false,
      launchHandoffCount: 1,
      candidateRefCount: 1,
      priorCount: 0,
      landingAttempted: false,
      mergeAttempted: false,
    },
  },
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundString(value) {
  return typeof value === 'string' && value.trim() !== '' && value !== 'none' && !/<[^>]*>/.test(value);
}

function isFullSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isLiteralRepoPath(value) {
  if (!isBoundString(value)
    || path.isAbsolute(value)
    || /[*?\[\]]/.test(value)
    || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

function hasEmptyBands(value) {
  return ['blocking', 'reconcilable', 'failures'].every((band) => Array.isArray(value?.[band]) && value[band].length === 0);
}

function validHttpsRemote(value) {
  if (!isObject(value) || !isBoundString(value.name) || !isBoundString(value.url)) return false;
  try {
    return new URL(value.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function validPreflightRepositories(value, launch) {
  if (!Array.isArray(value) || value.length < 1) return false;
  const identities = value.map((entry) => entry?.repository?.identity);
  if (identities.some((identity) => !isBoundString(identity)) || new Set(identities).size !== identities.length) {
    return false;
  }
  const validEntries = value.every((entry) => isObject(entry)
    && isObject(entry.repository)
    && validHttpsRemote(entry.repository.recoveryRemote)
    && entry.clean === true
    && isObject(entry.sourceRef)
    && isObject(entry.targetRef)
    && entry.sourceRef.ref === 'refs/heads/integration'
    && entry.targetRef.ref === 'refs/heads/integration'
    && isFullSha(entry.sourceRef.sha)
    && isFullSha(entry.targetRef.sha)
    && hasEmptyBands(entry));
  if (!validEntries) return false;
  return value.some((entry) => isDeepStrictEqual(entry.repository, launch.repository)
    && isDeepStrictEqual(entry.sourceRef, launch.sourceRef)
    && isDeepStrictEqual(entry.targetRef, launch.targetRef));
}

function isReadableLiveRef(value, { requireExisting = false } = {}) {
  return isObject(value)
    && typeof value.ref === 'string'
    && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.ref)
    && !value.ref.includes('..')
    && !value.ref.includes('//')
    && !value.ref.endsWith('/')
    && isFullSha(value.sha)
    && (!requireExisting || value.exists === true);
}

function validLaunchHandoff(value) {
  if (!isObject(value)
    || value.outcome !== 'bootstrap-ready'
    || value.next !== '/in-flight'
    || !isObject(value.canonBinding)
    || !/^JO-[A-Z0-9]{6}\/R[1-9][0-9]*$/.test(value.canonBinding.exactJobOrder)
    || !isBoundString(value.canonBinding.spec)
    || !isBoundString(value.canonBinding.ticket)
    || !isBoundString(value.actor)
    || value.role !== 'engineer'
    || !isObject(value.writerLane)
    || !path.isAbsolute(value.writerLane.worktree)
    || !/^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value.writerLane.branch)
    || !isObject(value.repository)
    || !isBoundString(value.repository.identity)
    || !isObject(value.repository.recoveryRemote)
    || !validHttpsRemote(value.repository.recoveryRemote)
    || !isObject(value.sourceRef)
    || !isObject(value.targetRef)
    || !isFullSha(value.sourceRef.sha)
    || !isDeepStrictEqual(value.sourceRef, value.targetRef)
    || value.sourceRef.ref !== 'refs/heads/integration'
    || value.recoveryRef?.ref !== `refs/heads/${value.writerLane.branch}`
    || value.recoveryRef?.exists !== false
    || !Array.isArray(value.allowedPaths)
    || value.allowedPaths.length === 0
    || !value.allowedPaths.every(isLiteralRepoPath)
    || new Set(value.allowedPaths).size !== value.allowedPaths.length
    || !Array.isArray(value.exclusions)
    || value.exclusions.length === 0
    || !value.exclusions.every(isBoundString)
    || !Array.isArray(value.proofExpectations)
    || value.proofExpectations.length === 0
    || !value.proofExpectations.every(isBoundString)
    || value.preflightFacts?.pass !== true
    || value.preflightFacts?.spec !== value.canonBinding.spec
    || value.preflightFacts?.ticket !== value.canonBinding.ticket
    || value.preflightFacts?.exactJobOrder !== 'bootstrap-unavailable'
    || value.preflightFacts?.pushDestination !== value.recoveryRef.ref
    || !validPreflightRepositories(value.preflightFacts?.repositories, value)
    || !hasEmptyBands(value.preflightFacts)
    || !isObject(value.entryFacts)
    || value.entryFacts.sourceReadable !== true
    || value.entryFacts.targetReadable !== true
    || value.entryFacts.recoveryReadable !== true
    || value.entryFacts.laneExists !== false
    || value.entryFacts.worktreeExists !== false
    || value.entryFacts.branchExists !== false
    || value.entryFacts.recoveryRefExists !== false
    || value.entryFacts.authoritativeIdempotencyProof !== 'bootstrap-unavailable'
    || unavailableFields.some((field) => value[field] !== 'bootstrap-unavailable')
    || value.disclaimer !== 'This is not a Claim, Run, lifecycle receipt, or closure.') {
    return false;
  }
  const serialized = value.manualSerialization;
  return serialized?.stewardPacketVerified === true
    && serialized.verifiedByRole === 'steward'
    && serialized.exactJobOrder === value.canonBinding.exactJobOrder
    && serialized.spec === value.canonBinding.spec
    && serialized.ticket === value.canonBinding.ticket
    && serialized.actor === value.actor
    && serialized.role === value.role
    && isDeepStrictEqual(serialized.writerLane, value.writerLane)
    && serialized.repositoryIdentity === value.repository.identity
    && isDeepStrictEqual(serialized.recoveryRemote, value.repository.recoveryRemote)
    && isDeepStrictEqual(serialized.recoveryRef, value.recoveryRef)
    && isDeepStrictEqual(serialized.allowedPaths, value.allowedPaths)
    && isDeepStrictEqual(serialized.exclusions, value.exclusions)
    && isDeepStrictEqual(serialized.proofExpectations, value.proofExpectations);
}

function correlationMismatch(record) {
  const launch = record?.launchHandoff;
  const seen = record?.observation;
  const candidate = seen?.candidate;
  if (!validLaunchHandoff(launch) || !isObject(seen)) return true;
  const candidateReady = seen.execution?.state === 'candidate-ready';
  return !isDeepStrictEqual(seen.repository, launch.repository)
    || !isDeepStrictEqual(seen.writerLane, launch.writerLane)
    || !isDeepStrictEqual(seen.targetLiveRef, launch.targetRef)
    || seen.recoveryLiveRef?.ref !== launch.recoveryRef.ref
    || seen.laneFacts?.worktreeExists !== true
    || seen.laneFacts?.worktreeCount !== 1
    || seen.laneFacts?.branchExists !== true
    || seen.laneFacts?.branchCount !== 1
    || seen.laneFacts?.branchUpstream !== null
    || seen.laneFacts?.protected !== false
    || seen.laneFacts?.actor !== launch.actor
    || seen.laneFacts?.claimantCount !== 1
    || !['running', 'blocked', 'candidate-ready'].includes(seen.execution?.state)
    || seen.execution?.denied !== false
    || seen.execution?.scopeGrowth !== false
    || !Array.isArray(seen.execution?.blocking)
    || !Array.isArray(seen.execution?.failures)
    || !Array.isArray(seen.execution?.exclusionViolations)
    || !isObject(seen.handoffState)
    || seen.handoffState.accepted !== false
    || seen.handoffState.launchHandoffCount !== 1
    || seen.handoffState.candidateRefCount !== 1
    || !Number.isInteger(seen.handoffState.priorCount)
    || seen.handoffState.priorCount < 0
    || seen.handoffState.landingAttempted !== false
    || seen.handoffState.mergeAttempted !== false
    || (candidateReady && (
      !isObject(candidate)
      || candidate.ref !== launch.recoveryRef.ref
      || !isFullSha(candidate.sha)
      || candidate.remoteSha !== candidate.sha
      || seen.recoveryLiveRef?.sha !== candidate.sha
      || seen.recoveryLiveRef?.exists !== true
      || candidate.baseSha !== launch.targetRef.sha
      || candidate.baseIsAncestor !== true
      || candidate.dirty !== false
      || !Array.isArray(candidate.changedPaths)
      || candidate.changedPaths.length === 0
      || !candidate.changedPaths.every(isLiteralRepoPath)
      || new Set(candidate.changedPaths).size !== candidate.changedPaths.length
      || !candidate.changedPaths.every((changedPath) => launch.allowedPaths.includes(changedPath))
      || !Array.isArray(seen.execution.tests)
      || seen.execution.tests.length === 0
      || !seen.execution.tests.every((test) => isBoundString(test?.name) && test.status === 'pass')
    ))
    || (!candidateReady && candidate !== null);
}

function classify(record) {
  const seen = record?.observation;
  const recoveryUnreadable = !isObject(record)
    || !isObject(seen)
    || !isObject(seen.repository)
    || !isObject(seen.writerLane)
    || !isReadableLiveRef(seen.targetLiveRef)
    || !isReadableLiveRef(seen.recoveryLiveRef, { requireExisting: true })
    || seen.laneFacts?.readable !== true;
  const duplicate = Number(seen?.handoffState?.priorCount) > 0
    || Number(seen?.handoffState?.launchHandoffCount) > 1
    || Number(seen?.handoffState?.candidateRefCount) > 1
    || Number(seen?.laneFacts?.worktreeCount) > 1
    || Number(seen?.laneFacts?.branchCount) > 1
    || Number(seen?.laneFacts?.claimantCount) > 1;
  const stale = validLaunchHandoff(record?.launchHandoff)
    && (seen?.targetLiveRef?.sha !== record.launchHandoff.targetRef.sha
      || seen?.targetLiveRef?.ref !== record.launchHandoff.targetRef.ref);
  const mismatch = seen?.mismatched === true || correlationMismatch(record);
  const changedPaths = Array.isArray(seen?.candidate?.changedPaths) ? seen.candidate.changedPaths : [];
  const observedScopeGrowth = validLaunchHandoff(record?.launchHandoff)
    && changedPaths.some((changedPath) => !record.launchHandoff.allowedPaths.includes(changedPath));
  const conditions = {
    'recovery-ambiguous': recoveryUnreadable,
    'duplicate-ambiguous': duplicate,
    denied: seen?.execution?.denied === true,
    'scope-growth': seen?.execution?.scopeGrowth === true
      || observedScopeGrowth
      || seen?.execution?.exclusionViolations?.length > 0,
    stale,
    mismatched: mismatch,
    'execution-blocked': seen?.execution?.state === 'blocked'
      || seen?.execution?.blocking?.length > 0
      || seen?.execution?.failures?.length > 0,
    running: seen?.execution?.state === 'running',
    'candidate-ready': seen?.execution?.state === 'candidate-ready',
  };
  return desiredDecisionOrder.find((caseName) => conditions[caseName]) ?? 'mismatched';
}

const expectedChecks = [
  'launch-handoff-schema',
  'authority-correlation',
  'live-target-freshness',
  'lane-identity',
  'scope-diff',
  'candidate-recovery',
  'execution-proof',
  'handoff-state',
  'decision-order',
];

function evaluate(record) {
  const caseName = classify(record);
  const disposition = observedContract.get(caseName) ?? expectedContract.get(caseName);
  const result = {
    case: caseName,
    ...disposition,
    checksPerformed: [...expectedChecks],
    invalidationReason: caseName === 'candidate-ready' || caseName === 'running' ? 'none' : caseName,
    nextGate: disposition.next,
  };
  if (caseName !== 'candidate-ready') return result;
  const launch = record.launchHandoff;
  const seen = record.observation;
  return {
    ...result,
    handoff: {
      stage: 'bootstrap-in-flight',
      canonBinding: launch.canonBinding,
      actor: launch.actor,
      role: launch.role,
      writerLane: launch.writerLane,
      repository: launch.repository,
      allowedPaths: launch.allowedPaths,
      exclusions: launch.exclusions,
      proofExpectations: launch.proofExpectations,
      checkedTarget: seen.targetLiveRef,
      candidateRef: seen.recoveryLiveRef,
      changedPaths: seen.candidate.changedPaths,
      tests: seen.execution.tests,
      unavailable: structuredClone(unavailable),
      independentReviewRequired: true,
      landingAuthorized: false,
      mergeAuthorized: false,
      disclaimer: 'This is an Intent handoff, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.',
    },
  };
}

function altered(mutator) {
  const record = structuredClone(candidateReadyRecord);
  mutator(record);
  return record;
}

const cases = new Map([
  ['candidate-ready', candidateReadyRecord],
  ['running', altered((record) => {
    record.observation.execution.state = 'running';
    record.observation.execution.tests = [];
    record.observation.candidate = null;
  })],
  ['execution-blocked', altered((record) => {
    record.observation.execution.state = 'blocked';
    record.observation.execution.failures = ['focused-test-failed'];
    record.observation.candidate = null;
  })],
  ['mismatched', altered((record) => { record.observation.repository.identity = 'other-repository'; })],
  ['stale', altered((record) => { record.observation.targetLiveRef.sha = 'e'.repeat(40); })],
  ['scope-growth', altered((record) => { record.observation.execution.scopeGrowth = true; })],
  ['denied', altered((record) => { record.observation.execution.denied = true; })],
  ['duplicate-ambiguous', altered((record) => { record.observation.handoffState.priorCount = 2; })],
  ['recovery-ambiguous', altered((record) => { record.observation.laneFacts.readable = false; })],
]);

for (const [caseName, record] of cases) {
  check(`structured ${caseName}`, () => {
    const actual = evaluate(record);
    assert.equal(actual.case, caseName);
    assert.deepEqual(
      { outcome: actual.outcome, next: actual.next, response: actual.response },
      expectedContract.get(caseName),
    );
    assert.deepEqual(actual.checksPerformed, expectedChecks);
  });
}

for (const mutate of [
  (record) => { record.launchHandoff.outcome = 'blocked'; },
  (record) => { record.launchHandoff.next = '/landing-check'; },
  (record) => { record.launchHandoff.canonBinding.exactJobOrder = ''; },
  (record) => { record.launchHandoff.manualSerialization.actor = 'engineer-beta'; },
  (record) => { record.launchHandoff.preflightFacts.pass = false; },
  (record) => { record.launchHandoff.preflightFacts.repositories[0].clean = false; },
  (record) => { record.launchHandoff.preflightFacts.repositories[0].failures.push('failure'); },
  (record) => { record.launchHandoff.entryFacts.branchExists = true; },
  (record) => { record.launchHandoff.allowedPaths[0] = '../outside'; },
  (record) => { record.launchHandoff.allowedPaths[0] = 'in-flight/**'; },
  (record) => { record.launchHandoff.exactOrderReceipt = 'fabricated'; },
  (record) => { record.observation.writerLane.branch = 'codex/other'; },
  (record) => { record.observation.recoveryLiveRef.ref = 'refs/heads/codex/other'; },
  (record) => { record.observation.laneFacts.branchUpstream = 'origin/integration'; },
  (record) => { record.observation.laneFacts.actor = 'engineer-beta'; },
  (record) => { record.observation.candidate.remoteSha = 'e'.repeat(40); },
  (record) => { record.observation.recoveryLiveRef.sha = 'e'.repeat(40); },
  (record) => { record.observation.candidate.baseSha = 'e'.repeat(40); },
  (record) => { record.observation.candidate.baseIsAncestor = false; },
  (record) => { record.observation.execution.tests[0].status = 'fail'; },
  (record) => { delete record.observation.execution.denied; },
  (record) => { record.observation.execution.denied = 'unknown'; },
  (record) => { delete record.observation.execution.scopeGrowth; },
  (record) => { record.observation.execution.scopeGrowth = 'unknown'; },
  (record) => { record.observation.handoffState.accepted = true; },
  (record) => { record.observation.handoffState.landingAttempted = true; },
  (record) => { record.observation.handoffState.mergeAttempted = true; },
]) {
  check('mismatched binding rejects', () => {
    const actual = evaluate(altered(mutate));
    assert.deepEqual(
      { case: actual.case, outcome: actual.outcome, next: actual.next },
      { case: 'mismatched', outcome: 'blocked', next: '/launch-flight' },
    );
  });
}

check('actual changed-path growth is classified before mismatch', () => {
  const actual = evaluate(altered((record) => {
    record.observation.candidate.changedPaths.push('unapproved/file');
  }));
  assert.deepEqual(
    { case: actual.case, outcome: actual.outcome, next: actual.next },
    { case: 'scope-growth', outcome: 'blocked', next: '/preflight' },
  );
});

check('an observed excluded action is scope growth', () => {
  const actual = evaluate(altered((record) => {
    record.observation.execution.exclusionViolations.push('protected action');
  }));
  assert.equal(actual.case, 'scope-growth');
});

for (const duplicateField of ['launchHandoffCount', 'candidateRefCount']) {
  check(`duplicate ${duplicateField} is recovery-required`, () => {
    const actual = evaluate(altered((record) => {
      record.observation.handoffState[duplicateField] = 2;
    }));
    assert.equal(actual.case, 'duplicate-ambiguous');
  });
}

for (const duplicateField of ['worktreeCount', 'branchCount']) {
  check(`duplicate ${duplicateField} is recovery-required`, () => {
    const actual = evaluate(altered((record) => {
      record.observation.laneFacts[duplicateField] = 2;
    }));
    assert.equal(actual.case, 'duplicate-ambiguous');
  });
}

for (const [name, mutate] of new Map([
  ['missing live target ref name', (record) => { delete record.observation.targetLiveRef.ref; }],
  ['malformed live target ref name', (record) => { record.observation.targetLiveRef.ref = 'integration'; }],
  ['missing live target SHA', (record) => { delete record.observation.targetLiveRef.sha; }],
  ['malformed live target SHA', (record) => { record.observation.targetLiveRef.sha = 'b'.repeat(39); }],
  ['missing live recovery ref name', (record) => { delete record.observation.recoveryLiveRef.ref; }],
  ['malformed live recovery ref name', (record) => { record.observation.recoveryLiveRef.ref = 'codex/example'; }],
  ['missing live recovery SHA', (record) => { delete record.observation.recoveryLiveRef.sha; }],
  ['malformed live recovery SHA', (record) => { record.observation.recoveryLiveRef.sha = 'd'.repeat(39); }],
  ['missing live recovery existence', (record) => { delete record.observation.recoveryLiveRef.exists; }],
  ['nonboolean live recovery existence', (record) => { record.observation.recoveryLiveRef.exists = 'unknown'; }],
  ['absent live recovery candidate', (record) => { record.observation.recoveryLiveRef.exists = false; }],
])) {
  check(`${name} is recovery ambiguity`, () => {
    const actual = evaluate(altered(mutate));
    assert.deepEqual(
      { case: actual.case, outcome: actual.outcome, next: actual.next },
      { case: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none' },
    );
  });
}

check('decision priority is fail closed', () => {
  const all = altered((record) => {
    record.observation.laneFacts.readable = false;
    record.observation.laneFacts.claimantCount = 2;
    record.observation.execution.denied = true;
    record.observation.execution.scopeGrowth = true;
    record.observation.targetLiveRef.sha = 'e'.repeat(40);
    record.observation.execution.state = 'blocked';
  });
  assert.equal(evaluate(all).case, 'recovery-ambiguous');
  all.observation.laneFacts.readable = true;
  assert.equal(evaluate(all).case, 'duplicate-ambiguous');
});

check('candidate handoff is exact and non-authorizing', () => {
  const actual = evaluate(candidateReadyRecord);
  assert.equal(actual.handoff.stage, 'bootstrap-in-flight');
  assert.deepEqual(actual.handoff.canonBinding, launchHandoff.canonBinding);
  assert.deepEqual(actual.handoff.checkedTarget, baseRef);
  assert.deepEqual(actual.handoff.candidateRef, { ...candidateRef, exists: true });
  assert.deepEqual(actual.handoff.unavailable, unavailable);
  assert.equal(actual.handoff.independentReviewRequired, true);
  assert.equal(actual.handoff.landingAuthorized, false);
  assert.equal(actual.handoff.mergeAuthorized, false);
  assert.match(actual.handoff.disclaimer, /not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure/);
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

check('authority boundary is explicit', () => {
  assert.match(skill, /must not self-claim, self-accept, self-review, self-land, or self-merge/i);
  assert.match(skill, /candidate or target movement invalidates/i);
  assert.match(skill, /Intent handoff/i);
  assert.match(skill, /literal repository-relative file paths/i);
  assert.match(skill, /not globs or directory prefixes/i);
  assert.match(skill, /redact secrets, credentials, personal data, and private bindings/i);
  assert.match(skill, /exists: false.*recovery ambiguity.*not a mismatch/i);
  assert.match(skill, /preserve required refs inside the authorized recovery record/i);
  assert.match(skill, /not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure/i);
});

if (problems.length > 0) {
  console.error(`BLOCKED - in-flight contract has ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('ok - in-flight bootstrap contract: checked launch handoff, bounded execution, exact candidate recovery, deterministic handoff');
