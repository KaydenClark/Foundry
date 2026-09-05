#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GIT = '/usr/bin/git';
const FULL_SHA = /^[0-9a-f]{40}$/;
const BRANCH_REF = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const BRANCH = /^codex\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const JOB_ORDER = /^JO-[A-Z0-9]{6}\/R[1-9][0-9]*$/;
const UNAVAILABLE_FIELDS = [
  'exactOrderReceipt',
  'lifecycleTip',
  'claimFuid',
  'runFuid',
  'handoffFuid',
  'handoffDigest',
];
const INTENT_DISCLAIMER = 'This is an Intent handoff, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.';
const RESULT_DISCLAIMER = 'This is independent review evidence, not a Claim, Run, lifecycle receipt, acceptance, landing authority, merge authority, or closure.';
const AUTH_HEADER_ENV = 'LANDING_CHECK_GIT_AUTH_HEADER';
const TRUSTED_TEMP_CANDIDATE = process.platform === 'darwin' ? '/private/tmp' : '/tmp';

function resolveTrustedTempRoot() {
  try {
    const entry = fs.lstatSync(TRUSTED_TEMP_CANDIDATE);
    const resolved = fs.realpathSync(TRUSTED_TEMP_CANDIDATE);
    const status = fs.statSync(resolved);
    const sharedWritable = (status.mode & 0o022) !== 0;
    const sticky = (status.mode & 0o1000) !== 0;
    if (entry.isSymbolicLink()
      || resolved !== TRUSTED_TEMP_CANDIDATE
      || !status.isDirectory()
      || status.uid !== 0
      || (sharedWritable && !sticky)) return null;
    return resolved;
  } catch {
    return null;
  }
}

const TRUSTED_TEMP_ROOT = resolveTrustedTempRoot();
const CHECKS = [
  'single-in-flight-handoff',
  'handoff-schema-and-authority-correlation',
  'independent-reviewer',
  'clean-detached-review-lane',
  'fixed-candidate-and-base',
  'remote-candidate-recovery',
  'remote-target-freshness',
  'exact-path-scope',
  'named-proof',
  'privacy-and-exclusions',
  'review-evidence-binding',
  'no-mutation-read-back',
];

function git(repository, args, options = {}) {
  if (!TRUSTED_TEMP_ROOT) {
    return { ok: false, output: 'trusted temporary root unavailable' };
  }
  try {
    return {
      ok: true,
      output: execFileSync(GIT, args, {
        cwd: repository,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
          GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
          GIT_CEILING_DIRECTORIES: path.dirname(repository),
          ...(options.env || {}),
          TMPDIR: TRUSTED_TEMP_ROOT,
        },
      }).trim(),
    };
  } catch (error) {
    const stderr = error?.stderr == null ? null : String(error.stderr).trim();
    const stdout = error?.stdout == null ? null : String(error.stdout).trim();
    const output = stderr || stdout || (stderr !== null || stdout !== null ? '' : 'git process failed');
    return { ok: false, output };
  }
}

function issue(code, detail) {
  return { code, detail };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBoundString(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && value !== 'none'
    && !/<[^>]*>/.test(value);
}

function isFullSha(value) {
  return typeof value === 'string' && FULL_SHA.test(value);
}

function isBranchRef(value) {
  return typeof value === 'string'
    && BRANCH_REF.test(value)
    && !value.includes('..')
    && !value.includes('//')
    && !value.endsWith('/')
    && value.split('/').every((part) => !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));
}

