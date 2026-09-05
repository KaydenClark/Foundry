import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  createDenialRecord,
  evaluateClearance,
  projectPassage,
} from '../../Gatehouse/src/index.mjs';

const ACTIONS = new Set([
  'lifecycle.claim',
  'lifecycle.handoff',
  'lifecycle.terminal',
  'lifecycle.repair',
  'lifecycle.parent.ingest-child',
]);
const TERMINAL_PLANES = ['actuality', 'canon', 'enduringContext', 'grounding', 'intent', 'projection'];
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TRUSTED_SCRATCH_ROOT = '/private/tmp';
const TRUSTED_SCRATCH_PREFIX = 'foundry-lifecycle-engine-git-';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function snapshot(value) {
  return freeze(JSON.parse(JSON.stringify(value)));
}

function stableValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  throw new Error('value must be JSON-safe');
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function eventPath(event) {
  return Number.isInteger(event?.sequence) && /^[A-Z0-9-]+$/.test(event?.eventId ?? '')
    ? `journal/events/${String(event.sequence).padStart(3, '0')}-${event.eventId}.json`
    : null;
}

function validLifecycleRef(value) {
  return typeof value === 'string'
    && /^refs\/heads\/instance-flights\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('.lock');
}

function validJobOrder(value) {
  return typeof value?.id === 'string' && value.id.length > 0
    && typeof value?.revision === 'string' && value.revision.length > 0;
}

function bindConfiguration(configuration) {
  const findings = [];
  if (!configuration || typeof configuration !== 'object') {
    return { trusted: {}, journal: {}, findings: ['trusted engine configuration is required'] };
  }
  let trusted = {};
  try {
    trusted = snapshot({
      compiledPolicy: configuration.compiledPolicy,
      expectedPolicyDigest: configuration.expectedPolicyDigest,
      jobOrder: configuration.jobOrder,
      actorClass: configuration.actorClass,
      authorizedActions: configuration.authorizedActions,
      authorizedPathPrefixes: configuration.authorizedPathPrefixes,
      gateEvidence: configuration.gateEvidence,
      evaluatedAt: configuration.evaluatedAt,
      ownerCommand: configuration.ownerCommand ?? null,
      gitExecutable: configuration.gitExecutable,
      repositoryPath: configuration.repositoryPath,
      remote: configuration.remote,
      lifecycleRef: configuration.lifecycleRef,
    });
  } catch {
    findings.push('trusted engine configuration must be JSON-safe');
  }
  if (!validJobOrder(trusted.jobOrder)) findings.push('trusted Job Order identity and revision are required');
  if (!Array.isArray(trusted.authorizedActions) || trusted.authorizedActions.some((action) => !ACTIONS.has(action))) {
    findings.push('trusted authorized actions are invalid');
  }
  if (!Array.isArray(trusted.authorizedPathPrefixes)
    || trusted.authorizedPathPrefixes.some((prefix) => typeof prefix !== 'string' || prefix.length === 0)) {
    findings.push('trusted authorized path prefixes are invalid');
  }
  if (!SHA256.test(trusted.expectedPolicyDigest ?? '')
    || trusted.compiledPolicy?.policyDigest !== trusted.expectedPolicyDigest) {
    findings.push('trusted Gatehouse policy provenance is invalid');
  }
  if (typeof trusted.gitExecutable !== 'string' || !trusted.gitExecutable.startsWith('/')) {
    findings.push('trusted absolute Git executable is required');
  }
  if (typeof trusted.repositoryPath !== 'string' || !trusted.repositoryPath.startsWith('/')) {
    findings.push('trusted absolute lifecycle repository path is required');
  }
  if (typeof trusted.remote !== 'string' || trusted.remote.length === 0 || trusted.remote.startsWith('-')) {
    findings.push('trusted lifecycle remote is invalid');
  }
  if (!validLifecycleRef(trusted.lifecycleRef)) findings.push('trusted lifecycle ref is invalid');

  const journal = freeze({
    canonicalJson: configuration.journalContract?.canonicalJson,
    digestCanonical: configuration.journalContract?.digestCanonical,
    projectJournalHealth: configuration.journalContract?.projectJournalHealth,
    validateJournalEvent: configuration.journalContract?.validateJournalEvent,
  });
  for (const field of ['canonicalJson', 'digestCanonical', 'projectJournalHealth', 'validateJournalEvent']) {
    if (typeof journal[field] !== 'function') findings.push(`Knowledge Journal contract '${field}' is required`);
  }
  const projectionSink = configuration.projectionSink ?? (() => {});
  if (typeof projectionSink !== 'function') findings.push('trusted Projection sink must be a function');
  return { trusted, journal, projectionSink, findings };
}

function scopeAllowed(scope, prefixes) {
  return Array.isArray(scope)
    && scope.length === 2
    && scope.every((path) => typeof path === 'string' && prefixes.some((prefix) => path.startsWith(prefix)));
}

