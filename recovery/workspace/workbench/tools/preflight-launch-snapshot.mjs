#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  collectFreshnessRefs,
  parsePreflightSpecFile,
  runPreflight,
} from './preflight.mjs';

export const SCHEMA = 'gpt-os.preflight-launch-snapshot.v1';
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const IDENTITY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MODES = new Set(['capture', 'verify', 'compare-preflight']);
const ARGUMENTS = new Set([
  '--root', '--repo', '--identity', '--visibility', '--spec', '--ticket',
  '--job-order', '--push-to', '--time-zone', '--target-updated-day', '--temp-root', '--out',
  '--manifest', '--sha256', '--preflight',
]);
const TOP_KEYS = ['schema', 'target', 'push', 'timeZone', 'targetUpdatedDay', 'repositories', 'records'];
const TARGET_KEYS = ['spec', 'ticket', 'jobOrder'];
const REPOSITORY_KEYS = ['ordinal', 'identity', 'head', 'remote', 'visibility'];
const RECORD_KEYS = ['repositoryOrdinal', 'refClass', 'refName', 'objectSha', 'committerEpoch', 'committerIso', 'findingCode', 'localDate'];

class UsageError extends Error {}
class ValidationError extends Error {}
class StateError extends Error {}

const exactKeys = (value, keys, label) => {
  validate(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  validate(JSON.stringify(Object.keys(value)) === JSON.stringify(keys), `${label} schema keys are invalid`);
};
const assert = (condition, message) => { if (!condition) throw new StateError(message); };
const validate = (condition, message) => { if (!condition) throw new ValidationError(message); };
const usage = (condition, message) => { if (!condition) throw new UsageError(message); };

export function canonicalBytes(manifest) {
  validateManifest(manifest);
  return Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
}

export function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validateManifest(manifest) {
  exactKeys(manifest, TOP_KEYS, 'manifest');
  validate(manifest.schema === SCHEMA, 'manifest schema mismatch');
  exactKeys(manifest.target, TARGET_KEYS, 'target');
  validate(/^S-\d{3}$/.test(manifest.target.spec), 'target spec is invalid');
  validate(/^TK-\d+$/.test(manifest.target.ticket), 'target ticket is invalid');
  validate(/^JO-[0-9A-Z]{6}$/.test(manifest.target.jobOrder), 'target Job Order is invalid');
  validate(/^[A-Za-z0-9._/-]+$/.test(manifest.push) && !/^(?:main|master)$/.test(manifest.push), 'push target is invalid');
  validate(typeof manifest.timeZone === 'string' && manifest.timeZone.length > 0, 'timezone is invalid');
  try { new Intl.DateTimeFormat('en', { timeZone: manifest.timeZone }).format(0); } catch { throw new ValidationError('timezone is invalid'); }
  validate(DAY.test(manifest.targetUpdatedDay), 'targetUpdatedDay is invalid');
  validate(Array.isArray(manifest.repositories) && manifest.repositories.length > 0, 'repositories are missing');
  validate(Array.isArray(manifest.records), 'records are missing');
  const repositoryKeys = new Set();
  for (const [index, repository] of manifest.repositories.entries()) {
    exactKeys(repository, REPOSITORY_KEYS, 'repository');
    validate(repository.ordinal === index, 'repository ordinal is non-deterministic');
    validate(IDENTITY.test(repository.identity), 'repository identity is invalid');
    validate(SHA.test(repository.head), 'repository HEAD is invalid');
    validate(repository.remote === `github:${repository.identity}`, 'repository remote identity mismatch');
    validate(['private', 'public'].includes(repository.visibility), 'repository visibility is uncertain');
    validate(!repositoryKeys.has(repository.identity), 'duplicate repository key');
    repositoryKeys.add(repository.identity);
  }
  let previous = null;
  const recordKeys = new Set();
  for (const record of manifest.records) {
    exactKeys(record, RECORD_KEYS, 'record');
    validate(Number.isInteger(record.repositoryOrdinal) && record.repositoryOrdinal >= 0 && record.repositoryOrdinal < manifest.repositories.length, 'record repository ordinal is invalid');
    validate(['local', 'remote-tracking'].includes(record.refClass), 'record ref class is invalid');
    validate(record.refName.startsWith(record.refClass === 'local' ? 'refs/heads/' : 'refs/remotes/'), 'record ref name is malformed');
    validate(/^refs\/(?:heads|remotes)\/[A-Za-z0-9._/-]+$/.test(record.refName) && !/\.\.|\/\/|@\{|\.lock(?:\/|$)/.test(record.refName), 'record ref name is malformed');
    validate(SHA.test(record.objectSha), 'record object SHA is invalid');
    validate(Number.isSafeInteger(record.committerEpoch) && record.committerEpoch >= 0, 'record committer epoch is invalid');
    validate(ISO.test(record.committerIso) && Number.isFinite(Date.parse(record.committerIso)), 'record committer ISO is invalid');
    validate(record.findingCode === 'spec-branch-activity-fresher', 'record finding code is unexpected');
    validate(DAY.test(record.localDate), 'record localDate is invalid');
    const order = `${String(record.repositoryOrdinal).padStart(8, '0')}\0${record.refName}`;
    validate(previous === null || previous.localeCompare(order) < 0, 'record sort is non-deterministic');
    previous = order;
    const key = `${record.repositoryOrdinal}\0${record.refName}`;
    validate(!recordKeys.has(key), 'duplicate record key');
    recordKeys.add(key);
  }
}

const normalizedRecord = (record) => ({
  repositoryOrdinal: record.repoIndex,
  refClass: record.refClass,
  refName: record.fullRef,
  objectSha: record.objectSha,
  committerEpoch: record.committerEpoch,
  committerIso: record.committerIso,
  findingCode: record.findingCode,
  localDate: record.localDate,
});

export function captureSnapshot({
  target,
  repositories,
  jobOrder,
  push,
  timeZone,
  targetUpdatedDay,
  inspectRepository,
  collector = collectFreshnessRefs,
}) {
  assert(target?.updated === undefined || target.updated === targetUpdatedDay, 'targetUpdatedDay does not match target record');
  assert(target?.selectedJobOrder === jobOrder, 'target Job Order does not match selected order');
  const inspected = repositories.map((repository, ordinal) => {
    const result = inspectRepository(repository, ordinal);
    assert(result.ordinal === ordinal, 'repository ordinal mismatch');
    assert(result.identity === repository.identity, 'repository identity mismatch');
    assert(result.visibility === repository.visibility, 'repository visibility mismatch');
    return result;
  });
  const freshness = collector(target, repositories.map((repository) => repository.path), { timeZone });
  assert(freshness.timeZone === timeZone, 'collector timezone mismatch');
  assert(Array.isArray(freshness.errors) && freshness.errors.length === 0, 'collector returned a blocking error');
  const records = freshness.records.map(normalizedRecord)
    .sort((a, b) => a.repositoryOrdinal - b.repositoryOrdinal || a.refName.localeCompare(b.refName));
  const manifest = {
    schema: SCHEMA,
    target: { spec: target.id, ticket: target.selectedTicket, jobOrder },
    push,
    timeZone,
    targetUpdatedDay,
    repositories: inspected,
    records,
  };
  // The caller supplies the selected ticket explicitly; this tool adds no
  // reference-matching or target-selection rule of its own.
  validateManifest(manifest);
  return manifest;
}

function componentsBetween(root, candidate) {
  const relative = path.relative(root, candidate);
  assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'output containment failure');
  const components = [root];
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    components.push(current);
  }
  return components;
}

