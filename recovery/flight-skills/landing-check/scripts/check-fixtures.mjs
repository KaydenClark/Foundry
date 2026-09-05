#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateLandingCheck } from './landing-check.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const landingCheckScript = path.join(scriptDir, 'landing-check.mjs');
const skillPath = path.join(scriptDir, '..', 'SKILL.md');
const candidateBranch = 'codex/example-landing-check';
const candidateRefName = `refs/heads/${candidateBranch}`;
const targetRefName = 'refs/heads/integration';
const remoteUrl = 'https://example.invalid/shared-skills.git';
const unavailable = Object.fromEntries([
  'exactOrderReceipt', 'lifecycleTip', 'claimFuid', 'runFuid', 'handoffFuid', 'handoffDigest',
].map((field) => [field, 'bootstrap-unavailable']));
const allowedPaths = [
  'landing-check/SKILL.md',
  'landing-check/scripts/landing-check.mjs',
  'landing-check/scripts/check-fixtures.mjs',
];

function git(cwd, ...args) {
  return execFileSync('/usr/bin/git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0',
    },
  }).trim();
}

function write(repo, relativePath, contents) {
  const absolute = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents);
}

function setupRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-landing-check-'));
  const remote = path.join(root, 'remote.git');
  const author = path.join(root, 'author');
  const review = path.join(root, 'review');
  git(root, 'init', '--bare', remote);
  git(root, 'clone', remote, author);
  git(author, 'config', 'user.name', 'Fixture Engineer');
  git(author, 'config', 'user.email', 'engineer@example.invalid');
  write(author, '.gitignore', '.system/\n');
  write(author, 'landing-check/SKILL.md', 'base\n');
  git(author, 'add', '.gitignore', 'landing-check/SKILL.md');
  git(author, 'commit', '-m', 'fixture: base');
  git(author, 'branch', '-M', 'integration');
  git(author, 'push', 'origin', 'integration:integration');
  const baseSha = git(author, 'rev-parse', 'HEAD');
  git(remote, 'symbolic-ref', 'HEAD', targetRefName);
  git(author, 'switch', '--no-track', '-c', candidateBranch);
  write(author, 'landing-check/SKILL.md', 'candidate\n');
  write(author, 'landing-check/scripts/landing-check.mjs', 'candidate helper\n');
  write(author, 'landing-check/scripts/check-fixtures.mjs', 'candidate checks\n');
  git(author, 'add', ...allowedPaths);
  git(author, 'commit', '-m', 'fixture: candidate');
  const candidateSha = git(author, 'rev-parse', 'HEAD');
  git(author, 'push', 'origin', `HEAD:${candidateRefName}`);
  git(root, 'clone', '--no-local', remote, review);
  git(review, 'fetch', 'origin', candidateRefName);
  git(review, 'checkout', '--detach', candidateSha);

  const handoff = {
    stage: 'bootstrap-in-flight',
    canonBinding: { exactJobOrder: 'JO-ABC123/R2', spec: 'SPEC-ABC123', ticket: 'TICKET-ABC123' },
    actor: 'engineer-alpha', role: 'engineer',
    writerLane: { worktree: path.join(root, 'writer'), branch: candidateBranch },
    repository: { identity: 'shared-skills', recoveryRemote: { name: 'origin', url: remoteUrl } },
    allowedPaths: [...allowedPaths],
    exclusions: ['protected targets', 'credentials', 'private payloads'],
    proofExpectations: ['focused-red-green', 'privacy', 'independent-fixed-sha-review'],
    checkedTarget: { ref: targetRefName, sha: baseSha },
    candidateRef: { ref: candidateRefName, sha: candidateSha, exists: true },
    changedPaths: [...allowedPaths],
    tests: [{ name: 'focused-red-green', status: 'pass' }, { name: 'layout-and-privacy', status: 'pass' }],
    unavailable: structuredClone(unavailable),
    independentReviewRequired: true, landingAuthorized: false, mergeAuthorized: false,
    disclaimer: 'This is an Intent handoff, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.',
  };
  const reviewEvidence = {
    reviewer: 'auditor-beta', baseSha, candidateSha,
    candidateRef: candidateRefName, targetRef: targetRefName, outcome: 'pass',
    checks: [{ name: 'fixed-sha-review', status: 'pass' }, { name: 'privacy-and-exclusions', status: 'pass' }],
    findings: [], privacyChecked: true, privacyFindings: [], exclusionViolations: [],
  };
  return { root, remote, author, review, baseSha, candidateSha, handoff, reviewEvidence };
}

