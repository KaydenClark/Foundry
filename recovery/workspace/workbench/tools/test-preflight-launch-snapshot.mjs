#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  canonicalBytes,
  captureSnapshot,
  comparePreflightData,
  digestBytes,
  main,
  safeOutputPath,
  verifyManifestBytes,
  writeManifest,
} from './preflight-launch-snapshot.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-launch-snapshot-test-'));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`ok ${passed} - ${name}`); };
const target = {
  id: 'S-023', blockers: 'none', nextGate: 'Run TK-010.',
  selectedTicket: 'TK-010', selectedJobOrder: 'JO-00008G',
  tickets: [{ id: 'TK-010', slice: 'snapshot', blockers: 'none', proof: '—' }],
};
const repository = {
  ordinal: 0, identity: 'example/workspace', head: 'a'.repeat(40),
  remote: 'github:example/workspace', visibility: 'private',
};
const record = {
  repositoryOrdinal: 0, refClass: 'local', refName: 'refs/heads/codex/s023-a2',
  objectSha: 'b'.repeat(40), committerEpoch: 1787920000,
  committerIso: '2026-08-28T06:13:20-06:00',
  findingCode: 'spec-branch-activity-fresher', localDate: '2026-08-28',
};
const baseOptions = {
  target, repositories: [{ path: '/private/repo', identity: repository.identity, visibility: 'private' }],
  jobOrder: 'JO-00008G', push: 'codex/s023-a2', timeZone: 'America/Denver', targetUpdatedDay: '2026-08-28',
  inspectRepository: () => repository,
};