export function safeOutputPath(tempRoot, output) {
  assert(path.isAbsolute(tempRoot) && path.isAbsolute(output), 'authorized temp root and output must be absolute');
  const root = path.resolve(tempRoot);
  const candidate = path.resolve(output);
  assert(fs.existsSync(root) && fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink(), 'authorized temp root is invalid');
  assert(path.dirname(candidate) === root, 'output containment failure');
  for (const component of componentsBetween(root, path.dirname(candidate))) {
    assert(!fs.lstatSync(component).isSymbolicLink(), 'output has a symlink component');
  }
  const candidateStat = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (candidateStat) assert(!candidateStat.isSymbolicLink(), 'output has a symlink component');
  return candidate;
}

export function writeManifest(tempRoot, output, bytes) {
  const candidate = safeOutputPath(tempRoot, output);
  assert(!fs.existsSync(candidate), 'output already exists');
  const descriptor = fs.openSync(candidate, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeFileSync(descriptor, bytes); } finally { fs.closeSync(descriptor); }
  const stat = fs.lstatSync(candidate);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600, 'output must be a regular mode-0600 file');
  return { sha256: digestBytes(bytes), bytes: bytes.length };
}

export function verifyManifestBytes(bytes, { expectedSha256 = null, current = null } = {}) {
  validate(Buffer.isBuffer(bytes), 'manifest bytes are unreadable');
  validate(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), 'manifest contains a UTF-8 BOM');
  validate(bytes.at(-1) === 0x0a && bytes.at(-2) !== 0x0a, 'manifest canonical bytes must have exactly one final newline');
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch { throw new ValidationError('manifest schema is invalid'); }
  const canonical = canonicalBytes(manifest);
  validate(canonical.equals(bytes), 'manifest canonical bytes mismatch');
  if (expectedSha256 !== null) {
    validate(/^[0-9a-f]{64}$/.test(expectedSha256), 'expected hash is invalid');
    assert(digestBytes(bytes) === expectedSha256, 'manifest hash mismatch');
  }
  if (current !== null) assert(canonicalBytes(current).equals(bytes), 'repository movement or manifest equality failure');
  return manifest;
}

