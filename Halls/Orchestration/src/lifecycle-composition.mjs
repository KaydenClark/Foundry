import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { compileClearancePolicy } from '../../Gatehouse/src/index.mjs';
import {
  canonicalJson,
  digestCanonical,
  projectJournalHealth,
  validateJournalEvent,
} from '../../Knowledge/src/index.mjs';
import { createLifecycleEngine } from './lifecycle-engine.mjs';

const DEFAULT_POLICY_PATH = new URL('../../Gatehouse/contracts/clearance-policy.json', import.meta.url);
const DEFAULT_GIT_EXECUTABLE = '/usr/bin/git';
const SHA40 = /^[a-f0-9]{40}$/;
const TERMINAL_ACTION = 'lifecycle.terminal';
const AUTHORIZED_PATH_PREFIXES = Object.freeze(['state/', 'journal/events/']);

/**
 * The Knowledge Journal contract the engine's `bindConfiguration` demands. The
 * four functions are already exported; this only introduces them to the engine.
 */
export const journalContract = Object.freeze({
  canonicalJson,
  digestCanonical,
  projectJournalHealth,
  validateJournalEvent,
});

export function loadClearancePolicy(policyPath = DEFAULT_POLICY_PATH) {
  return compileClearancePolicy(JSON.parse(readFileSync(policyPath, 'utf8')));
}

export function eventPathFor(event) {
  return `journal/events/${String(event.sequence).padStart(3, '0')}-${event.eventId}.json`;
}

/**
 * Constructs the delivered lifecycle engine from the Gatehouse clearance policy
 * and the Knowledge Journal contract. This is the composition root: it owns no
 * lifecycle rules of its own and adds no authority the parts do not already
 * carry.
 */
export function composeLifecycleEngine({
  policyPath,
  compiledPolicy = loadClearancePolicy(policyPath),
  jobOrder,
  actorClass = 'engineer',
  authorizedActions,
  authorizedPathPrefixes = AUTHORIZED_PATH_PREFIXES,
  gateEvidence,
  evaluatedAt,
  ownerCommand = null,
  gitExecutable = DEFAULT_GIT_EXECUTABLE,
  repositoryPath,
  remote,
  lifecycleRef,
  projectionSink,
} = {}) {
  return createLifecycleEngine({
    journalContract,
    compiledPolicy,
    expectedPolicyDigest: compiledPolicy?.policyDigest,
    jobOrder,
    actorClass,
    authorizedActions,
    authorizedPathPrefixes,
    gateEvidence,
    evaluatedAt,
    ownerCommand,
    gitExecutable,
    repositoryPath,
    remote,
    lifecycleRef,
    ...(projectionSink ? { projectionSink } : {}),
  });
}

function git(gitExecutable, repositoryPath, args) {
  return execFileSync(gitExecutable, args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', GIT_TERMINAL_PROMPT: '0' },
  }).trim();
}

/**
 * Proposes, never decides. Reads the current authoritative boundary so a request
 * can be built against it; the engine re-reads and re-validates everything here
 * before it will move the ref, so a stale or wrong read is rejected, not trusted.
 */