function evaluateRequestClearance(request, trusted) {
  const configuredAction = trusted.authorizedActions?.includes(request?.action);
  const configuredScope = scopeAllowed(request?.requestedScope, trusted.authorizedPathPrefixes ?? []);
  const authorizedScope = configuredAction && configuredScope
    ? { actions: [request.action], paths: request.requestedScope }
    : { actions: [], paths: [] };
  return evaluateClearance({
    compiledPolicy: trusted.compiledPolicy,
    actorClass: trusted.actorClass,
    authorizedScope,
    gateEvidence: trusted.gateEvidence,
    evaluatedAt: trusted.evaluatedAt,
    ownerCommand: trusted.ownerCommand,
    request: { action: request?.action, paths: request?.requestedScope },
  });
}

function validateTerminal(request, findings) {
  const payload = request.event?.payload;
  if (!['closing', 'delivered-unclosed'].includes(request.currentState?.status)) {
    findings.push('terminal transition requires delivered-unclosed or closing state');
  }
  if (request.nextState?.status !== 'terminal') findings.push('terminal transition must produce terminal state');
  if (payload?.disposition !== 'closed-complete' || request.nextState?.disposition !== payload.disposition) {
    findings.push('terminal transition requires closed-complete disposition');
  }
  if (!SHA256.test(payload?.artifactDigest ?? '') || !SHA256.test(payload?.postflightDigest ?? '')) {
    findings.push('terminal transition requires immutable artifact and PostFlight digests');
  }
  if (typeof payload?.recoveryRef !== 'string' || !SHA40.test(payload?.recoverySha ?? '')) {
    findings.push('terminal transition requires exact recovery ref and SHA');
  }
  if (request.nextState?.recovery?.ref !== payload?.recoveryRef
    || request.nextState?.recovery?.sha !== payload?.recoverySha) {
    findings.push('terminal state recovery boundary does not match its event');
  }
  if (!payload?.planeDigests || !sameStringSet(Object.keys(payload.planeDigests), TERMINAL_PLANES)
    || Object.values(payload.planeDigests ?? {}).some((digest) => !SHA256.test(digest))) {
    findings.push('terminal transition requires exact six-plane digests');
  }
}

function validateActionTransition(request) {
  const findings = [];
  const current = request.currentState;
  const next = request.nextState;
  if (current?.schemaVersion !== '2.0' || next?.schemaVersion !== '2.0') {
    return ['current and next state must use schema v2'];
  }
  if (request.action === 'lifecycle.claim') {
    if (current.status !== 'unclaimed' || next.status !== 'claimed') findings.push('claim requires unclaimed to claimed');
    if (!/^[A-Z0-9]{6}$/.test(next.claim?.claimFuid ?? '') || !/^[A-Z0-9]{6}$/.test(next.claim?.runFuid ?? '')) {
      findings.push('claim requires opaque claim and Run FUIDs');
    }
    if (request.event?.type !== 'claim.accepted'
      || request.event?.payload?.claimFuid !== next.claim?.claimFuid
      || request.event?.payload?.runFuid !== next.claim?.runFuid) {
      findings.push('claim event does not match claimed state');
    }
  } else if (request.action === 'lifecycle.handoff') {
    if (!['claimed', 'active', 'blocked', 'delivered-unclosed'].includes(current.status)
      || !['active', 'blocked', 'delivered-unclosed', 'closing'].includes(next.status)) {
      findings.push('handoff state transition is invalid');
    }
    if (request.event?.type !== 'handoff.accepted'
      || request.event?.payload?.accepted !== true
      || !/^[A-Z0-9]{6}$/.test(request.event?.payload?.handoffFuid ?? '')
      || next.handoff?.handoffFuid !== request.event?.payload?.handoffFuid) {
      findings.push('handoff requires one accepted opaque handoff identity');
    }
  } else if (request.action === 'lifecycle.terminal') {
    if (request.event?.type !== 'terminal.accepted') findings.push('terminal event type is invalid');
    validateTerminal(request, findings);
  } else if (request.action === 'lifecycle.repair') {
    if (!['blocked', 'recovery-required'].includes(current.status)) findings.push('repair requires blocked or recovery-required state');
    if (request.event?.type !== 'repair.accepted') findings.push('repair event type is invalid');
    if (next.repair?.repairAttempt !== 1 || next.repair?.repairBudget !== 1
      || next.repair?.repairKey !== repairKeyFor({
        jobOrder: request.jobOrder,
        runFuid: request.event?.payload?.runFuid,
        failureIdentity: request.event?.payload?.failureIdentity,
        exactTip: request.expectedTip,
        affectedRefsDigest: request.event?.payload?.affectedRefsDigest,
        authorizedScopeDigest: request.event?.payload?.authorizedScopeDigest,
      })) {
      findings.push('repair identity or one-attempt budget is invalid');
    }
    if (current.repair?.repairAttempt >= current.repair?.repairBudget) findings.push('repair-exhausted');
    if (request.event?.payload?.protectedScope === true) findings.push('protected scope is never automatically repaired');
  } else if (request.action === 'lifecycle.parent.ingest-child') {
    if (request.event?.type !== 'child.terminal-ingested') findings.push('parent ingestion event type is invalid');
    const reconciled = reconcileParentState(current, request.event?.payload);
    if (reconciled.outcome !== 'updated') findings.push(`parent ingestion is ${reconciled.outcome}`);
    else {
      const expected = { ...reconciled.state, journal: next.journal };
      if (request.journalContract.canonicalJson(expected) !== request.journalContract.canonicalJson(next)) {
        findings.push('parent next state does not match deterministic reconciliation');
      }
    }
  } else {
    findings.push('requested action is outside the lifecycle engine');
  }
  return findings;
}