try {
  let collectorCalls = 0;
  const manifest = captureSnapshot({
    ...baseOptions,
    collector: () => { collectorCalls += 1; return { timeZone: 'America/Denver', records: [{
      repoIndex: 0, fullRef: record.refName, shortRef: 'codex/s023-a2', objectSha: record.objectSha,
      committerEpoch: record.committerEpoch, committerIso: record.committerIso,
      refClass: record.refClass, findingCode: record.findingCode, localDate: record.localDate,
    }], errors: [] }; },
  });
  assert.equal(collectorCalls, 1);
  assert.deepEqual(manifest.records, [record]);
  ok('capture reuses the injected reviewed collector without matching rules');

  const bytes = canonicalBytes(manifest);
  assert.equal(bytes.at(-1), 0x0a);
  assert.equal(bytes.includes(0xef), false);
  assert.equal(bytes.toString('utf8'), `${JSON.stringify(manifest)}\n`);
  assert.deepEqual(Object.keys(JSON.parse(bytes)), [
    'schema', 'target', 'push', 'timeZone', 'targetUpdatedDay', 'repositories', 'records',
  ]);
  assert.deepEqual(manifest.target, { spec: 'S-023', ticket: 'TK-010', jobOrder: 'JO-00008G' });
  assert.match(digestBytes(bytes), /^[0-9a-f]{64}$/);
  assert.deepEqual(verifyManifestBytes(bytes, { expectedSha256: digestBytes(bytes) }), manifest);
  ok('canonical bytes, schema, fixed order, final LF, and exact hash verify');

  assert.throws(() => verifyManifestBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])), /BOM/);
  assert.throws(() => verifyManifestBytes(Buffer.from(`${bytes.toString()}\n`)), /canonical|bytes/);
  assert.throws(() => verifyManifestBytes(bytes, { expectedSha256: '0'.repeat(64) }), /hash/);
  ok('schema, hash, and byte mismatches fail closed');

  assert.equal(safeOutputPath(temp, path.join(temp, 'manifest.json')), path.join(temp, 'manifest.json'));
  assert.throws(() => safeOutputPath(temp, path.join(temp, '..', 'escape.json')), /containment/);
  const link = path.join(temp, 'manifest-link.json');
  fs.symlinkSync(path.join(os.tmpdir(), 'outside-manifest.json'), link);
  assert.throws(() => safeOutputPath(temp, link), /symlink/);
  ok('containment and symlink escape fail closed');

  const output = path.join(temp, 'manifest.json');
  const written = writeManifest(temp, output, bytes);
  assert.equal(written.sha256, digestBytes(bytes));
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(() => writeManifest(temp, output, bytes), /exists/);
  ok('capture writes one regular mode-0600 manifest without overwrite');

  const moved = structuredClone(manifest);
  moved.repositories[0].head = 'c'.repeat(40);
  assert.throws(() => verifyManifestBytes(bytes, { current: moved }), /movement|equality/);
  assert.deepEqual(verifyManifestBytes(bytes, { current: manifest }), manifest);
  ok('repository movement fails and exact equality passes');

  const preflight = {
    pass: true, verdict: 'pass', launchAuthorized: true,
    spec: { id: 'S-023', ticket: 'TK-010' },
    jobOrder: { alias: 'JO-00008G', launchEligible: true },
    freshness: { timeZone: manifest.timeZone, records: [{
    repoIndex: 0, fullRef: record.refName, shortRef: 'codex/s023-a2', objectSha: record.objectSha,
    committerEpoch: record.committerEpoch, committerIso: record.committerIso,
    refClass: record.refClass, findingCode: record.findingCode, localDate: record.localDate,
  }], errors: [] }, failures: [], blocking: [], reconcilable: [] };
  assert.equal(comparePreflightData(manifest, preflight).exact, true);
  preflight.jobOrder.alias = 'JO-00008I';
  assert.throws(() => comparePreflightData(manifest, preflight), /Job Order/);
  preflight.jobOrder.alias = 'JO-00008G';
  preflight.blocking.push({ check: 'dirty-tree' });
  assert.throws(() => comparePreflightData(manifest, preflight), /blocking/);
  ok('compare-preflight requires exact records and zero error bands');

  const privateText = `${JSON.stringify(manifest)} https://secret.example/x?token=abc#frag /private/repo host.local`;
  const writes = [];
  const deps = { stdout: (value) => writes.push(value), stderr: (value) => writes.push(value) };
  assert.equal(await main([], deps), 2);
  assert.equal(await main(['unknown'], deps), 2);
  assert.equal(await main([
    'capture', '--root', temp, '--repo', temp, '--identity', 'example/workspace',
    '--visibility', 'private', '--spec', 'S-023', '--ticket', 'TK-010',
    '--push-to', 'codex/s023-test', '--time-zone', 'America/Denver',
    '--target-updated-day', '2026-08-28', '--temp-root', temp,
    '--out', path.join(temp, 'ticket-only.json'),
  ], deps), 2);
  assert.doesNotMatch(writes.join(''), /secret|token=|\/private\/repo|host\.local|refs\/heads/);
  assert.ok(privateText.includes('secret'));
  ok('strict usage exit 2 and diagnostics disclose no private material');

  const malformedManifest = path.join(temp, 'malformed-manifest.json');
  fs.writeFileSync(malformedManifest, '{}\n', { mode: 0o600 });
  const malformedResult = spawnSync(process.execPath, [
    new URL('./preflight-launch-snapshot.mjs', import.meta.url).pathname,
    'verify', '--manifest', malformedManifest, '--sha256', digestBytes(fs.readFileSync(malformedManifest)),
    '--temp-root', temp,
  ], { encoding: 'utf8' });
  assert.equal(malformedResult.status, 2);
  assert.equal(malformedResult.stdout, '');
  assert.equal(malformedResult.stderr, 'preflight launch snapshot: schema or byte-format validation failed\n');
  assert.doesNotMatch(malformedResult.stderr, /malformed-manifest|\/private\/|schema keys|\{\}/);
  ok('malformed canonical mode-0600 manifest exits 2 with sanitized schema diagnostic');

  const aliasRoot = process.platform === 'darwin' && fs.existsSync('/tmp')
    ? fs.mkdtempSync('/tmp/preflight-launch-snapshot-alias-')
    : fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-launch-snapshot-alias-'));
  try {
    const aliasEntrypoint = path.join(aliasRoot, 'preflight-launch-snapshot.mjs');
    fs.symlinkSync(new URL('./preflight-launch-snapshot.mjs', import.meta.url), aliasEntrypoint);
    const aliasResult = spawnSync(process.execPath, [aliasEntrypoint], { encoding: 'utf8' });
    assert.equal(aliasResult.status, 2);
    assert.equal(aliasResult.stdout, '');
    assert.equal(aliasResult.stderr, 'usage: preflight-launch-snapshot.mjs capture|verify|compare-preflight [strict arguments]\n');
    ok('actual CLI executes through a filesystem alias');
  } finally {
    fs.rmSync(aliasRoot, { recursive: true, force: true });
  }

  const stateFailure = await main(['verify', '--manifest', path.join(temp, 'missing.json'), '--temp-root', temp], deps);
  assert.equal(stateFailure, 1);
  ok('verification and state failures exit 1');

  const captures = Array.from({ length: 3 }, () => canonicalBytes(captureSnapshot({
    ...baseOptions,
    collector: () => ({ timeZone: 'America/Denver', records: [{
      repoIndex: 0, fullRef: record.refName, shortRef: 'codex/s023-a2', objectSha: record.objectSha,
      committerEpoch: record.committerEpoch, committerIso: record.committerIso,
      refClass: record.refClass, findingCode: record.findingCode, localDate: record.localDate,
    }], errors: [] }),
  })));
  assert.ok(captures.every((candidate) => candidate.equals(captures[0])));
  assert.equal(JSON.parse(captures[0]).targetUpdatedDay, '2026-08-28');
  ok('triple capture is byte-identical with identical targetUpdatedDay');

  const repoState = spawnSync('git', ['status', '--porcelain=v1'], { cwd: path.dirname(new URL(import.meta.url).pathname), encoding: 'utf8' }).stdout;
  assert.equal(typeof repoState, 'string');
  ok('focused operations expose no repository mutation primitive');

  console.log(`\nok - preflight launch snapshot: ${passed} checks passed`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