export function readLifecycleProposal({
  gitExecutable = DEFAULT_GIT_EXECUTABLE,
  repositoryPath,
  remote,
  lifecycleRef,
  replayEventId = null,
} = {}) {
  const rows = git(gitExecutable, repositoryPath, ['ls-remote', '--refs', remote, lifecycleRef])
    .split('\n').filter(Boolean);
  if (rows.length !== 1) {
    return { readable: false, findings: ['authoritative lifecycle ref is unreadable or ambiguous'] };
  }
  const [tip, ref] = rows[0].split(/\s+/);
  if (!SHA40.test(tip) || ref !== lifecycleRef) {
    return { readable: false, findings: ['authoritative lifecycle ref did not resolve to one exact commit'] };
  }
  git(gitExecutable, repositoryPath, ['fetch', '--no-tags', remote, lifecycleRef]);
  let state;
  try {
    state = JSON.parse(git(gitExecutable, repositoryPath, ['show', `${tip}:state/lifecycle.json`]));
  } catch {
    return { readable: false, tip, findings: ['authoritative lifecycle state is missing or unreadable'] };
  }
  const paths = git(gitExecutable, repositoryPath, ['ls-tree', '-r', '--name-only', tip, '--', 'journal/events'])
    .split('\n').filter(Boolean).sort();
  const events = [];
  for (const path of paths) {
    try {
      events.push(JSON.parse(git(gitExecutable, repositoryPath, ['show', `${tip}:${path}`])));
    } catch {
      return { readable: false, tip, findings: [`authoritative Journal event '${path}' is unreadable`] };
    }
  }
  events.sort((left, right) => left.sequence - right.sequence);

  // A replay: the requested event is already the Journal tip. Rebuild the exact
  // boundary that request was first made against, so the engine recognises its
  // own stored event and answers with the receipt it already issued. Rebuilding
  // the request is not the same as re-deciding it — the engine still decides.
  if (replayEventId && state?.journal?.eventId === replayEventId) {
    let priorState;
    try {
      priorState = JSON.parse(git(gitExecutable, repositoryPath, ['show', `${tip}^:state/lifecycle.json`]));
    } catch {
      return { readable: false, tip, findings: ['replayed lifecycle event has no readable predecessor state'] };
    }
    return {
      readable: true,
      tip,
      state: priorState,
      predecessor: events.at(-2) ?? null,
      replay: true,
      findings: [],
    };
  }

  return { readable: true, tip, state, predecessor: events.at(-1) ?? null, replay: false, findings: [] };
}

/**
 * Builds the exact terminal transition the engine's `validateTerminal` accepts.
 * Every digest, ref, and identity comes from the caller's payload; nothing here
 * invents recovery evidence.
 */
export function planTerminalTransition({ state, predecessor, eventId, payload } = {}) {
  const sequence = (predecessor?.sequence ?? 0) + 1;
  const nextState = {
    ...state,
    status: 'terminal',
    disposition: payload?.disposition,
    recovery: { ref: payload?.recoveryRef, sha: payload?.recoverySha },
    journal: { eventId, sequence },
  };
  const event = {
    schemaVersion: '2.0',
    eventId,
    sequence,
    type: 'terminal.accepted',
    priorDigest: predecessor ? digestCanonical(predecessor) : 'none',
    stateDigest: digestCanonical(nextState),
    payload,
  };
  return { nextState, event };
}

/**
 * The first non-test caller of the lifecycle engine: compose, read the current
 * boundary, plan the terminal transition, and execute it. Returns the engine's
 * outcome verbatim — it never reinterprets a non-accepted result as success.
 */
export function closeJobOrder({
  policyPath,
  jobOrder,
  actorClass = 'engineer',
  gateEvidence,
  evaluatedAt,
  ownerCommand = null,
  gitExecutable = DEFAULT_GIT_EXECUTABLE,
  repositoryPath,
  remote,
  lifecycleRef,
  eventId,
  payload,
  projectionSink,
} = {}) {
  const engine = composeLifecycleEngine({
    policyPath,
    jobOrder,
    actorClass,
    authorizedActions: [TERMINAL_ACTION],
    gateEvidence,
    evaluatedAt,
    ownerCommand,
    gitExecutable,
    repositoryPath,
    remote,
    lifecycleRef,
    projectionSink,
  });

  const proposal = readLifecycleProposal({ gitExecutable, repositoryPath, remote, lifecycleRef, replayEventId: eventId });
  if (!proposal.readable) return { outcome: 'recovery-required', findings: proposal.findings };

  const { nextState, event } = planTerminalTransition({
    state: proposal.state,
    predecessor: proposal.predecessor,
    eventId,
    payload,
  });
  const request = {
    schemaVersion: '2.0',
    jobOrder,
    action: TERMINAL_ACTION,
    currentState: proposal.state,
    nextState,
    event,
    predecessor: proposal.predecessor,
    expectedTip: proposal.tip,
    requestedScope: ['state/lifecycle.json', eventPathFor(event)],
  };
  request.clearance = engine.clearanceFor(request);

  const result = engine.execute({ request });
  return result.outcome === 'accepted' || result.outcome === 'accepted-idempotent'
    ? { ...result, state: nextState, lifecycleCommitId: result.candidateSha }
    : result;
}