function validateRequest(request, trusted, journal, configurationFindings, {
  evaluatedClearance = null,
  allowDeniedClearance = false,
} = {}) {
  const findings = [...configurationFindings];
  if (!request || typeof request !== 'object') return ['request must be an object'];
  if (request.schemaVersion !== '2.0') findings.push("request schemaVersion must be '2.0'");
  if (request.jobOrder?.id !== trusted.jobOrder?.id || request.jobOrder?.revision !== trusted.jobOrder?.revision) {
    findings.push('request Job Order does not match trusted identity and revision');
  }
  if (!SHA40.test(request.expectedTip ?? '')) findings.push('expectedTip must be a full Git object ID');
  const path = eventPath(request.event);
  if (!path || !sameStringSet(request.requestedScope, ['state/lifecycle.json', path])) {
    findings.push('scope must contain exactly lifecycle state and the paired Journal event');
  }
  if (!scopeAllowed(request.requestedScope, trusted.authorizedPathPrefixes ?? [])) findings.push('request scope exceeds the trusted path cap');
  if (!trusted.authorizedActions?.includes(request.action)) findings.push('request action exceeds the trusted action cap');
  const evaluated = evaluatedClearance ?? evaluateRequestClearance(request, trusted);
  if (request.clearance?.decision !== evaluated.decision || request.clearance?.policyDigest !== evaluated.policyDigest) {
    findings.push('claimed Clearance does not match Gatehouse evaluation');
  }
  if (!allowDeniedClearance && evaluated.decision !== 'allow') {
    findings.push(`Gatehouse Clearance denied: ${evaluated.deniedRuleIds.join(', ')}`);
  }
  const withContract = { ...request, journalContract: journal };
  findings.push(...validateActionTransition(withContract));
  const journalResult = journal.validateJournalEvent({
    event: request.event,
    predecessor: request.predecessor,
    pairedState: request.nextState,
  });
  if (!journalResult.valid) findings.push(...journalResult.findings.map((finding) => `Journal: ${finding}`));
  return [...new Set(findings)];
}

function trustedGitEnv(scratch) {
  return {
    PATH: '/usr/bin:/bin',
    HOME: scratch,
    TMPDIR: scratch,
    TMP: scratch,
    TEMP: scratch,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    GIT_CEILING_DIRECTORIES: scratch,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: join(scratch, 'hooks'),
    GIT_AUTHOR_NAME: 'Foundry Lifecycle Engine',
    GIT_AUTHOR_EMAIL: 'lifecycle@example.invalid',
    GIT_COMMITTER_NAME: 'Foundry Lifecycle Engine',
    GIT_COMMITTER_EMAIL: 'lifecycle@example.invalid',
  };
}

function withScratch(callback) {
  const rootStat = lstatSync(TRUSTED_SCRATCH_ROOT);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || rootStat.uid !== 0 || (rootStat.mode & 0o7777) !== 0o1777
    || realpathSync(TRUSTED_SCRATCH_ROOT) !== TRUSTED_SCRATCH_ROOT) {
    throw new Error('trusted lifecycle scratch root is unsafe');
  }
  const created = mkdtempSync(join(TRUSTED_SCRATCH_ROOT, TRUSTED_SCRATCH_PREFIX));
  try {
    const scratchStat = lstatSync(created);
    const currentUid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (scratchStat.isSymbolicLink() || !scratchStat.isDirectory()
      || currentUid === null || scratchStat.uid !== currentUid
      || (scratchStat.mode & 0o777) !== 0o700
      || realpathSync(created) !== created) {
      throw new Error('fresh lifecycle scratch directory is unsafe');
    }
    const hooks = join(created, 'hooks');
    mkdirSync(hooks, { mode: 0o700 });
    const hooksStat = lstatSync(hooks);
    if (hooksStat.isSymbolicLink() || !hooksStat.isDirectory()
      || currentUid === null || hooksStat.uid !== currentUid
      || (hooksStat.mode & 0o777) !== 0o700
      || realpathSync(hooks) !== hooks) {
      throw new Error('fresh lifecycle hooks directory is unsafe');
    }
    return callback(created);
  } finally {
    rmSync(created, { recursive: true, force: true });
  }
}