export function comparePreflightData(manifest, preflight) {
  validateManifest(manifest);
  assert(preflight && typeof preflight === 'object', 'Preflight JSON is invalid');
  assert(preflight.pass === true && preflight.verdict === 'pass' && preflight.launchAuthorized === true, 'Preflight is non-authorizing');
  assert(preflight.spec?.id === manifest.target.spec && preflight.spec?.ticket === manifest.target.ticket, 'Preflight target mismatch');
  assert(preflight.jobOrder?.alias === manifest.target.jobOrder && preflight.jobOrder?.launchEligible === true, 'Preflight Job Order mismatch');
  assert(Array.isArray(preflight.blocking) && preflight.blocking.length === 0, 'Preflight blocking band is nonzero');
  assert(Array.isArray(preflight.reconcilable) && preflight.reconcilable.length === 0, 'Preflight reconcilable band is nonzero');
  assert(Array.isArray(preflight.failures) && preflight.failures.length === 0, 'Preflight failures band is nonzero');
  assert(preflight.freshness?.timeZone === manifest.timeZone, 'Preflight timezone mismatch');
  assert(Array.isArray(preflight.freshness?.errors) && preflight.freshness.errors.length === 0, 'Preflight collector errors are nonzero');
  const records = [...preflight.freshness.records].map(normalizedRecord)
    .sort((a, b) => a.repositoryOrdinal - b.repositoryOrdinal || a.refName.localeCompare(b.refName));
  assert(JSON.stringify(records) === JSON.stringify(manifest.records), 'Preflight record equality failure');
  return { exact: true, records: records.length };
}

function git(repo, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    if (allowFailure) return null;
    throw new StateError('repository state could not be read');
  }
}

function sanitizedIdentity(remote) {
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/);
  assert(match, 'repository remote identity is invalid');
  return match[1];
}

