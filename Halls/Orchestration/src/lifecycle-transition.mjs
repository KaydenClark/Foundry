import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evaluateClearance } from '../../Gatehouse/src/index.mjs';

const REQUEST_TRUST_FIELDS = [
  'authorizedScope',
  'clearanceContext',
  'compiledPolicy',
  'contract',
  'evaluateClearance',
  'evaluator',
  'expectedPolicyDigest',
  'gateEvidence',
  'ownerCommand',
];

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function jsonSnapshot(value) {
  return freeze(JSON.parse(JSON.stringify(value)));
}

function bindTrustedConfiguration(configuration) {
  const findings = [];
  if (!configuration || typeof configuration !== 'object') {
    return { trusted: {}, journalContract: {}, findings: ['trusted executor configuration is required'] };
  }
  for (const field of ['contract', 'evaluateClearance', 'evaluator']) {
    if (field in configuration) findings.push(`trusted executor configuration cannot replace Gatehouse ${field}`);
  }

  let trusted = {};
  try {
    trusted = jsonSnapshot({
      compiledPolicy: configuration.compiledPolicy,
      expectedPolicyDigest: configuration.expectedPolicyDigest,
      jobOrder: configuration.jobOrder,
      actorClass: configuration.actorClass,
      authorizedScope: configuration.authorizedScope,
      gateEvidence: configuration.gateEvidence,
      evaluatedAt: configuration.evaluatedAt,
      ownerCommand: configuration.ownerCommand ?? null,
    });
  } catch {
    findings.push('trusted executor configuration must be JSON-safe');
  }
  const journalContract = freeze({
    canonicalJson: configuration.journalContract?.canonicalJson,
    validateJournalEvent: configuration.journalContract?.validateJournalEvent,
  });
  if (typeof journalContract.canonicalJson !== 'function' || typeof journalContract.validateJournalEvent !== 'function') {
    findings.push('Knowledge Journal contract is required');
  }
  if (!/^[a-f0-9]{64}$/.test(trusted.expectedPolicyDigest ?? '')
    || trusted.compiledPolicy?.policyDigest !== trusted.expectedPolicyDigest) {
    findings.push('Gatehouse compiled policy does not match trusted provenance');
  }
  if (typeof trusted.jobOrder?.id !== 'string' || trusted.jobOrder.id.length === 0
    || typeof trusted.jobOrder?.revision !== 'string' || trusted.jobOrder.revision.length === 0) {
    findings.push('trusted Job Order identity and revision are required');
  }
  if (!Array.isArray(trusted.authorizedScope?.actions) || !Array.isArray(trusted.authorizedScope?.paths)) {
    findings.push('trusted Job Order grant is required');
  }
  return { trusted, journalContract, findings };
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateClearance(request, trusted, configurationFindings) {
  const findings = [...configurationFindings];
  if (REQUEST_TRUST_FIELDS.some((field) => field in (request ?? {}))) {
    findings.push('request cannot supply or replace trusted Clearance configuration');
  }
  if (request?.jobOrder?.id !== trusted.jobOrder?.id
    || request?.jobOrder?.revision !== trusted.jobOrder?.revision) {
    findings.push('request Job Order identity and revision do not match the bound Job Order');
  }
  if (request?.action !== 'lifecycle.migrate.v1-to-v2') findings.push('requested action is outside the bootstrap slice');
  if (!sameStringSet(trusted.authorizedScope?.actions, [request?.action])) {
    findings.push('Gatehouse authorized action does not match the request');
  }
  if (!sameStringSet(trusted.authorizedScope?.paths, request?.requestedScope)) {
    findings.push('Gatehouse authorized paths do not match the Job Order scope');
  }

  let evaluated;
  try {
    evaluated = evaluateClearance({
      compiledPolicy: trusted.compiledPolicy,
      actorClass: trusted.actorClass,
      authorizedScope: trusted.authorizedScope,
      gateEvidence: trusted.gateEvidence,
      evaluatedAt: trusted.evaluatedAt,
      ownerCommand: trusted.ownerCommand,
      request: { action: request?.action, paths: request?.requestedScope },
    });
  } catch {
    findings.push('Gatehouse Clearance evaluation failed');
    return findings;
  }
  if (evaluated.decision !== 'allow') {
    findings.push(`Gatehouse Clearance denied${evaluated.deniedRuleIds?.length ? `: ${evaluated.deniedRuleIds.join(', ')}` : ''}`);
  }
  if (evaluated.policyDigest !== trusted.expectedPolicyDigest) {
    findings.push('Gatehouse evaluation does not match trusted policy provenance');
  }
  if (request?.clearance?.decision !== evaluated.decision
    || request?.clearance?.policyDigest !== evaluated.policyDigest) {
    findings.push('claimed Clearance does not match Gatehouse evaluation');
  }
  return findings;
}

function validateTransitionRequest(request, journalContract, trusted, configurationFindings) {
  const findings = [];
  if (!request || typeof request !== 'object') return ['request must be an object'];
  if (request.schemaVersion !== '1.0') findings.push("request schemaVersion must be '1.0'");
  if (request.currentState?.schemaVersion !== '1.0' || request.currentState?.status !== 'unclaimed') {
    findings.push('current state must be schema v1 unclaimed');
  }
  if (request.nextState?.schemaVersion !== '2.0' || request.nextState?.status !== 'unclaimed') {
    findings.push('next state must be schema v2 unclaimed');
  }
  if (!/^[a-f0-9]{40}$/.test(request.expectedTip ?? '') || !/^[a-f0-9]{40}$/.test(request.actualTip ?? '')) {
    findings.push('expected and actual tip must be full Git object IDs');
  } else if (request.expectedTip !== request.actualTip) {
    findings.push('actual tip conflicts with expected tip');
  }
  const eventPath = Number.isInteger(request.event?.sequence) && request.event?.eventId
    ? `journal/events/${String(request.event.sequence).padStart(3, '0')}-${request.event.eventId}.json`
    : null;
  if (!eventPath || !sameStringSet(request.requestedScope, [eventPath, 'state/lifecycle.json'])) {
    findings.push('scope must contain exactly lifecycle state and the paired Journal event');
  }
  findings.push(...validateClearance(request, trusted, configurationFindings));
  if (typeof journalContract?.validateJournalEvent !== 'function' || typeof journalContract?.canonicalJson !== 'function') {
    findings.push('Knowledge Journal contract is required');
  } else {
    const journal = journalContract.validateJournalEvent({
      event: request.event,
      predecessor: request.predecessor,
      pairedState: request.nextState,
    });
    if (!journal.valid) findings.push(...journal.findings.map((finding) => `Journal: ${finding}`));
  }
  return findings;
}

function planLifecycleTransition(request, journalContract, trusted, configurationFindings) {
  const findings = validateTransitionRequest(request, journalContract, trusted, configurationFindings);
  if (findings.length > 0) return { outcome: 'rejected', expectedTip: request?.expectedTip ?? null, receiptDisposition: 'invalidate', findings };

  const sequence = String(request.event.sequence).padStart(3, '0');
  const writes = [
    {
      path: `journal/events/${sequence}-${request.event.eventId}.json`,
      bytes: journalContract.canonicalJson(request.event),
    },
    {
      path: 'state/lifecycle.json',
      bytes: journalContract.canonicalJson(request.nextState),
    },
  ];
  const treeDigest = sha256(journalContract.canonicalJson(writes));
  return {
    outcome: 'ready',
    expectedTip: request.expectedTip,
    treePlan: { writes, treeDigest },
    receiptDisposition: 'pending',
    findings: [],
  };
}

function outcome(name, receiptDisposition, retry = false) {
  return { outcome: name, receiptDisposition, retry };
}

export function classifyCasOutcome({
  plan, candidate, pushResult, authoritativeTip = null, authoritativeTreeDigest = null, preCasRetrySafe = false,
} = {}) {
  if (plan?.outcome !== 'ready') return outcome('recovery-required', 'invalidate');
  if (pushResult === 'not-attempted') {
    return preCasRetrySafe ? outcome('retryable-pre-cas', 'retain', true) : outcome('recovery-required', 'invalidate');
  }
  if (pushResult === 'conflict') return outcome('conflict', 'invalidate');
  if (!candidate?.sha || !candidate?.treeDigest) return outcome('recovery-required', 'invalidate');
  if (candidate.treeDigest !== plan.treePlan?.treeDigest) return outcome('recovery-required', 'invalidate');
  if (pushResult === 'accepted') {
    return authoritativeTip === candidate.sha && authoritativeTreeDigest === candidate.treeDigest
      ? outcome('accepted', 'consume')
      : outcome('recovery-required', 'invalidate');
  }
  if (pushResult === 'ambiguous') {
    if (!authoritativeTip || !authoritativeTreeDigest) return outcome('recovery-required', 'invalidate');
    return authoritativeTip === candidate.sha && authoritativeTreeDigest === candidate.treeDigest
      ? outcome('ambiguous-resolved-accepted', 'consume')
      : outcome('ambiguous-conflict', 'invalidate');
  }
  return outcome('recovery-required', 'invalidate');
}

function git(repositoryPath, args, { input, env } = {}) {
  return execFileSync('git', args, {
    cwd: repositoryPath,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim();
}

function remoteTip(repositoryPath, remote, lifecycleRef) {
  const result = spawnSync('git', ['ls-remote', remote, lifecycleRef], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  if (result.status !== 0) return { readable: false, tip: null };
  const line = result.stdout.trim();
  if (!line) return { readable: true, tip: null };
  const [tip, ref] = line.split(/\s+/);
  return /^[a-f0-9]{40}$/.test(tip) && ref === lifecycleRef
    ? { readable: true, tip }
    : { readable: false, tip: null };
}

function validLifecycleRef(value) {
  return typeof value === 'string'
    && /^refs\/heads\/instance-flights\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('.lock');
}

function recovery(findings, extra = {}) {
  return {
    outcome: 'recovery-required',
    receiptDisposition: 'invalidate',
    retry: false,
    findings,
    ...extra,
  };
}

function rejected(expectedTip, findings) {
  return {
    outcome: 'rejected',
    expectedTip,
    receiptDisposition: 'invalidate',
    findings,
  };
}

function readTreeFile(repositoryPath, tip, path) {
  const result = spawnSync('git', ['show', `${tip}:${path}`], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  return result.status === 0 ? { found: true, bytes: result.stdout } : { found: false, bytes: null };
}

function journalPaths(repositoryPath, tip) {
  const output = git(repositoryPath, ['ls-tree', '-r', '--name-only', tip, '--', 'journal/events']);
  return output ? output.split('\n').filter(Boolean).sort() : [];
}

function authenticateFetchedBoundary(repositoryPath, fetchedTip, request, journalContract) {
  const findings = [];
  let authoritativeState = null;
  const stateFile = readTreeFile(repositoryPath, fetchedTip, 'state/lifecycle.json');
  if (!stateFile.found) {
    findings.push('authoritative lifecycle state is missing');
  } else {
    try {
      authoritativeState = JSON.parse(stateFile.bytes);
      if (journalContract.canonicalJson(authoritativeState) !== journalContract.canonicalJson(request.currentState)) {
        findings.push('current state does not match authoritative lifecycle state');
      }
    } catch {
      findings.push('authoritative lifecycle state is invalid');
    }
  }

  const paths = journalPaths(repositoryPath, fetchedTip);
  if (authoritativeState?.schemaVersion === '1.0' && paths.length > 0) {
    findings.push('schema v1 lifecycle state requires empty Journal history');
  }
  const targetPath = `journal/events/${String(request.event.sequence).padStart(3, '0')}-${request.event.eventId}.json`;
  if (paths.includes(targetPath)) findings.push('target Journal event path is occupied');

  const history = [];
  for (const path of paths) {
    const match = /^journal\/events\/(\d+)-([A-Z0-9-]+)\.json$/.exec(path);
    const file = readTreeFile(repositoryPath, fetchedTip, path);
    if (!match || !file.found) {
      findings.push('authoritative Journal history is invalid');
      continue;
    }
    try {
      const event = JSON.parse(file.bytes);
      const sequence = Number(match[1]);
      if (event.sequence !== sequence || event.eventId !== match[2]) {
        findings.push('authoritative Journal path does not match its event');
      }
      history.push({ path, event, sequence });
    } catch {
      findings.push('authoritative Journal event is invalid');
    }
  }
  history.sort((left, right) => left.sequence - right.sequence || left.path.localeCompare(right.path));

  if (history.length !== request.event.sequence - 1) {
    findings.push('authoritative Journal history does not meet the event boundary');
  }
  for (let index = 0; index < history.length; index += 1) {
    const current = history[index];
    const predecessor = index === 0 ? null : history[index - 1].event;
    if (current.sequence !== index + 1) findings.push('authoritative Journal sequence is not contiguous');
    const expectedPriorDigest = predecessor === null
      ? 'none'
      : sha256(journalContract.canonicalJson(predecessor));
    if (current.event.priorDigest !== expectedPriorDigest) {
      findings.push('authoritative Journal prior digest is invalid');
    }
  }

  const authoritativePredecessor = history.length === 0 ? null : history.at(-1).event;
  try {
    if (journalContract.canonicalJson(authoritativePredecessor) !== journalContract.canonicalJson(request.predecessor)) {
      findings.push('request predecessor does not match authoritative Journal history');
    }
  } catch {
    findings.push('request predecessor is invalid');
  }
  return findings;
}

function buildCandidate(repositoryPath, expectedTip, treePlan) {
  const scratch = mkdtempSync(join(tmpdir(), 'foundry-lifecycle-index-'));
  const indexPath = join(scratch, 'index');
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    git(repositoryPath, ['read-tree', `${expectedTip}^{tree}`], { env });
    for (const write of treePlan.writes) {
      const blob = git(repositoryPath, ['hash-object', '-w', '--stdin'], { input: write.bytes });
      git(repositoryPath, ['update-index', '--add', '--cacheinfo', `100644,${blob},${write.path}`], { env });
    }
    const tree = git(repositoryPath, ['write-tree'], { env });
    const sha = git(repositoryPath, ['commit-tree', tree, '-p', expectedTip], {
      input: 'atomic lifecycle state and Journal transition\n',
    });
    return { sha, treeDigest: treePlan.treeDigest };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function executeLifecycleTransition({
  repositoryPath, remote, lifecycleRef, request,
} = {}, journalContract, trusted, configurationFindings) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) {
    return recovery(['repository path is required']);
  }
  if (typeof remote !== 'string' || remote.length === 0 || remote.startsWith('-')) return recovery(['remote is invalid']);
  if (!validLifecycleRef(lifecycleRef)) return recovery(['lifecycle ref is invalid']);

  const initialFindings = validateTransitionRequest(
    { ...request, actualTip: request?.expectedTip },
    journalContract,
    trusted,
    configurationFindings,
  );
  if (initialFindings.length > 0) {
    return {
      outcome: 'rejected',
      expectedTip: request?.expectedTip ?? null,
      receiptDisposition: 'invalidate',
      findings: initialFindings,
    };
  }

  const before = remoteTip(repositoryPath, remote, lifecycleRef);
  if (!before.readable || before.tip === null) return recovery(['authoritative lifecycle ref is unreadable']);
  if (before.tip !== request?.expectedTip) {
    return { ...outcome('conflict', 'invalidate'), authoritativeTip: before.tip, findings: [] };
  }

  try {
    git(repositoryPath, ['fetch', '--no-tags', remote, lifecycleRef]);
    const fetchedTip = git(repositoryPath, ['rev-parse', 'FETCH_HEAD']);
    if (fetchedTip !== request.expectedTip) {
      return { ...outcome('conflict', 'invalidate'), authoritativeTip: fetchedTip, findings: [] };
    }

    const boundaryFindings = authenticateFetchedBoundary(repositoryPath, fetchedTip, request, journalContract);
    if (boundaryFindings.length > 0) return rejected(request.expectedTip, [...new Set(boundaryFindings)]);

    const plan = planLifecycleTransition(
      { ...request, actualTip: fetchedTip },
      journalContract,
      trusted,
      configurationFindings,
    );
    if (plan.outcome !== 'ready') return plan;
    const candidate = buildCandidate(repositoryPath, fetchedTip, plan.treePlan);
    const push = spawnSync('git', ['push', '--porcelain', remote, `${candidate.sha}:${lifecycleRef}`], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    const after = remoteTip(repositoryPath, remote, lifecycleRef);
    if (!after.readable || after.tip === null) {
      return recovery(['authoritative lifecycle ref is unreadable after push'], { candidateSha: candidate.sha });
    }
    if (push.status !== 0 && after.tip === fetchedTip) {
      return {
        ...outcome('retryable-pre-cas', 'retain', true),
        candidateSha: candidate.sha,
        treeDigest: candidate.treeDigest,
        authoritativeTip: after.tip,
        findings: [],
      };
    }
    const classification = classifyCasOutcome({
      plan,
      candidate,
      pushResult: push.status === 0 ? 'accepted' : (after.tip === candidate.sha ? 'ambiguous' : 'conflict'),
      authoritativeTip: after.tip,
      authoritativeTreeDigest: after.tip === candidate.sha ? candidate.treeDigest : null,
    });
    return {
      ...classification,
      candidateSha: candidate.sha,
      treeDigest: candidate.treeDigest,
      authoritativeTip: after.tip,
      findings: [],
    };
  } catch {
    return recovery(['lifecycle transition transport failed']);
  }
}

export function createLifecycleTransitionExecutor(configuration) {
  const { trusted, journalContract, findings } = bindTrustedConfiguration(configuration);
  return freeze({
    validate: (request) => validateTransitionRequest(request, journalContract, trusted, findings),
    plan: (request) => planLifecycleTransition(request, journalContract, trusted, findings),
    execute: (input) => executeLifecycleTransition(input, journalContract, trusted, findings),
  });
}