function git(trusted, repositoryPath, args, { input, env = {} } = {}) {
  return withScratch((scratch) => execFileSync(trusted.gitExecutable, ['-C', repositoryPath, ...args], {
    cwd: scratch,
    input,
    encoding: 'utf8',
    env: { ...trustedGitEnv(scratch), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim());
}

function spawnGit(trusted, repositoryPath, args) {
  return withScratch((scratch) => spawnSync(trusted.gitExecutable, ['-C', repositoryPath, ...args], {
    cwd: scratch,
    encoding: 'utf8',
    env: trustedGitEnv(scratch),
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }));
}

function repositoryGitBoundaryFindings(trusted) {
  let keys;
  try {
    const output = git(trusted, trusted.repositoryPath, [
      'config', '--local', '--no-includes', '--name-only', '--list',
    ]);
    keys = output ? output.split('\n').map((key) => key.trim().toLowerCase()).filter(Boolean) : [];
  } catch {
    return ['repository-local Git configuration is unreadable'];
  }
  const unsafe = keys.some((key) => (
    /^url\..+\.(insteadof|pushinsteadof)$/.test(key)
    || /^include(if)?\./.test(key)
    || /^remote\..+\.(proxy|proxyauthmethod|uploadpack|receivepack)$/.test(key)
    || /^(core\.(sshcommand|gitproxy|hookspath)|http\.|credential\.|protocol\.)/.test(key)
  ));
  return unsafe ? ['repository-local Git transport configuration is not trusted'] : [];
}

function remoteTip(trusted, repositoryPath, remote, lifecycleRef) {
  const result = spawnGit(trusted, repositoryPath, ['ls-remote', '--refs', remote, lifecycleRef]);
  if (result.status !== 0) return { readable: false, tip: null };
  const rows = result.stdout.trim().split('\n').filter(Boolean);
  if (rows.length === 0) return { readable: true, tip: null };
  if (rows.length !== 1) return { readable: false, tip: null };
  const [tip, ref] = rows[0].split(/\s+/);
  return SHA40.test(tip) && ref === lifecycleRef ? { readable: true, tip } : { readable: false, tip: null };
}

function readTreeFile(trusted, repositoryPath, tip, path) {
  const result = spawnGit(trusted, repositoryPath, ['show', `${tip}:${path}`]);
  return result.status === 0 ? result.stdout : null;
}

function readBoundary(trusted, journal, repositoryPath, tip) {
  const findings = [];
  let state = null;
  try {
    const stateBytes = readTreeFile(trusted, repositoryPath, tip, 'state/lifecycle.json');
    if (stateBytes === null) throw new Error('missing lifecycle state');
    state = JSON.parse(stateBytes);
    if (!state || typeof state !== 'object' || state.schemaVersion !== '2.0') throw new Error('invalid lifecycle state');
  } catch {
    findings.push('authoritative lifecycle state is missing or invalid');
  }
  let paths = [];
  try {
    const output = git(trusted, repositoryPath, ['ls-tree', '-r', '--name-only', tip, '--', 'journal/events']);
    paths = output ? output.split('\n').filter(Boolean).sort() : [];
  } catch {
    findings.push('authoritative Journal tree is unreadable');
  }
  const events = [];
  for (const path of paths) {
    const match = /^journal\/events\/(\d+)-([A-Z0-9-]+)\.json$/.exec(path);
    try {
      const rawBytes = readTreeFile(trusted, repositoryPath, tip, path);
      if (rawBytes === null) throw new Error('missing Journal event');
      const event = JSON.parse(rawBytes);
      if (!match || event.sequence !== Number(match[1]) || event.eventId !== match[2]) {
        findings.push('authoritative Journal path does not match its event');
      }
      if (rawBytes !== journal.canonicalJson(event)) {
        findings.push(`authoritative Journal event '${event.eventId}' is not stored as canonical raw bytes`);
      }
      events.push({ path, event, rawBytes });
    } catch {
      findings.push('authoritative Journal event is invalid');
    }
  }
  events.sort((left, right) => left.event.sequence - right.event.sequence || left.path.localeCompare(right.path));
  let predecessor = null;
  const seenEventIds = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const stored = events[index];
    if (seenEventIds.has(stored.event.eventId)) {
      findings.push(`authoritative Journal has duplicate historical event identity '${stored.event.eventId}'`);
    } else {
      seenEventIds.add(stored.event.eventId);
    }
    let introducingCommit = null;
    try {
      const output = git(trusted, repositoryPath, [
        'log', '--diff-filter=A', '--format=%H', '--reverse', tip, '--', stored.path,
      ]);
      const commits = output ? output.split('\n').filter(Boolean) : [];
      if (commits.length !== 1 || !SHA40.test(commits[0])) {
        findings.push(`authoritative Journal event '${stored.event.eventId}' has no unique introducing commit`);
      } else {
        [introducingCommit] = commits;
      }
    } catch {
      findings.push(`authoritative Journal event '${stored.event.eventId}' introduction is unreadable`);
    }
    if (!introducingCommit) continue;

    let historicalEvent;
    let historicalBytes;
    let pairedState;
    try {
      historicalBytes = readTreeFile(trusted, repositoryPath, introducingCommit, stored.path);
      if (historicalBytes === null) throw new Error('missing introducing event');
      historicalEvent = JSON.parse(historicalBytes);
      pairedState = JSON.parse(readTreeFile(trusted, repositoryPath, introducingCommit, 'state/lifecycle.json'));
    } catch {
      findings.push(`authoritative Journal event '${stored.event.eventId}' has no readable introducing state pair`);
      continue;
    }
    try {
      if (historicalBytes !== journal.canonicalJson(historicalEvent)) {
        findings.push(`authoritative Journal event '${stored.event.eventId}' introduction is not canonical raw bytes`);
      }
      if (historicalBytes !== stored.rawBytes) {
        findings.push(`authoritative Journal event '${stored.event.eventId}' changed after introduction`);
      }
    } catch {
      findings.push(`authoritative Journal event '${stored.event.eventId}' is not canonical JSON`);
      continue;
    }
    const validation = journal.validateJournalEvent({
      event: historicalEvent,
      predecessor,
      pairedState,
    });
    if (!validation.valid) {
      findings.push(...validation.findings.map(
        (finding) => `authoritative Journal event '${stored.event.eventId}' is invalid: ${finding}`,
      ));
    }
    predecessor = historicalEvent;
  }
  if (events.length === 0) {
    if (state?.journal) findings.push('authoritative state points to a missing Journal event');
  } else {
    const last = events.at(-1).event;
    if (state?.journal?.eventId !== last.eventId || state?.journal?.sequence !== last.sequence) {
      findings.push('authoritative state does not point to the Journal tip');
    }
    if (last.stateDigest !== journal.digestCanonical(state)) findings.push('authoritative state digest does not match Journal tip');
  }
  return { state, events, findings: [...new Set(findings)] };
}

function buildCandidate(trusted, journal, repositoryPath, expectedTip, state, event) {
  return withScratch((scratch) => {
    const indexPath = join(scratch, 'index');
    const env = { GIT_INDEX_FILE: indexPath };
    git(trusted, repositoryPath, ['read-tree', `${expectedTip}^{tree}`], { env });
    const writes = [
      { path: eventPath(event), bytes: journal.canonicalJson(event) },
      { path: 'state/lifecycle.json', bytes: journal.canonicalJson(state) },
    ];
    for (const write of writes) {
      const blob = git(trusted, repositoryPath, ['hash-object', '-w', '--stdin'], { input: write.bytes });
      git(trusted, repositoryPath, ['update-index', '--add', '--cacheinfo', `100644,${blob},${write.path}`], { env });
    }
    const tree = git(trusted, repositoryPath, ['write-tree'], { env });
    const sha = git(trusted, repositoryPath, ['commit-tree', tree, '-p', expectedTip], {
      input: 'atomic lifecycle state and Journal transition\n',
    });
    return { sha, treeDigest: sha256(journal.canonicalJson(writes)) };
  });
}

function receiptFor(trusted, journal, repositoryPath, lifecycleRef, commitId, event) {
  let priorTip = null;
  try {
    priorTip = git(trusted, repositoryPath, ['rev-parse', `${commitId}^`]);
  } catch {
    priorTip = null;
  }
  const core = {
    schemaVersion: '1.0',
    eventId: event.eventId,
    eventDigest: journal.digestCanonical(event),
    stateDigest: event.stateDigest,
    lifecycleCommitId: commitId,
    priorTip,
    recovery: { ref: lifecycleRef, sha: commitId },
  };
  return freeze({ ...core, receiptDigest: journal.digestCanonical(core) });
}

function existingEvent(trusted, journal, repositoryPath, tip, requestEvent) {
  const boundary = readBoundary(trusted, journal, repositoryPath, tip);
  if (boundary.findings.length > 0) return { found: false, invalid: true, boundary };
  const found = boundary.events.find(({ event }) => event.eventId === requestEvent?.eventId);
  if (!found) return { found: false, boundary };
  if (journal.canonicalJson(found.event) !== journal.canonicalJson(requestEvent)) {
    return { found: true, conflict: true, boundary };
  }
  let commitId = null;
  try {
    commitId = git(trusted, repositoryPath, ['log', '-1', '--format=%H', tip, '--', found.path]);
  } catch {
    return { found: true, conflict: true, boundary };
  }
  return { found: true, conflict: false, boundary, event: found.event, commitId };
}

function captureProjections({ projectionSink, journal, state, event, receipt, passage = null }) {
  const lifecycle = projectLifecycle({ state, event, lifecycleCommitId: receipt.lifecycleCommitId });
  const journalHealth = journal.projectJournalHealth({
    count: event.sequence,
    health: 'healthy',
    lastDigest: journal.digestCanonical(event),
    recovery: 'exact',
  }, { recoveryRef: receipt.recovery.ref, recoverySha: receipt.recovery.sha });
  const capture = freeze({ lifecycle, journalHealth, ...(passage ? { passage } : {}) });
  projectionSink(capture);
  return capture;
}

function pushCandidate(trusted, repositoryPath, remote, lifecycleRef, expectedTip, candidate) {
  const push = spawnGit(trusted, repositoryPath, ['push', '--porcelain', remote, `${candidate.sha}:${lifecycleRef}`]);
  const after = remoteTip(trusted, repositoryPath, remote, lifecycleRef);
  if (!after.readable || after.tip === null) return { outcome: 'recovery-required', authoritativeTip: null };
  if (after.tip === candidate.sha) return { outcome: 'accepted', authoritativeTip: after.tip };
  if (push.status !== 0 && after.tip === expectedTip) return { outcome: 'rejected-before-cas', authoritativeTip: after.tip };
  return { outcome: 'conflict', authoritativeTip: after.tip };
}

function appendDenial({ trusted, journal, projectionSink, repositoryPath, remote, lifecycleRef, request, decision, before }) {
  git(trusted, repositoryPath, ['fetch', '--no-tags', remote, lifecycleRef]);
  const fetchedTip = git(trusted, repositoryPath, ['rev-parse', 'FETCH_HEAD']);
  if (fetchedTip !== before.tip) return { outcome: 'conflict', authoritativeTip: fetchedTip, receiptDisposition: 'invalidate' };
  const boundary = readBoundary(trusted, journal, repositoryPath, fetchedTip);
  if (boundary.findings.length > 0) {
    return { outcome: 'deny-unrecorded', recoveryRequired: true, findings: boundary.findings };
  }
  const denialRecord = createDenialRecord({
    decision,
    jobOrder: trusted.jobOrder,
    requestedTransition: request.action,
    requestedScope: request.requestedScope,
    evaluatedAt: trusted.evaluatedAt,
  });
  const recorded = boundary.events.find(({ event: candidate }) => candidate.eventId === denialRecord.denialId);
  if (recorded) {
    if (journal.canonicalJson(recorded.event.payload) !== journal.canonicalJson(denialRecord)) {
      return { outcome: 'deny-unrecorded', recoveryRequired: true, findings: ['denial identity conflict'] };
    }
    const commitId = git(trusted, repositoryPath, ['log', '-1', '--format=%H', fetchedTip, '--', recorded.path]);
    const receipt = receiptFor(trusted, journal, repositoryPath, lifecycleRef, commitId, recorded.event);
    return {
      outcome: 'deny-recorded-idempotent', receipt, denialRecord,
      denialEventPath: recorded.path, authoritativeTip: fetchedTip, receiptDisposition: 'consume',
    };
  }
  if (before.tip !== request.expectedTip) {
    return { outcome: 'conflict', authoritativeTip: before.tip, receiptDisposition: 'invalidate' };
  }
  const sequence = boundary.events.length + 1;
  const nextState = {
    ...boundary.state,
    journal: { eventId: denialRecord.denialId, sequence },
    lastDenial: { denialId: denialRecord.denialId, policyDigest: denialRecord.policyDigest },
  };
  const predecessor = boundary.events.at(-1)?.event ?? null;
  const event = {
    schemaVersion: '2.0',
    eventId: denialRecord.denialId,
    sequence,
    type: 'passage.denied',
    priorDigest: predecessor ? journal.digestCanonical(predecessor) : 'none',
    stateDigest: journal.digestCanonical(nextState),
    payload: denialRecord,
  };
  const duplicate = existingEvent(trusted, journal, repositoryPath, fetchedTip, event);
  if (duplicate.found) {
    if (duplicate.conflict) return { outcome: 'deny-unrecorded', recoveryRequired: true, findings: ['denial identity conflict'] };
    const receipt = receiptFor(trusted, journal, repositoryPath, lifecycleRef, duplicate.commitId, duplicate.event);
    return { outcome: 'deny-recorded-idempotent', receipt, denialRecord, denialEventPath: eventPath(event) };
  }
  const candidate = buildCandidate(trusted, journal, repositoryPath, fetchedTip, nextState, event);
  const pushed = pushCandidate(trusted, repositoryPath, remote, lifecycleRef, fetchedTip, candidate);
  if (pushed.outcome !== 'accepted') {
    return {
      outcome: 'deny-unrecorded',
      recoveryRequired: true,
      authoritativeTip: pushed.authoritativeTip,
      findings: ['denial persistence failed; target remains denied'],
    };
  }
  const receipt = receiptFor(trusted, journal, repositoryPath, lifecycleRef, candidate.sha, event);
  let projectionFailed = false;
  try {
    captureProjections({
      projectionSink,
      journal,
      state: nextState,
      event,
      receipt,
      passage: projectPassage({ denialRecord, lifecycleCommitId: candidate.sha }),
    });
  } catch {
    projectionFailed = true;
  }
  return {
    outcome: 'deny-recorded',
    candidateSha: candidate.sha,
    authoritativeTip: candidate.sha,
    receipt,
    denialRecord,
    denialEventPath: eventPath(event),
    projectionFailed,
    receiptDisposition: 'consume',
  };
}

function execute({ trusted, journal, projectionSink, configurationFindings }, { request } = {}) {
  const { repositoryPath, remote, lifecycleRef } = trusted;
  if (configurationFindings.length > 0) return { outcome: 'recovery-required', findings: configurationFindings };
  let decision;
  try {
    decision = evaluateRequestClearance(request, trusted);
  } catch {
    return { outcome: 'recovery-required', findings: ['Gatehouse Clearance evaluation failed'] };
  }
  const requestFindings = validateRequest(request, trusted, journal, configurationFindings, {
    evaluatedClearance: decision,
    allowDeniedClearance: true,
  });
  if (requestFindings.length > 0) {
    return { outcome: 'rejected', findings: requestFindings, receiptDisposition: 'invalidate' };
  }
  const gitBoundaryFindings = repositoryGitBoundaryFindings(trusted);
  if (gitBoundaryFindings.length > 0) return { outcome: 'recovery-required', findings: gitBoundaryFindings };
  const before = remoteTip(trusted, repositoryPath, remote, lifecycleRef);
  if (!before.readable || before.tip === null) return { outcome: 'recovery-required', findings: ['authoritative lifecycle ref is unreadable'] };

  if (decision.decision !== 'allow') {
    return appendDenial({ trusted, journal, projectionSink, repositoryPath, remote, lifecycleRef, request, decision, before });
  }

  const duplicate = existingEvent(trusted, journal, repositoryPath, before.tip, request?.event);
  if (duplicate.invalid) {
    return { outcome: 'recovery-required', findings: duplicate.boundary.findings, receiptDisposition: 'invalidate' };
  }
  if (duplicate.found) {
    if (duplicate.conflict) return { outcome: 'recovery-required', findings: ['event identity was reused with conflicting bytes'] };
    const receipt = receiptFor(trusted, journal, repositoryPath, lifecycleRef, duplicate.commitId, duplicate.event);
    return { outcome: 'accepted-idempotent', candidateSha: duplicate.commitId, authoritativeTip: before.tip, receipt, receiptDisposition: 'consume' };
  }

  if (before.tip !== request?.expectedTip) return { outcome: 'conflict', authoritativeTip: before.tip, receiptDisposition: 'invalidate' };

  git(trusted, repositoryPath, ['fetch', '--no-tags', remote, lifecycleRef]);
  const fetchedTip = git(trusted, repositoryPath, ['rev-parse', 'FETCH_HEAD']);
  if (fetchedTip !== request.expectedTip) return { outcome: 'conflict', authoritativeTip: fetchedTip, receiptDisposition: 'invalidate' };
  const boundary = readBoundary(trusted, journal, repositoryPath, fetchedTip);
  if (boundary.findings.length > 0) return { outcome: 'recovery-required', findings: boundary.findings, receiptDisposition: 'invalidate' };
  if (journal.canonicalJson(boundary.state) !== journal.canonicalJson(request.currentState)) {
    return { outcome: 'rejected', findings: ['current state does not match authoritative lifecycle state'], receiptDisposition: 'invalidate' };
  }
  const predecessor = boundary.events.at(-1)?.event ?? null;
  if (journal.canonicalJson(predecessor) !== journal.canonicalJson(request.predecessor)) {
    return { outcome: 'rejected', findings: ['predecessor does not match authoritative Journal tip'], receiptDisposition: 'invalidate' };
  }
  if (request.event.sequence !== boundary.events.length + 1) {
    return { outcome: 'rejected', findings: ['event sequence does not extend authoritative Journal'], receiptDisposition: 'invalidate' };
  }
  const candidate = buildCandidate(trusted, journal, repositoryPath, fetchedTip, request.nextState, request.event);
  const pushed = pushCandidate(trusted, repositoryPath, remote, lifecycleRef, fetchedTip, candidate);
  if (pushed.outcome === 'rejected-before-cas') {
    return {
      outcome: 'retryable-pre-cas', retry: true, candidateSha: candidate.sha,
      authoritativeTip: pushed.authoritativeTip, receiptDisposition: 'retain',
    };
  }
  if (pushed.outcome !== 'accepted') {
    return { outcome: pushed.outcome, authoritativeTip: pushed.authoritativeTip, receiptDisposition: 'invalidate' };
  }
  const readback = readBoundary(trusted, journal, repositoryPath, candidate.sha);
  if (readback.findings.length > 0
    || journal.canonicalJson(readback.state) !== journal.canonicalJson(request.nextState)
    || journal.canonicalJson(readback.events.at(-1)?.event) !== journal.canonicalJson(request.event)) {
    return { outcome: 'recovery-required', candidateSha: candidate.sha, findings: ['accepted commit read-back mismatch'] };
  }
  const receipt = receiptFor(trusted, journal, repositoryPath, lifecycleRef, candidate.sha, request.event);
  try {
    const projections = captureProjections({ projectionSink, journal, state: request.nextState, event: request.event, receipt });
    return {
      outcome: 'accepted', candidateSha: candidate.sha, authoritativeTip: candidate.sha,
      receipt, projections, receiptDisposition: 'consume', closureBlocked: false,
    };
  } catch {
    return {
      outcome: 'accepted-projection-failed', candidateSha: candidate.sha, authoritativeTip: candidate.sha,
      receipt, receiptDisposition: 'consume', closureBlocked: true,
      findings: ['Projection capture failed after the accepted lifecycle commit'],
    };
  }
}

export function repairKeyFor({
  jobOrder, runFuid, failureIdentity, exactTip, affectedRefsDigest, authorizedScopeDigest,
} = {}) {
  return sha256(stableJson({
    jobOrder,
    runFuid,
    failureIdentity,
    exactTip,
    affectedRefsDigest,
    authorizedScopeDigest,
  }));
}

function planRepair(currentState, input) {
  if (!['blocked', 'recovery-required'].includes(currentState?.status)) {
    return { outcome: 'rejected', findings: ['repair requires blocked or recovery-required state'] };
  }
  if (input?.protectedScope === true) return { outcome: 'rejected', findings: ['protected scope is never automatically repaired'] };
  const repairKey = repairKeyFor(input);
  if (currentState.repair?.repairKey === repairKey
    && currentState.repair?.repairAttempt >= currentState.repair?.repairBudget) {
    return { outcome: 'repair-exhausted', repairKey };
  }
  return {
    outcome: 'ready',
    nextState: {
      ...currentState,
      repair: { repairKey, repairAttempt: 1, repairBudget: 1 },
    },
  };
}

const CHILD_RECEIPT_FIELDS = [
  'childId', 'childEventId', 'childLifecycleCommitId', 'revision', 'runFuid', 'disposition',
  'artifactDigest', 'postflightDigest', 'recoveryRef', 'recoverySha', 'payloadDigest',
];

function validChildReceipt(receipt, requiredChildIds) {
  return receipt && typeof receipt === 'object' && !Array.isArray(receipt)
    && CHILD_RECEIPT_FIELDS.every((field) => typeof receipt[field] === 'string')
    && requiredChildIds.includes(receipt.childId)
    && SHA40.test(receipt.childLifecycleCommitId)
    && SHA40.test(receipt.recoverySha)
    && ['artifactDigest', 'postflightDigest', 'payloadDigest'].every((field) => SHA256.test(receipt[field]));
}

function validChildReceiptMap(childReceipts, requiredChildIds) {
  if (!childReceipts || typeof childReceipts !== 'object' || Array.isArray(childReceipts)
    || Object.getPrototypeOf(childReceipts) !== Object.prototype) return false;
  const entries = Object.entries(childReceipts);
  const childIds = new Set();
  const lifecycleCommitIds = new Set();
  for (const [eventId, receipt] of entries) {
    if (!validChildReceipt(receipt, requiredChildIds) || eventId !== receipt.childEventId
      || childIds.has(receipt.childId)
      || lifecycleCommitIds.has(receipt.childLifecycleCommitId)) return false;
    childIds.add(receipt.childId);
    lifecycleCommitIds.add(receipt.childLifecycleCommitId);
  }
  return true;
}

export function reconcileParentState(parentState, childReceipt) {
  if (parentState?.schemaVersion !== '2.0' || parentState?.kind !== 'parent'
    || !Array.isArray(parentState.requiredChildIds)
    || !validChildReceiptMap(parentState.childReceipts, parentState.requiredChildIds)) {
    return { outcome: 'recovery-required', findings: ['valid parent state is required'] };
  }
  if (!validChildReceipt(childReceipt, parentState.requiredChildIds)) {
    return { outcome: 'recovery-required', findings: ['child terminal receipt is invalid or undeclared'] };
  }
  const priorForChild = Object.values(parentState.childReceipts)
    .find((receipt) => receipt.childId === childReceipt.childId);
  if (priorForChild) {
    return stableJson(priorForChild) === stableJson(childReceipt)
      ? { outcome: 'idempotent', state: parentState }
      : { outcome: 'recovery-required', findings: ['child identity was reused with conflicting receipt'] };
  }
  const priorForLifecycleCommit = Object.values(parentState.childReceipts)
    .find((receipt) => receipt.childLifecycleCommitId === childReceipt.childLifecycleCommitId);
  if (priorForLifecycleCommit) {
    return stableJson(priorForLifecycleCommit) === stableJson(childReceipt)
      ? { outcome: 'idempotent', state: parentState }
      : { outcome: 'recovery-required', findings: ['child lifecycle commit was reused with conflicting receipt'] };
  }
  const existing = parentState.childReceipts[childReceipt.childEventId];
  if (existing) {
    return stableJson(existing) === stableJson(childReceipt)
      ? { outcome: 'idempotent', state: parentState }
      : { outcome: 'recovery-required', findings: ['child event identity was reused with conflicting receipt'] };
  }
  const childReceipts = { ...parentState.childReceipts, [childReceipt.childEventId]: snapshot(childReceipt) };
  const byChild = new Map(Object.values(childReceipts).map((receipt) => [receipt.childId, receipt]));
  const values = [...byChild.values()];
  let status = 'active';
  if (values.some((receipt) => receipt.disposition === 'recovery-required')) status = 'recovery-required';
  else if (values.some((receipt) => receipt.disposition === 'delivered-unclosed')) status = 'partial';
  else if (parentState.requiredChildIds.every((childId) => byChild.get(childId)?.disposition === 'closed-complete')) status = 'closing';
  else if (values.length === 0) status = 'planned';
  else if (values.every((receipt) => receipt.disposition === 'blocked')) status = 'blocked';
  return { outcome: 'updated', state: freeze({ ...parentState, status, childReceipts }) };
}

export function projectLifecycle({ state, event, lifecycleCommitId } = {}) {
  if (!SHA40.test(lifecycleCommitId ?? '')) throw new Error('exact lifecycle commit is required');
  if (state?.schemaVersion !== '2.0' || event?.schemaVersion !== '2.0') throw new Error('schema-v2 state and event are required');
  return freeze({
    schemaVersion: '1.0',
    owner: 'Orchestration',
    surface: 'lifecycle',
    freshness: 'fresh',
    status: state.status,
    eventType: event.type,
    sourceDigest: sha256(stableJson({ state, event, lifecycleCommitId })),
  });
}

export function createLifecycleEngine(configuration) {
  const bound = bindConfiguration(configuration);
  return freeze({
    clearanceFor: (request) => evaluateRequestClearance(request, bound.trusted),
    validate: (request) => validateRequest(request, bound.trusted, bound.journal, bound.findings),
    execute: (input) => execute({
      trusted: bound.trusted,
      journal: bound.journal,
      projectionSink: bound.projectionSink,
      configurationFindings: bound.findings,
    }, input),
    planRepair,
  });
}