function isLiteralPath(value) {
  if (!isBoundString(value) || path.isAbsolute(value) || /[*?\[\]]/.test(value) || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

function validHttpsUrl(value) {
  try {
    if (typeof value !== 'string') return false;
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === '';
  } catch {
    return false;
  }
}

function validAuthHeader(value) {
  return typeof value === 'string'
    && value.length <= 8192
    && !/[\r\n\0]/.test(value)
    && /^Authorization:\s+(?:Basic|Bearer)\s+\S+$/i.test(value);
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function validNamedChecks(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => isBoundString(entry?.name) && entry.status === 'pass')
    && new Set(value.map((entry) => entry.name)).size === value.length;
}

function validFinding(value) {
  return isObject(value)
    && ['P0', 'P1', 'P2', 'P3'].includes(value.severity)
    && isLiteralPath(value.path)
    && Number.isInteger(value.line)
    && value.line > 0
    && ['control', 'impact', 'correction'].every((field) => isBoundString(value[field]));
}

function validateHandoff(handoff) {
  const problems = [];
  if (!isObject(handoff)) return [issue('invalid-in-flight-handoff', 'input must be exactly one object')];
  if (handoff.stage !== 'bootstrap-in-flight') problems.push(issue('invalid-stage', 'stage must equal bootstrap-in-flight'));
  if (!isObject(handoff.canonBinding)
    || !JOB_ORDER.test(handoff.canonBinding.exactJobOrder || '')
    || !isBoundString(handoff.canonBinding.spec)
    || !isBoundString(handoff.canonBinding.ticket)) {
    problems.push(issue('invalid-canon-binding', 'exact Job Order, Spec, and ticket must be bound'));
  }
  if (!isBoundString(handoff.actor) || handoff.role !== 'engineer') {
    problems.push(issue('invalid-actor-binding', 'one Engineer actor is required'));
  }
  if (!isObject(handoff.writerLane)
    || !path.isAbsolute(handoff.writerLane.worktree || '')
    || !BRANCH.test(handoff.writerLane.branch || '')) {
    problems.push(issue('invalid-writer-lane', 'writer lane must be one absolute worktree and codex branch'));
  }
  const remote = handoff.repository?.recoveryRemote;
  if (!isObject(handoff.repository)
    || !isBoundString(handoff.repository.identity)
    || !isObject(remote)
    || !REMOTE_NAME.test(remote?.name || '')
    || !validHttpsUrl(remote?.url)) {
    problems.push(issue('invalid-repository-binding', 'repository identity and explicit HTTPS recovery remote are required'));
  }
  if (!isObject(handoff.checkedTarget)
    || handoff.checkedTarget.ref !== 'refs/heads/integration'
    || !isFullSha(handoff.checkedTarget.sha)) {
    problems.push(issue('invalid-checked-target', 'checked target must be a full integration ref and SHA'));
  }
  if (!isObject(handoff.candidateRef)
    || !isBranchRef(handoff.candidateRef.ref)
    || !isFullSha(handoff.candidateRef.sha)
    || handoff.candidateRef.exists !== true
    || handoff.candidateRef.ref !== `refs/heads/${handoff.writerLane?.branch || ''}`) {
    problems.push(issue('invalid-candidate-binding', 'candidate ref must be the exact existing writer recovery ref and full SHA'));
  }
  for (const [field, values] of [
    ['allowedPaths', handoff.allowedPaths],
    ['changedPaths', handoff.changedPaths],
  ]) {
    if (!Array.isArray(values)
      || values.length === 0
      || !values.every(isLiteralPath)
      || new Set(values).size !== values.length) {
      problems.push(issue(`invalid-${field}`, `${field} must contain unique literal repository-relative paths`));
    }
  }
  if (Array.isArray(handoff.allowedPaths)
    && Array.isArray(handoff.changedPaths)
    && handoff.changedPaths.some((changedPath) => !handoff.allowedPaths.includes(changedPath))) {
    problems.push(issue('scope-growth', 'changed paths exceed the exact allowed path set'));
  }
  for (const [field, values] of [
    ['exclusions', handoff.exclusions],
    ['proofExpectations', handoff.proofExpectations],
  ]) {
    if (!Array.isArray(values) || values.length === 0 || !values.every(isBoundString)) {
      problems.push(issue(`invalid-${field}`, `${field} must be a nonempty bound string array`));
    }
  }
  if (!validNamedChecks(handoff.tests)) problems.push(issue('missing-proof', 'In-flight must name passing candidate proof'));
  if (!isObject(handoff.unavailable)
    || UNAVAILABLE_FIELDS.some((field) => handoff.unavailable[field] !== 'bootstrap-unavailable')) {
    problems.push(issue('fabricated-lifecycle-binding', 'all six lifecycle fields must remain bootstrap-unavailable'));
  }
  if (handoff.independentReviewRequired !== true
    || handoff.landingAuthorized !== false
    || handoff.mergeAuthorized !== false
    || handoff.disclaimer !== INTENT_DISCLAIMER) {
    problems.push(issue('invalid-authority-boundary', 'the In-flight Intent disclaimer and non-authority flags must be exact'));
  }
  return problems;
}

function validateReviewEvidence(evidence, handoff, reviewer) {
  const problems = [];
  if (!isObject(evidence)) return [issue('missing-review-evidence', 'exact review evidence is required')];
  if (evidence.reviewer !== reviewer
    || evidence.baseSha !== handoff?.checkedTarget?.sha
    || evidence.candidateSha !== handoff?.candidateRef?.sha
    || evidence.candidateRef !== handoff?.candidateRef?.ref
    || evidence.targetRef !== handoff?.checkedTarget?.ref) {
    problems.push(issue('mismatched-review-evidence', 'review evidence must bind this reviewer and exact comparison'));
  }
  if (!['pass', 'reject'].includes(evidence.outcome)) problems.push(issue('invalid-review-outcome', 'review outcome must be pass or reject'));
  if (!validNamedChecks(evidence.checks)) problems.push(issue('missing-proof', 'review evidence must name passing checks'));
  if (!Array.isArray(evidence.findings) || !evidence.findings.every(validFinding)) {
    problems.push(issue('invalid-review-findings', 'findings must be a valid array'));
  } else if (evidence.outcome === 'pass' && evidence.findings.length > 0) {
    problems.push(issue('pass-has-findings', 'a pass cannot retain unresolved findings'));
  } else if (evidence.outcome === 'reject' && evidence.findings.length === 0) {
    problems.push(issue('reject-missing-findings', 'a rejected candidate must name at least one finding'));
  }
  if (evidence.privacyChecked !== true
    || !Array.isArray(evidence.privacyFindings)
    || !Array.isArray(evidence.exclusionViolations)
    || evidence.privacyFindings.length > 0
    || evidence.exclusionViolations.length > 0) {
    problems.push(issue('privacy-or-exclusion', 'privacy must be checked with no finding or exclusion violation'));
  }
  return problems;
}

function remoteSha(repository, remote, ref, gitRunner, authHeader) {
  const args = ['ls-remote', '--exit-code', '--', remote.name, ref];
  const options = {};
  args.unshift(
    '-c', 'credential.helper=',
    '-c', 'core.askPass=',
    '-c', 'credential.interactive=never',
    '-c', 'http.extraHeader=',
    '-c', `http.${remote.url}.extraHeader=`,
    '-c', 'http.proxy=',
    '-c', 'http.sslVerify=true',
    '-c', 'http.followRedirects=false',
    '-c', 'protocol.file.allow=never',
    '-c', 'protocol.ext.allow=never',
    '-c', 'protocol.ssh.allow=never',
    '-c', 'protocol.git.allow=never',
    '-c', 'protocol.http.allow=never',
    '-c', 'protocol.https.allow=always',
  );
  if (validAuthHeader(authHeader)) {
    args.push(`--config-env=http.${remote.url}.extraHeader=${AUTH_HEADER_ENV}`);
    const lsRemoteIndex = args.indexOf('ls-remote');
    const configEnv = args.pop();
    args.splice(lsRemoteIndex, 0, configEnv);
    options.env = { [AUTH_HEADER_ENV]: authHeader };
  }
  const result = gitRunner(repository, args, options);
  if (!result.ok) return { ok: false, sha: null, detail: 'remote authentication or exact-ref lookup failed' };
  const lines = result.output.split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) return { ok: false, sha: null, detail: `expected one exact ref, received ${lines.length}` };
  const sha = lines[0].split(/\s+/)[0];
  return isFullSha(sha) ? { ok: true, sha, detail: '' } : { ok: false, sha: null, detail: 'remote returned a malformed commit' };
}

export function createProductionRemoteAdapter({
  gitRunner = git,
  authHeader = process.env[AUTH_HEADER_ENV],
} = {}) {
  const trustedAuthHeader = validAuthHeader(authHeader) ? authHeader : null;
  const runGit = (repository, args, options = {}) => {
    if (!TRUSTED_TEMP_ROOT) return { ok: false, output: 'trusted temporary root unavailable' };
    return gitRunner(repository, args, {
      ...options,
      env: { ...(options.env || {}), TMPDIR: TRUSTED_TEMP_ROOT },
    });
  };
  return {
    validate(repository, remote) {
      const problems = [];
      const raw = runGit(repository, ['config', '--local', '--get', `remote.${remote.name}.url`]);
      const effective = runGit(repository, ['remote', 'get-url', remote.name]);
      const ambient = runGit(repository, [
        'config', '--local', '--name-only', '--get-regexp',
        '^(credential\\.|http\\.|core\\.askPass$|remote\\..*\\.(proxy|uploadpack)$|url\\.)',
      ]);
      if (!raw.ok || raw.output !== remote.url) problems.push(issue('recovery-url-mismatch', 'configured recovery URL does not match the handoff'));
      if (!effective.ok || effective.output !== remote.url) problems.push(issue('recovery-url-rewrite', 'effective recovery URL differs from the handoff'));
      if ((ambient.ok && ambient.output !== '') || (!ambient.ok && ambient.output !== '')) {
        problems.push(issue('ambient-git-config', 'repository-local credential or transport overrides are not allowed'));
      }
      return { ok: problems.length === 0, issues: problems };
    },
    lookup(repository, remote, ref) {
      return remoteSha(repository, remote, ref, runGit, trustedAuthHeader);
    },
  };
}

const productionRemoteAdapter = createProductionRemoteAdapter();

function reviewStatus(repository) {
  return git(repository, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching']);
}

function safeFingerprint(handoff, actualPaths, proofNames, findings = []) {
  return {
    repositoryIdentity: isBoundString(handoff?.repository?.identity) ? handoff.repository.identity : null,
    recoveryRemote: handoff?.repository?.recoveryRemote?.name || null,
    baseSha: isFullSha(handoff?.checkedTarget?.sha) ? handoff.checkedTarget.sha : null,
    candidateSha: isFullSha(handoff?.candidateRef?.sha) ? handoff.candidateRef.sha : null,
    targetRef: isBranchRef(handoff?.checkedTarget?.ref) ? handoff.checkedTarget.ref : null,
    candidateRef: isBranchRef(handoff?.candidateRef?.ref) ? handoff.candidateRef.ref : null,
    changedPaths: actualPaths.filter(isLiteralPath),
    namedProof: proofNames.filter(isBoundString),
    findings: findings.filter(validFinding),
  };
}

function result({ caseName, outcome, next, reason, handoff, actualPaths = [], proofNames = [], findings = [] }) {
  return {
    exitCode: outcome === 'accepted' ? 0 : 1,
    case: caseName,
    outcome,
    next,
    checksPerformed: [...CHECKS],
    invalidationReason: reason,
    evidence: safeFingerprint(handoff, actualPaths, proofNames, findings),
    landingAuthorized: false,
    mergeAuthorized: false,
    disclaimer: RESULT_DISCLAIMER,
  };
}

export function evaluateLandingCheck({
  handoff,
  reviewer,
  reviewRepository,
  reviewEvidence,
  remoteAdapter = productionRemoteAdapter,
}) {
  if (!isBoundString(reviewRepository)) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'review lane is unreadable', handoff });
  }
  let resolvedRepository;
  try {
    resolvedRepository = fs.realpathSync(reviewRepository);
  } catch {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'review repository is unreadable', handoff });
  }
  const top = git(reviewRepository, ['rev-parse', '--show-toplevel']);
  if (!top.ok) return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'review repository cannot be resolved', handoff });
  if (Array.isArray(handoff) || Array.isArray(reviewEvidence)) {
    return result({ caseName: 'duplicate-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'expected exactly one In-flight handoff and one review record', handoff: Array.isArray(handoff) ? handoff[0] : handoff });
  }
  if (!isObject(handoff)) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'required In-flight handoff is unreadable', handoff });
  }
  const handoffProblems = validateHandoff(handoff);
  const authorityCodes = new Set([
    'invalid-stage', 'invalid-canon-binding', 'invalid-actor-binding',
    'invalid-repository-binding', 'fabricated-lifecycle-binding', 'invalid-authority-boundary',
  ]);
  if (handoffProblems.some((problem) => authorityCodes.has(problem.code))) {
    return result({ caseName: 'mismatched-handoff', outcome: 'blocked', next: 'none', reason: 'handoff authority binding is invalid', handoff });
  }
  if (!isBoundString(reviewer) || reviewer === handoff.actor) {
    return result({ caseName: 'reviewer-not-independent', outcome: 'blocked', next: 'none', reason: 'reviewer must be a separate bound actor', handoff });
  }
  if (handoffProblems.some((problem) => problem.code === 'scope-growth')) {
    return result({ caseName: 'scope-growth', outcome: 'blocked', next: '/preflight', reason: 'declared changed paths exceed exact allowed paths', handoff });
  }
  const handoffProofMissing = handoffProblems.some((problem) => problem.code === 'missing-proof');
  const remainingHandoffProblems = handoffProblems.filter((problem) => problem.code !== 'missing-proof');
  if (remainingHandoffProblems.length > 0) {
    return result({ caseName: 'mismatched-handoff', outcome: 'blocked', next: '/in-flight', reason: handoffProblems.map((problem) => problem.code).join(', '), handoff });
  }
  const reviewProblems = isObject(reviewEvidence)
    ? validateReviewEvidence(reviewEvidence, handoff, reviewer)
    : [issue('missing-proof', 'one bound independent review record is required')];
  if (reviewProblems.some((problem) => problem.code === 'privacy-or-exclusion')) {
    return result({ caseName: 'privacy-or-exclusion', outcome: 'blocked', next: 'none', reason: 'privacy or exclusion proof failed', handoff });
  }

  let resolvedTop;
  try { resolvedTop = fs.realpathSync(top.output); } catch { resolvedTop = null; }
  if (resolvedTop !== resolvedRepository) {
    return result({ caseName: 'mismatched-review-lane', outcome: 'blocked', next: 'none', reason: 'review repository must be the exact worktree root', handoff });
  }

  const remote = handoff.repository.recoveryRemote;
  const remoteBinding = remoteAdapter.validate(reviewRepository, remote);
  if (!remoteBinding?.ok) {
    return result({ caseName: 'mismatched-recovery-remote', outcome: 'blocked', next: 'none', reason: (remoteBinding?.issues || []).map((problem) => problem.code).join(', ') || 'recovery remote mismatch', handoff });
  }

  const entryHead = git(reviewRepository, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const entryTree = git(reviewRepository, ['rev-parse', '--verify', 'HEAD^{tree}']);
  const entryStatus = reviewStatus(reviewRepository);
  if (!entryHead.ok || !entryTree.ok || !entryStatus.ok) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'review lane state is unreadable', handoff });
  }
  if (entryStatus.output !== '') {
    return result({ caseName: 'dirty-review-lane', outcome: 'blocked', next: 'none', reason: 'review lane must be clean including untracked and ignored entries', handoff });
  }
  const symbolicHead = git(reviewRepository, ['symbolic-ref', '-q', 'HEAD']);
  if (symbolicHead.ok || entryHead.output !== handoff.candidateRef.sha) {
    return result({ caseName: 'mismatched-review-lane', outcome: 'blocked', next: 'none', reason: 'review HEAD must be detached at the exact candidate', handoff });
  }
  for (const [label, sha] of [['base', handoff.checkedTarget.sha], ['candidate', handoff.candidateRef.sha]]) {
    const resolved = git(reviewRepository, ['rev-parse', '--verify', `${sha}^{commit}`]);
    if (!resolved.ok || resolved.output !== sha) {
      return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: `${label} commit is not exactly readable`, handoff });
    }
  }
  const ancestry = git(reviewRepository, ['merge-base', '--is-ancestor', handoff.checkedTarget.sha, handoff.candidateRef.sha]);
  let comparisonMismatch = ancestry.ok ? null : 'checked base is not an ancestor of the candidate';
  const diff = git(reviewRepository, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', handoff.checkedTarget.sha, handoff.candidateRef.sha, '--']);
  if (!diff.ok) return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'fixed diff is unreadable', handoff });
  const actualPaths = diff.output.split(/\r?\n/).filter(Boolean);
  if (actualPaths.length === 0 || actualPaths.some((changedPath) => !handoff.allowedPaths.includes(changedPath))) {
    return result({ caseName: 'scope-growth', outcome: 'blocked', next: '/preflight', reason: 'actual payload is empty or exceeds exact allowed paths', handoff, actualPaths });
  }
  if (!sameStringSet(actualPaths, handoff.changedPaths)) {
    comparisonMismatch = 'declared and actual changed paths differ';
  }

  const entryCandidate = remoteAdapter.lookup(reviewRepository, remote, handoff.candidateRef.ref);
  const entryTarget = remoteAdapter.lookup(reviewRepository, remote, handoff.checkedTarget.ref);
  if (!entryCandidate?.ok || !entryTarget?.ok) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: !entryCandidate?.ok ? 'candidate recovery ref is unreadable' : 'target ref is unreadable', handoff, actualPaths });
  }
  if (entryCandidate.sha !== handoff.candidateRef.sha) {
    return result({ caseName: 'stale-candidate', outcome: 'blocked', next: '/in-flight', reason: 'candidate ref moved; every candidate change requires a new In-flight handoff and Landing-check', handoff, actualPaths });
  }
  if (entryTarget.sha !== handoff.checkedTarget.sha) {
    return result({ caseName: 'stale-target', outcome: 'blocked', next: '/preflight', reason: 'target ref moved; rebuild the exact comparison from fresh entry checks', handoff, actualPaths });
  }
  if (comparisonMismatch) {
    return result({ caseName: 'mismatched-comparison', outcome: 'blocked', next: '/in-flight', reason: comparisonMismatch, handoff, actualPaths });
  }

  if (handoffProofMissing || reviewProblems.some((problem) => problem.code === 'missing-proof')) {
    return result({ caseName: 'missing-proof', outcome: 'blocked', next: '/in-flight', reason: 'review named proof is missing or failing', handoff, actualPaths });
  }
  if (reviewProblems.length > 0) {
    return result({ caseName: 'mismatched-review-evidence', outcome: 'blocked', next: '/in-flight', reason: reviewProblems.map((problem) => problem.code).join(', '), handoff, actualPaths });
  }

  const exitHead = git(reviewRepository, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const exitTree = git(reviewRepository, ['rev-parse', '--verify', 'HEAD^{tree}']);
  const exitStatus = reviewStatus(reviewRepository);
  const exitCandidate = remoteAdapter.lookup(reviewRepository, remote, handoff.candidateRef.ref);
  const exitTarget = remoteAdapter.lookup(reviewRepository, remote, handoff.checkedTarget.ref);
  if (!exitHead.ok || !exitTree.ok || !exitStatus.ok || !exitCandidate?.ok || !exitTarget?.ok) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'exit read-back is incomplete', handoff, actualPaths });
  }
  if (exitHead.output !== entryHead.output || exitTree.output !== entryTree.output || exitStatus.output !== entryStatus.output
    || exitCandidate.sha !== entryCandidate.sha || exitTarget.sha !== entryTarget.sha) {
    return result({ caseName: 'recovery-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'review lane or remote comparison changed during Landing-check', handoff, actualPaths });
  }

  const proofNames = [...handoff.tests, ...reviewEvidence.checks].map((entry) => entry.name);
  if (reviewEvidence.outcome === 'reject') {
    return result({ caseName: 'review-rejected', outcome: 'rejected', next: '/in-flight', reason: 'independent review retained findings; any correction creates a new candidate', handoff, actualPaths, proofNames, findings: reviewEvidence.findings });
  }
  return result({ caseName: 'accepted', outcome: 'accepted', next: '/land', reason: 'any candidate or target movement invalidates this evidence', handoff, actualPaths, proofNames, findings: [] });
}

function parseArgs(argv) {
  const options = {};
  const named = new Map([
    ['--handoff', 'handoff'],
    ['--reviewer', 'reviewer'],
    ['--review-repository', 'reviewRepository'],
    ['--review-evidence', 'reviewEvidence'],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!named.has(arg)) {
      return { failure: result({ caseName: 'startup-invalid', outcome: 'blocked', next: 'none', reason: 'unsupported command-line option' }) };
    }
    if (seen.has(arg)) {
      return { failure: result({ caseName: 'duplicate-ambiguous', outcome: 'recovery-required', next: 'none', reason: 'a named command-line binding was repeated' }) };
    }
    seen.add(arg);
    const value = argv[index + 1];
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
      return { failure: result({ caseName: 'startup-invalid', outcome: 'blocked', next: 'none', reason: 'a named command-line binding is missing its value' }) };
    }
    options[named.get(arg)] = value;
    index += 1;
  }
  if (!options.handoff || !options.reviewer || !options.reviewRepository || !options.reviewEvidence) {
    return { failure: result({ caseName: 'startup-invalid', outcome: 'blocked', next: 'none', reason: 'required command-line bindings are missing' }) };
  }
  return { options };
}

function readJsonRecord(file) {
  let body;
  try {
    body = fs.readFileSync(file, 'utf8');
  } catch {
    return { failure: result({ caseName: 'startup-unreadable', outcome: 'recovery-required', next: 'none', reason: 'a required input record is unreadable' }) };
  }
  try {
    return { value: JSON.parse(body) };
  } catch {
    return { failure: result({ caseName: 'startup-malformed', outcome: 'blocked', next: 'none', reason: 'a required input record is malformed JSON' }) };
  }
}

function emit(evaluation) {
  const { exitCode, ...record } = evaluation;
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  process.exitCode = exitCode;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.failure) return emit(parsed.failure);
  const handoff = readJsonRecord(parsed.options.handoff);
  if (handoff.failure) return emit(handoff.failure);
  const reviewEvidence = readJsonRecord(parsed.options.reviewEvidence);
  if (reviewEvidence.failure) return emit(reviewEvidence.failure);
  return emit(evaluateLandingCheck({
    handoff: handoff.value,
    reviewer: parsed.options.reviewer,
    reviewRepository: parsed.options.reviewRepository,
    reviewEvidence: reviewEvidence.value,
  }));
}

const modulePath = fs.realpathSync(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : null;
if (invokedPath === modulePath) main();