function remoteAdapter(state, { unreadableCandidate = false } = {}) {
  return {
    validate(_repository, remote) {
      return { ok: remote.name === 'origin' && remote.url === remoteUrl, issues: [], rawUrl: remoteUrl, effectiveUrl: remoteUrl };
    },
    lookup(_repository, _remote, ref) {
      if (unreadableCandidate && ref === candidateRefName) return { ok: false, sha: null, detail: 'candidate ref unreadable' };
      try { return { ok: true, sha: git(state.remote, 'rev-parse', ref), detail: '' }; }
      catch (error) { return { ok: false, sha: null, detail: String(error.stderr || error.message).trim() }; }
    },
  };
}

function evaluate(state, changes = {}, adapterOptions = {}) {
  return evaluateLandingCheck({
    handoff: Object.hasOwn(changes, 'handoff') ? changes.handoff : state.handoff,
    reviewer: Object.hasOwn(changes, 'reviewer') ? changes.reviewer : 'auditor-beta',
    reviewRepository: state.review,
    reviewEvidence: Object.hasOwn(changes, 'reviewEvidence') ? changes.reviewEvidence : state.reviewEvidence,
    remoteAdapter: remoteAdapter(state, adapterOptions),
  });
}

function snapshot(state) {
  return {
    head: git(state.review, 'rev-parse', 'HEAD'),
    status: git(state.review, 'status', '--porcelain=v1', '--untracked-files=all'),
    tree: git(state.review, 'rev-parse', 'HEAD^{tree}'),
    candidateRef: git(state.remote, 'rev-parse', candidateRefName),
    targetRef: git(state.remote, 'rev-parse', targetRefName),
  };
}

function assertNonAuthorizing(result) {
  assert.equal(result.landingAuthorized, false);
  assert.equal(result.mergeAuthorized, false);
  assert.match(result.disclaimer, /not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure/);
}