function authoritativeVisibility(identity) {
  let output;
  try {
    output = execFileSync('gh', ['repo', 'view', identity, '--json', 'nameWithOwner,visibility'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { throw new StateError('authoritative visibility is unavailable'); }
  let data;
  try { data = JSON.parse(output); } catch { throw new StateError('authoritative visibility is unavailable'); }
  assert(data.nameWithOwner === identity, 'authoritative repository identity mismatch');
  const visibility = String(data.visibility ?? '').toLowerCase();
  assert(['private', 'public'].includes(visibility), 'authoritative visibility is uncertain');
  return visibility;
}

function inspectRepository(repository, ordinal) {
  assert(fs.existsSync(repository.path), 'repository input is unavailable');
  assert(git(repository.path, ['status', '--porcelain']) === '', 'repository input is dirty');
  const branch = git(repository.path, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
  assert(branch, 'repository HEAD is detached or unreadable');
  const head = git(repository.path, ['rev-parse', '--verify', 'HEAD^{commit}']);
  assert(SHA.test(head), 'repository HEAD is malformed');
  const remotes = git(repository.path, ['remote']).split('\n').filter(Boolean);
  assert(remotes.length === 1 && remotes[0] === 'origin', 'repository remote conflict');
  const identity = sanitizedIdentity(git(repository.path, ['remote', 'get-url', 'origin']));
  assert(identity === repository.identity, 'repository identity mismatch');
  const visibility = authoritativeVisibility(identity);
  assert(visibility === repository.visibility, 'repository visibility mismatch');
  return { ordinal, identity, head, remote: `github:${identity}`, visibility };
}

function parseArgs(argv) {
  usage(argv.length > 0 && MODES.has(argv[0]), 'usage');
  const mode = argv[0];
  const values = new Map();
  const multi = new Map([['--repo', []], ['--identity', []], ['--visibility', []]]);
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    usage(ARGUMENTS.has(key) && value !== undefined, 'usage');
    if (multi.has(key)) multi.get(key).push(value);
    else {
      usage(!values.has(key), 'usage');
      values.set(key, value);
    }
  }
  return { mode, values, multi };
}

function required(values, key) {
  const value = values.get(key);
  usage(typeof value === 'string' && value.length > 0, 'usage');
  return value;
}

function captureInputs(parsed) {
  const root = path.resolve(required(parsed.values, '--root'));
  const paths = parsed.multi.get('--repo');
  const identities = parsed.multi.get('--identity');
  const visibilities = parsed.multi.get('--visibility');
  usage(paths.length > 0 && paths.length === identities.length && paths.length === visibilities.length, 'usage');
  const repositories = paths.map((repoPath, index) => ({ path: path.resolve(repoPath), identity: identities[index], visibility: visibilities[index] }));
  const spec = required(parsed.values, '--spec');
  const ticket = required(parsed.values, '--ticket');
  const jobOrder = required(parsed.values, '--job-order');
  const push = required(parsed.values, '--push-to');
  const timeZone = required(parsed.values, '--time-zone');
  const targetUpdatedDay = required(parsed.values, '--target-updated-day');
  const specDirs = fs.readdirSync(path.join(root, 'specs')).filter((entry) => entry.startsWith(`${spec}-`));
  assert(specDirs.length === 1, 'target spec is ambiguous or unavailable');
  const target = parsePreflightSpecFile(path.join(root, 'specs', specDirs[0], 'SPEC.md'));
  assert(target.updated === targetUpdatedDay, 'targetUpdatedDay does not match target record');
  assert(target.tickets.some((entry) => entry.id === ticket), 'target ticket is unavailable');
  target.selectedTicket = ticket;
  target.selectedJobOrder = jobOrder;
  const gate = runPreflight({ root, repos: repositories.map((item) => item.path), pushTo: push, spec, ticket, jobOrder, timeZone });
  assert(gate.blocking.length === 0 && gate.reconcilable.length === 0 && gate.failures.length === 0 && gate.freshness.errors.length === 0, 'Preflight state is not exact');
  return { root, target, repositories, jobOrder, push, timeZone, targetUpdatedDay };
}

function readPrivateFile(tempRoot, file) {
  const candidate = safeOutputPath(tempRoot, file);
  assert(fs.existsSync(candidate), 'private evidence file is unavailable');
  const stat = fs.lstatSync(candidate);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600, 'private evidence file permissions are invalid');
  return fs.readFileSync(candidate);
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value));
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value));
  try {
    const parsed = parseArgs(argv);
    const tempRoot = path.resolve(required(parsed.values, '--temp-root'));
    if (parsed.mode === 'capture') {
      const inputs = captureInputs(parsed);
      const manifest = captureSnapshot({ ...inputs, inspectRepository });
      const bytes = canonicalBytes(manifest);
      const result = writeManifest(tempRoot, path.resolve(required(parsed.values, '--out')), bytes);
      stdout(`${JSON.stringify({ status: 'exact', sha256: result.sha256, bytes: result.bytes, records: manifest.records.length, targetUpdatedDay: manifest.targetUpdatedDay })}\n`);
      return 0;
    }
    const manifestPath = path.resolve(required(parsed.values, '--manifest'));
    const bytes = readPrivateFile(tempRoot, manifestPath);
    const expectedSha256 = required(parsed.values, '--sha256');
    const manifest = verifyManifestBytes(bytes, { expectedSha256 });
    if (parsed.mode === 'verify') {
      const inputs = captureInputs(parsed);
      const current = captureSnapshot({ ...inputs, inspectRepository });
      verifyManifestBytes(bytes, { expectedSha256, current });
      stdout(`${JSON.stringify({ status: 'exact', sha256: expectedSha256, records: manifest.records.length, targetUpdatedDay: manifest.targetUpdatedDay })}\n`);
      return 0;
    }
    const preflightBytes = readPrivateFile(tempRoot, path.resolve(required(parsed.values, '--preflight')));
    let preflight;
    try { preflight = JSON.parse(preflightBytes.toString('utf8')); } catch { throw new StateError('Preflight JSON is invalid'); }
    const result = comparePreflightData(manifest, preflight);
    stdout(`${JSON.stringify({ status: 'exact', sha256: expectedSha256, records: result.records, targetUpdatedDay: manifest.targetUpdatedDay })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      stderr('usage: preflight-launch-snapshot.mjs capture|verify|compare-preflight [strict arguments]\n');
      return 2;
    }
    if (error instanceof ValidationError) {
      stderr('preflight launch snapshot: schema or byte-format validation failed\n');
      return 2;
    }
    stderr('preflight launch snapshot: state verification failed\n');
    return 1;
  }
}

if (process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