test('live landing-check contract', async (t) => {
  await t.test('accepts one exact remotely recovered candidate without mutation', () => {
    const state = setupRepository(); const before = snapshot(state); const result = evaluate(state);
    assert.deepEqual(snapshot(state), before);
    assert.deepEqual({ code: result.exitCode, case: result.case, outcome: result.outcome, next: result.next },
      { code: 0, case: 'accepted', outcome: 'accepted', next: '/land' });
    assert.deepEqual(result.evidence.changedPaths, [...allowedPaths].sort());
    assert.deepEqual(result.evidence.namedProof, ['focused-red-green', 'layout-and-privacy', 'fixed-sha-review', 'privacy-and-exclusions']);
    assertNonAuthorizing(result);
  });

  await t.test('invalidates every changed candidate ref', () => {
    const state = setupRepository();
    write(state.author, 'landing-check/SKILL.md', 'amended candidate\n');
    git(state.author, 'add', 'landing-check/SKILL.md'); git(state.author, 'commit', '-m', 'fixture: amend candidate');
    git(state.author, 'push', 'origin', `HEAD:${candidateRefName}`);
    const result = evaluate(state);
    assert.deepEqual({ case: result.case, outcome: result.outcome, next: result.next },
      { case: 'stale-candidate', outcome: 'blocked', next: '/in-flight' });
    assert.match(result.invalidationReason, /candidate ref moved/i); assertNonAuthorizing(result);
  });

  await t.test('blocks a moved target and requires a new entry comparison', () => {
    const state = setupRepository(); git(state.author, 'switch', 'integration');
    write(state.author, 'target.txt', 'moved\n'); git(state.author, 'add', 'target.txt');
    git(state.author, 'commit', '-m', 'fixture: move target'); git(state.author, 'push', 'origin', 'integration:integration');
    const result = evaluate(state);
    assert.deepEqual({ case: result.case, outcome: result.outcome, next: result.next },
      { case: 'stale-target', outcome: 'blocked', next: '/preflight' }); assertNonAuthorizing(result);
  });

  await t.test('returns a semantically rejected candidate to In-flight', () => {
    const state = setupRepository();
    const reviewEvidence = { ...state.reviewEvidence, outcome: 'reject', findings: [{
      severity: 'P1', path: 'landing-check/SKILL.md', line: 1, control: 'review contract',
      impact: 'The candidate can accept an unverified comparison.', correction: 'Fail closed and issue a new candidate SHA.',
    }] };
    const result = evaluate(state, { reviewEvidence });
    assert.deepEqual({ case: result.case, outcome: result.outcome, next: result.next },
      { case: 'review-rejected', outcome: 'rejected', next: '/in-flight' });
    assert.equal(result.evidence.findings.length, 1); assertNonAuthorizing(result);
  });

  await t.test('blocks missing or failing named proof', () => {
    const state = setupRepository();
    assert.equal(evaluate(state, { handoff: { ...state.handoff, tests: [] } }).case, 'missing-proof');
    assert.equal(evaluate(state, { reviewEvidence: null }).case, 'missing-proof');
    const evidence = structuredClone(state.reviewEvidence); evidence.checks[0].status = 'fail';
    const result = evaluate(state, { reviewEvidence: evidence });
    assert.equal(result.case, 'missing-proof'); assert.equal(result.outcome, 'blocked'); assertNonAuthorizing(result);
  });

  await t.test('blocks actual or declared path growth by exact path equality', () => {
    const state = setupRepository(); write(state.author, 'outside.txt', 'scope growth\n');
    git(state.author, 'add', 'outside.txt'); git(state.author, 'commit', '-m', 'fixture: scope growth');
    const grownSha = git(state.author, 'rev-parse', 'HEAD'); git(state.author, 'push', 'origin', `HEAD:${candidateRefName}`);
    git(state.review, 'fetch', 'origin', candidateRefName); git(state.review, 'checkout', '--detach', grownSha);
    const handoff = structuredClone(state.handoff); handoff.candidateRef.sha = grownSha; handoff.changedPaths.push('outside.txt');
    const result = evaluate(state, { handoff, reviewEvidence: { ...state.reviewEvidence, candidateSha: grownSha } });
    assert.deepEqual({ case: result.case, outcome: result.outcome, next: result.next },
      { case: 'scope-growth', outcome: 'blocked', next: '/preflight' }); assertNonAuthorizing(result);
  });

  await t.test('blocks privacy and exclusion violations', () => {
    const state = setupRepository();
    for (const mutate of [(x) => { x.privacyChecked = false; }, (x) => { x.privacyFindings.push('private binding exposed'); }, (x) => { x.exclusionViolations.push('protected target touched'); }]) {
      const evidence = structuredClone(state.reviewEvidence); mutate(evidence); const result = evaluate(state, { reviewEvidence: evidence });
      assert.equal(result.case, 'privacy-or-exclusion'); assert.equal(result.outcome, 'blocked'); assertNonAuthorizing(result);
    }
  });

  await t.test('blocks a dirty review lane and makes no mutation', () => {
    const state = setupRepository(); write(state.review, 'review-note.txt', 'preserve me\n'); const before = snapshot(state);
    const result = evaluate(state); assert.equal(result.case, 'dirty-review-lane'); assert.deepEqual(snapshot(state), before);
    assert.equal(fs.readFileSync(path.join(state.review, 'review-note.txt'), 'utf8'), 'preserve me\n'); assertNonAuthorizing(result);
  });

  await t.test('blocks ignored review-lane payload and preserves it', () => {
    const state = setupRepository(); write(state.review, '.system/private.bin', 'ignored private payload\n');
    const before = snapshot(state); const result = evaluate(state);
    assert.equal(result.case, 'dirty-review-lane'); assert.equal(result.outcome, 'blocked');
    assert.deepEqual(snapshot(state), before);
    assert.equal(fs.readFileSync(path.join(state.review, '.system/private.bin'), 'utf8'), 'ignored private payload\n');
    assertNonAuthorizing(result);
  });

  await t.test('classifies duplicate and recovery ambiguity before later cases', () => {
    const state = setupRepository();
    const duplicate = evaluate(state, { handoff: [state.handoff, state.handoff], reviewEvidence: [state.reviewEvidence] });
    assert.deepEqual({ case: duplicate.case, outcome: duplicate.outcome, next: duplicate.next },
      { case: 'duplicate-ambiguous', outcome: 'recovery-required', next: 'none' });
    const unreadable = evaluate(state, {}, { unreadableCandidate: true });
    assert.deepEqual({ case: unreadable.case, outcome: unreadable.outcome, next: unreadable.next },
      { case: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none' }); assertNonAuthorizing(unreadable);

    const unreadableBeforeDuplicate = evaluateLandingCheck({
      handoff: [state.handoff, state.handoff], reviewer: 'auditor-beta',
      reviewRepository: path.join(state.root, 'absent-review-root'),
      reviewEvidence: [state.reviewEvidence, state.reviewEvidence], remoteAdapter: remoteAdapter(state),
    });
    assert.equal(unreadableBeforeDuplicate.case, 'recovery-ambiguous');
  });

  await t.test('uses one explicit scrubbed read-only authentication channel', async () => {
    const state = setupRepository(); const module = await import('./landing-check.mjs');
    assert.equal(typeof module.createProductionRemoteAdapter, 'function');
    const calls = []; const secret = 'Authorization: Basic TEST-SECRET-HEADER';
    const trustedTempRoot = process.platform === 'darwin' ? '/private/tmp' : '/tmp';
    const adapter = module.createProductionRemoteAdapter({
      authHeader: secret,
      gitRunner(_repository, args, options = {}) {
        calls.push({ args: [...args], env: { ...(options.env || {}) } });
        if (args.includes('--get-regexp')) {
          return options.env?.TMPDIR === trustedTempRoot
            ? { ok: false, output: '' }
            : { ok: false, output: 'confstr() failed: DARWIN_USER_TEMP_DIR' };
        }
        if (args.includes('config')) return { ok: true, output: remoteUrl };
        if (args.includes('get-url')) return { ok: true, output: remoteUrl };
        const ref = args.at(-1);
        return { ok: true, output: `${ref === candidateRefName ? state.candidateSha : state.baseSha}\t${ref}` };
      },
    });
    const result = evaluateLandingCheck({
      handoff: state.handoff, reviewer: 'auditor-beta', reviewRepository: state.review,
      reviewEvidence: state.reviewEvidence, remoteAdapter: adapter,
    });
    assert.equal(result.case, 'accepted');
    assert.ok(calls.every((call) => call.env.TMPDIR === trustedTempRoot));
    assert.ok(calls.every((call) => !Object.hasOwn(call.env, 'TMP') && !Object.hasOwn(call.env, 'TEMP')));
    const networkCalls = calls.filter((call) => call.args.includes('ls-remote'));
    assert.equal(networkCalls.length, 4);
    assert.ok(networkCalls.every((call) => call.args.some((arg) => arg.includes('--config-env=http.'))));
    assert.ok(networkCalls.every((call) => call.args.includes('credential.helper=')));
    assert.ok(networkCalls.every((call) => call.args.includes('http.proxy=')));
    assert.ok(networkCalls.every((call) => call.args.includes('http.sslVerify=true')));
    assert.ok(networkCalls.every((call) => call.args.includes('protocol.file.allow=never')));
    assert.ok(networkCalls.every((call) => call.env.LANDING_CHECK_GIT_AUTH_HEADER === secret));
    assert.ok(calls.every((call) => !call.args.some((arg) => arg.includes('TEST-SECRET-HEADER'))));

    const failedAdapter = module.createProductionRemoteAdapter({
      authHeader: secret,
      gitRunner() { return { ok: false, output: `fatal: ${secret} /private/input/path` }; },
    });
    const failure = failedAdapter.lookup(state.review, state.handoff.repository.recoveryRemote, candidateRefName);
    assert.equal(failure.ok, false); assert.equal(JSON.stringify(failure).includes('TEST-SECRET-HEADER'), false);
    assert.equal(JSON.stringify(failure).includes('/private/input/path'), false);

    const unsafeAdapter = module.createProductionRemoteAdapter({
      authHeader: secret,
      gitRunner(_repository, args) {
        if (args.includes('--get-regexp')) return { ok: true, output: 'credential.helper' };
        return { ok: true, output: remoteUrl };
      },
    });
    const unsafe = unsafeAdapter.validate(state.review, state.handoff.repository.recoveryRemote);
    assert.equal(unsafe.ok, false); assert.ok(unsafe.issues.some((entry) => entry.code === 'ambient-git-config'));

    const productionAdapter = module.createProductionRemoteAdapter({ authHeader: secret });
    const configuredLocalUrl = git(state.review, 'config', '--get', 'remote.origin.url');
    const productionNoMatch = productionAdapter.validate(state.review, { name: 'origin', url: configuredLocalUrl });
    assert.equal(productionNoMatch.ok, true);
    assert.equal(productionNoMatch.issues.length, 0);
  });

  await t.test('rejects stale review evidence and self-review', () => {
    const state = setupRepository();
    assert.equal(evaluate(state, { reviewEvidence: { ...state.reviewEvidence, candidateSha: 'd'.repeat(40) } }).case, 'mismatched-review-evidence');
    const result = evaluate(state, { reviewer: state.handoff.actor });
    assert.equal(result.case, 'reviewer-not-independent'); assert.equal(result.outcome, 'blocked'); assertNonAuthorizing(result);
  });

  await t.test('exposes a fail-closed direct CLI without leaking local paths', () => {
    const state = setupRepository(); const handoffPath = path.join(state.root, 'handoff.json'); const evidencePath = path.join(state.root, 'review.json');
    fs.writeFileSync(handoffPath, `${JSON.stringify(state.handoff, null, 2)}\n`); fs.writeFileSync(evidencePath, `${JSON.stringify(state.reviewEvidence, null, 2)}\n`);
    const invoked = spawnSync(process.execPath, [landingCheckScript, '--handoff', handoffPath, '--reviewer', 'auditor-beta', '--review-repository', state.review, '--review-evidence', evidencePath], { encoding: 'utf8' });
    assert.equal(invoked.status, 1); const result = JSON.parse(invoked.stdout); assert.equal(result.outcome, 'blocked');
    assert.equal(invoked.stdout.includes(state.review), false); assertNonAuthorizing(result);
  });

  await t.test('maps repeated CLI options to duplicate ambiguity before reading files', () => {
    const state = setupRepository(); const first = path.join(state.root, 'first-record.json'); const second = path.join(state.root, 'second-record.json');
    fs.writeFileSync(first, '{}\n'); fs.writeFileSync(second, '{}\n');
    const invoked = spawnSync(process.execPath, [landingCheckScript,
      '--handoff', first, '--handoff', second, '--reviewer', 'auditor-beta',
      '--review-repository', state.review, '--review-evidence', first,
    ], { encoding: 'utf8' });
    assert.equal(invoked.status, 1); const result = JSON.parse(invoked.stdout);
    assert.equal(result.case, 'duplicate-ambiguous'); assert.equal(result.outcome, 'recovery-required');
    assert.equal(invoked.stdout.includes(first), false); assert.equal(invoked.stdout.includes(second), false); assertNonAuthorizing(result);
  });

  await t.test('maps every startup failure to sanitized structured non-authorizing output', () => {
    const state = setupRepository(); const malformed = path.join(state.root, 'private-malformed.json');
    const absent = path.join(state.root, 'private-absent.json'); fs.writeFileSync(malformed, '{not-json\n');
    const cases = [
      ['--handoff', absent, '--reviewer', 'auditor-beta', '--review-repository', state.review, '--review-evidence', malformed],
      ['--handoff', malformed, '--reviewer', 'auditor-beta', '--review-repository', state.review, '--review-evidence', malformed],
      ['--unknown-private-option', absent],
    ];
    for (const args of cases) {
      const invoked = spawnSync(process.execPath, [landingCheckScript, ...args], { encoding: 'utf8' });
      assert.equal(invoked.status, 1); assert.equal(invoked.stderr, '');
      const result = JSON.parse(invoked.stdout); assert.ok(['blocked', 'recovery-required'].includes(result.outcome));
      assert.equal(invoked.stdout.includes(state.root), false); assertNonAuthorizing(result);
    }
  });

  await t.test('locks combined-fault disposition priority', () => {
    const state = setupRepository();
    const scope = structuredClone(state.handoff); scope.changedPaths.push('outside.txt');
    const scopeBeforeProof = evaluate(state, { handoff: scope, reviewEvidence: null });
    assert.equal(scopeBeforeProof.case, 'scope-growth');

    const privacyAndProof = structuredClone(state.reviewEvidence);
    privacyAndProof.privacyChecked = false; privacyAndProof.checks[0].status = 'fail';
    assert.equal(evaluate(state, { reviewEvidence: privacyAndProof }).case, 'privacy-or-exclusion');

    const authorityAndScope = evaluate(state, { handoff: scope, reviewer: state.handoff.actor, reviewEvidence: null });
    assert.equal(authorityAndScope.case, 'reviewer-not-independent');

    const duplicate = evaluateLandingCheck({
      handoff: [scope, scope], reviewer: state.handoff.actor, reviewRepository: state.review,
      reviewEvidence: null, remoteAdapter: remoteAdapter(state),
    });
    assert.equal(duplicate.case, 'duplicate-ambiguous');

    write(state.author, 'landing-check/SKILL.md', 'moved candidate\n');
    git(state.author, 'add', 'landing-check/SKILL.md'); git(state.author, 'commit', '-m', 'fixture: move candidate for priority');
    git(state.author, 'push', 'origin', `HEAD:${candidateRefName}`);
    const mismatchedPaths = structuredClone(state.handoff); mismatchedPaths.changedPaths = [allowedPaths[0]];
    assert.equal(evaluate(state, { handoff: mismatchedPaths }).case, 'stale-candidate');
  });

  await t.test('documents the live contract and removes fixture-only authority', () => {
    const skill = fs.readFileSync(skillPath, 'utf8'); assert.match(skill, /stage:\s*bootstrap-in-flight/);
    assert.match(skill, /exact string equality/i); assert.match(skill, /accepted, rejected, blocked, or recovery-required/i);
    assert.match(skill, /landingAuthorized:\s*false/); assert.match(skill, /mergeAuthorized:\s*false/);
    assert.match(skill, /Candidate or target movement invalidates/i); assert.doesNotMatch(skill, /fixtureOnly:\s*true/); assert.doesNotMatch(skill, /JO-00006W/);
    assert.match(skill, /LANDING_CHECK_GIT_AUTH_HEADER/); assert.match(skill, /tracked, untracked, and ignored/i);
    assert.match(skill, /Repeated bindings are duplicate\s+ambiguity/i); assert.match(skill, /sanitized\s+structured output/i);
    assert.match(skill, /fixed verified temp root/i); assert.match(skill, /never inherits caller `TMPDIR`, `TMP`, or `TEMP`/i);
    for (const privateBinding of [
      new RegExp(`/${'Users'}/`), /\bS-\d{3}\b/, /\bTK-\d{3}\b/, /\bJO-\d{5}[A-Z]\b/,
      /\b[a-f0-9]{40}\b/i, /\b01a[0-9a-f-]{30,}\b/i,
    ]) assert.doesNotMatch(skill, privateBinding);
  });
});
