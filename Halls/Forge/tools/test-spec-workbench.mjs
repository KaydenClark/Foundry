#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSpecEvidence } from './spec-evidence.mjs';
import {
  claimWork,
  closeTicket,
  completeSpec,
  doctor,
  nextWork,
  parseCliArgs,
  render,
  showSpec
} from './spec-workbench.mjs';

assert.deepEqual(
  parseCliArgs(['next', '--json']),
  { command: 'next', id: null, options: { json: true } },
  'option flags must not be consumed as an optional spec ID'
);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-workbench-'));
try {
  write('BLUEPRINT.md', [
    '# Fixture Blueprint',
    '',
    '<!-- spec-catalog:start -->',
    '<!-- spec-catalog:end -->'
  ].join('\n'));
  write('TASKBOARD.md', [
    '# Fixture Taskboard',
    '',
    '<!-- hot-specs:start -->',
    '<!-- hot-specs:end -->'
  ].join('\n'));
  write(
    'specs/S-001-fixture/SPEC.md',
    fixtureSpec()
      .replace('**Latest event:** Spec activated.', '**Latest event:** Spec activated.\nThis old event continuation must be replaced too.')
      .replace('**Next gate:** Complete TK-001.', '**Next gate:** Complete TK-001.\nThis old gate continuation must be replaced too.')
  );

  const next = nextWork(root);
  assert.equal(next.specId, 'S-001');
  assert.equal(next.specFuid, '000001');
  assert.equal(next.ticketId, 'TK-001');
  assert.equal(next.ticketFuid, '000002');

  claimWork(root, 'S-001', { agent: 'codex', date: '2026-07-12' });
  assert.match(read('specs/S-001-fixture/SPEC.md'), /\| TK-001 \| 000002 \| First slice \| in-progress \| none \| 2026-07-10 \| 2026-07-12 \|/);
  assert.match(read('specs/S-001-fixture/SPEC.md'), /\*\*Created:\*\* 2026-07-10/);
  assert.match(read('specs/S-001-fixture/SPEC.md'), /\*\*Last worked:\*\* 2026-07-12/);
  assert.doesNotMatch(read('specs/S-001-fixture/SPEC.md'), /This old (event|gate) continuation must be replaced too\./);
  assert.equal(nextWork(root).status, 'in-progress', 'next should resume claimed work before selecting new work');

  assert.throws(
    () => completeSpec(root, 'S-001', { date: '2026-07-12' }),
    /unfinished slice|unchecked acceptance/i,
    'a spec must not complete before its ticket and acceptance gates'
  );

  const closed = closeTicket(root, 'S-001', {
    proof: 'node test | tee proof.log',
    docs: 'Docs checked; no update needed',
    remainingGap: 'none',
    date: '2026-07-12'
  });
  assert.equal(closed.tickets[0].proof, 'node test | tee proof.log', 'ticket proof should round-trip a literal pipe');
  assert.equal(closed.created, '2026-07-10', 'Spec Created is immutable');
  assert.equal(closed.lastWorked, '2026-07-12', 'close advances Spec Last worked');
  assert.equal(closed.tickets[0].created, '2026-07-10', 'Ticket Created is immutable');
  assert.equal(closed.tickets[0].lastWorked, '2026-07-12', 'close advances Ticket Last worked');
  assert.equal(
    read('specs/S-001-fixture/SPEC.md').split('node test \\| tee proof.log').length - 1,
    2,
    'ticket proof and appended evidence should persist escaped Markdown pipes'
  );
  let completedCandidate = read('specs/S-001-fixture/SPEC.md')
    .replace('- [ ] Expected behavior is verified.', '- [x] Expected behavior is verified.')
    .replace('## Completion Result\n\nPending.', '## Completion Result\n\nPass: fixture lifecycle completed.');
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), completedCandidate);
  completeSpec(root, 'S-001', { date: '2026-07-13' });
  render(root);

  assert.match(read('BLUEPRINT.md'), /S-001-fixture\/SPEC\.md/);
  assert.match(read('BLUEPRINT.md'), /000001/);
  assert.match(read('specs/S-001-fixture/SPEC.md'), /\*\*Last worked:\*\* 2026-07-13/);
  assert.match(read('specs/S-001-fixture/SPEC.md'), /\| TK-001 \| 000002 .*\| 2026-07-12 \| node test/, 'Spec completion does not rewrite Ticket Last worked');
  assert.doesNotMatch(read('TASKBOARD.md'), /S-001/,
    'completed specs must disappear from the hot board');
  assert.equal(nextWork(root), null, 'completed work must not be returned as eligible');
  assert.deepEqual(doctor(root), [], 'a rendered valid repository should pass doctor');

  fs.writeFileSync(
    path.join(root, 'BLUEPRINT.md'),
    read('BLUEPRINT.md').replaceAll('\n', '\r\n')
  );
  fs.writeFileSync(
    path.join(root, 'TASKBOARD.md'),
    read('TASKBOARD.md').replaceAll('\n', '\r\n')
  );
  assert.deepEqual(
    doctor(root),
    [],
    'equivalent CRLF generated regions should pass doctor on Windows checkouts'
  );
  render(root);

  write(
    'specs/S-002-blocked/SPEC.md',
    fixtureSpec().replaceAll('S-001', 'S-002').replaceAll('000001', '000003').replaceAll('000002', '000004')
      .replace('| TK-001 | 000004 | First slice | ready | none |', '| TK-001 | 000004 | First slice | ready | S-999 |')
  );
  assert.throws(
    () => claimWork(root, 'S-002', { agent: 'codex', date: '2026-07-12' }),
    /no eligible ready ticket/i,
    'direct claim must not bypass declared blockers'
  );
  fs.rmSync(path.join(root, 'specs/S-002-blocked'), { recursive: true });

  const validCompleted = read('specs/S-001-fixture/SPEC.md');
  fs.writeFileSync(
    path.join(root, 'specs/S-001-fixture/SPEC.md'),
    validCompleted.replace('| TK-001 | 000002 | First slice | done |', '| TK-001 | 000002 | First slice | in-progress |')
      .replace('**Last worked:** 2026-07-13', '**Last worked:** 2026-07-10')
      .replace('**Updated:** 2026-07-13', '**Updated:** 2026-07-10')
  );
  assert.ok(doctor(root, { today: '2026-07-12' }).some((issue) => issue.code === 'contradictory-state'));
  assert.ok(doctor(root, { today: '2026-07-12' }).some((issue) => issue.code === 'stale-claim'));
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), validCompleted);

  const archivedEvidence = '| 2026-07-01 | spec | Archived event [private](private-ref-tuple.md) | archived verification | archived docs | none |\n';
  const archiveDigest = createHash('sha256').update(archivedEvidence).digest('hex');
  write('specs/S-004-archived/GROUNDING_PRE_R5.md', archivedEvidence);
  write('specs/S-004-archived/SPEC.md', archivedFixtureSpec(archiveDigest, Buffer.byteLength(archivedEvidence)));
  render(root);
  const hotBeforeArchiveRead = read('specs/S-004-archived/SPEC.md');
  const archiveBeforeRead = read('specs/S-004-archived/GROUNDING_PRE_R5.md');
  const shownArchived = showSpec(root, 'S-004');
  assert.match(shownArchived.body, /Archived event/, 'show must reconstruct archived evidence');
  assert.doesNotMatch(shownArchived.body, /grounding-archive:v1/, 'show exposes the logical Spec, not its storage declaration');
  const archivedDoctor = doctor(root);
  assert.deepEqual(archivedDoctor, [], 'doctor must retain reconstructed lifecycle semantics without scanning archived link targets');
  assert.doesNotMatch(JSON.stringify(archivedDoctor), /private-ref-tuple\.md/, 'doctor must never echo an archived missing link target');
  fs.writeFileSync(
    path.join(root, 'specs/S-004-archived/SPEC.md'),
    hotBeforeArchiveRead.replace('\n## Completion Result', '\n[hot missing](missing-hot-ref.md)\n\n## Completion Result')
  );
  const hotLinkIssues = doctor(root);
  assert.ok(hotLinkIssues.some((issue) => issue.code === 'broken-link' && issue.message.includes('missing-hot-ref.md')));
  assert.doesNotMatch(JSON.stringify(hotLinkIssues), /private-ref-tuple\.md/, 'hot-link diagnostics must not expose archive-only targets');
  fs.writeFileSync(path.join(root, 'specs/S-004-archived/SPEC.md'), hotBeforeArchiveRead);
  assert.equal(read('specs/S-004-archived/SPEC.md'), hotBeforeArchiveRead, 'read-only Workbench commands must not rewrite the hot Spec');
  assert.equal(read('specs/S-004-archived/GROUNDING_PRE_R5.md'), archiveBeforeRead, 'read-only Workbench commands must not rewrite the archive');
  completeSpec(root, 'S-004', { date: '2026-07-13' });
  assert.match(read('specs/S-004-archived/SPEC.md'), /grounding-archive:v1/, 'completion must write only the hot Spec');
  assert.doesNotMatch(read('specs/S-004-archived/SPEC.md'), /Archived event/, 'completion must not inline archived bytes');
  assert.match(showSpec(root, 'S-004').body, /Archived event[\s\S]*Spec completed/, 'completion must retain archive plus hot evidence semantics');
  render(root);

  const archivedCanon = [
    '## Canon Issuance — Job Order ABC129 / R1',
    '',
    'Historical archived [canon](missing-canon-archive-ref.md) remains logical only.',
    ''
  ].join('\n');
  const canonDigest = createHash('sha256').update(archivedCanon).digest('hex');
  write('specs/S-005-canon/CANON_PRE_R7.md', archivedCanon);
  write('specs/S-005-canon/SPEC.md', canonArchivedFixtureSpec(canonDigest, Buffer.byteLength(archivedCanon)));
  render(root);
  const hotBeforeCanonRead = read('specs/S-005-canon/SPEC.md');
  const canonArchiveBeforeRead = read('specs/S-005-canon/CANON_PRE_R7.md');
  const shownCanon = showSpec(root, 'S-005');
  assert.match(shownCanon.body, /Historical archived \[canon\]\(missing-canon-archive-ref\.md\) remains logical only\./, 'show must reconstruct archived Canon');
  assert.match(shownCanon.body, /This fixture mentions `canon-archive:v1` in prose/, 'show must preserve ordinary prose mentions of the archive schema');
  assert.doesNotMatch(shownCanon.body, /<!-- canon-archive:v1/, 'show exposes logical Canon, not the storage declaration');
  const canonDoctor = doctor(root);
  assert.deepEqual(canonDoctor, [], 'doctor must retain logical Canon without scanning archive-only link targets');
  assert.doesNotMatch(JSON.stringify(canonDoctor), /missing-canon-archive-ref\.md/, 'doctor must not expose archive-only Canon links');
  fs.writeFileSync(
    path.join(root, 'specs/S-005-canon/SPEC.md'),
    hotBeforeCanonRead.replace('\n## Completion Result', '\n[hot canon missing](missing-hot-canon-ref.md)\n\n## Completion Result')
  );
  const canonHotIssues = doctor(root);
  assert.ok(canonHotIssues.some((issue) => issue.code === 'broken-link' && issue.message.includes('missing-hot-canon-ref.md')));
  assert.doesNotMatch(JSON.stringify(canonHotIssues), /missing-canon-archive-ref\.md/, 'hot-link diagnostics must remain physical even with archived Canon');
  fs.writeFileSync(path.join(root, 'specs/S-005-canon/SPEC.md'), hotBeforeCanonRead);
  assert.equal(read('specs/S-005-canon/SPEC.md'), hotBeforeCanonRead, 'read-only Workbench commands must not rewrite the hot Canon Spec');
  assert.equal(read('specs/S-005-canon/CANON_PRE_R7.md'), canonArchiveBeforeRead, 'read-only Workbench commands must not rewrite the archived Canon');
  assert.match(
    loadSpecEvidence({ root, specFilePath: path.join(root, 'specs/S-004-archived/SPEC.md') }).logicalText,
    /Archived event/,
    'grounding archive reconstruction remains unchanged while Canon ordering tightens'
  );

  const orderedCanon = [
    '## Canon Issuance — Job Order ABC130 / R1',
    '',
    'Older archived Canon remains historical.',
    ''
  ].join('\n');
  const orderedDigest = createHash('sha256').update(orderedCanon).digest('hex');
  write('specs/S-006-canon-ordered/CANON_PRE_R7.md', orderedCanon);
  write(
    'specs/S-006-canon-ordered/SPEC.md',
    canonArchivedFixtureSpec(orderedDigest, Buffer.byteLength(orderedCanon), {
      specId: 'S-006',
      specFuid: '000009',
      ticketFuid: '00000A',
      archiveFirst: 'JO-ABC130/R1',
      archiveLast: 'JO-ABC130/R1',
      hotIssuances: [
        { orderFuid: 'ABC130', revision: 'R2', body: 'Second hot Canon remains visible.' },
        { orderFuid: 'ABC130', revision: 'R3', body: 'Latest hot Canon remains visible.' }
      ]
    })
  );
  assert.equal(
    loadSpecEvidence({ root, specFilePath: path.join(root, 'specs/S-006-canon-ordered/SPEC.md') }).archives[0].lastIdentity,
    'JO-ABC130/R1',
    'older archived same-order revisions remain valid when later hot revisions stay visible'
  );
  fs.rmSync(path.join(root, 'specs/S-006-canon-ordered'), { recursive: true, force: true });

  const misorderedCanon = [
    '## Canon Issuance — Job Order ABC130 / R3',
    '',
    'This newer archived Canon must be rejected.',
    ''
  ].join('\n');
  const misorderedDigest = createHash('sha256').update(misorderedCanon).digest('hex');
  write('specs/S-007-canon-misordered/CANON_PRE_R7.md', misorderedCanon);
  write(
    'specs/S-007-canon-misordered/SPEC.md',
    canonArchivedFixtureSpec(misorderedDigest, Buffer.byteLength(misorderedCanon), {
      specId: 'S-007',
      specFuid: '00000B',
      ticketFuid: '00000C',
      archiveFirst: 'JO-ABC130/R3',
      archiveLast: 'JO-ABC130/R3',
      hotIssuances: [
        { orderFuid: 'ABC130', revision: 'R1', body: 'Older hot Canon remains visible.' },
        { orderFuid: 'ABC130', revision: 'R2', body: 'Newer hot Canon remains visible.' }
      ]
    })
  );
  assert.throws(
    () => loadSpecEvidence({ root, specFilePath: path.join(root, 'specs/S-007-canon-misordered/SPEC.md') }),
    (error) => error?.code === 'archive.protected-section',
    'archived Canon must not move a newer/current issuance behind older hot Canon'
  );
  fs.rmSync(path.join(root, 'specs/S-007-canon-misordered'), { recursive: true, force: true });

  fs.writeFileSync(
    path.join(root, 'specs/S-001-fixture/SPEC.md'),
    validCompleted.replace('node test \\| tee proof.log', 'pending')
  );
  assert.ok(doctor(root).some((issue) => issue.code === 'missing-evidence'));
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), validCompleted);

  const malformed = validCompleted.replace(
    '| TK-001 | 000002 | First slice | done | none | 2026-07-10 | 2026-07-12 | node test \\| tee proof.log |',
    '| TK-001 | 000002 | First slice | in-progress | none | broken | extra |'
  );
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), malformed);
  assert.throws(
    () => closeTicket(root, 'S-001', {
      proof: 'must not persist',
      docs: 'Docs checked; no update needed',
      remainingGap: 'none',
      date: '2026-07-12'
    }),
    /malformed ticket row/,
    'malformed ticket rows should be reported explicitly'
  );
  assert.equal(
    read('specs/S-001-fixture/SPEC.md'),
    malformed,
    'a rejected malformed row must not partially persist a close operation'
  );
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), validCompleted);

  fs.writeFileSync(
    path.join(root, 'TASKBOARD.md'),
    read('TASKBOARD.md').replace('| Spec FUID |', '| Drifted |')
  );
  assert.ok(doctor(root).some((issue) => issue.code === 'render-drift'));
  render(root);

  write('specs/S-999-duplicate/SPEC.md', fixtureSpec());
  assert.ok(doctor(root).some((issue) => issue.code === 'duplicate-id'));
  fs.rmSync(path.join(root, 'specs/S-999-duplicate'), { recursive: true });

  write('specs/S-003-legacy/SPEC.md', legacyFixtureSpec());
  assert.equal(nextWork(root)?.specId, 'S-003', 'legacy typed references remain readable during migration');
  assert.ok(doctor(root).some((issue) => issue.code === 'missing-fuid'), 'doctor fails closed until legacy metadata is migrated');
  fs.rmSync(path.join(root, 'specs/S-003-legacy'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'specs/S-001-fixture/SPEC.md'),
    validCompleted.replace('**Created:** 2026-07-10', '**Created:** 2026-07-14')
  );
  assert.ok(doctor(root).some((issue) => issue.code === 'date-order'));
  fs.writeFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), validCompleted);

  fs.appendFileSync(path.join(root, 'specs/S-001-fixture/SPEC.md'), '\n[missing](../../missing.md)\n');
  assert.ok(doctor(root).some((issue) => issue.code === 'broken-link'));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}


// --- Spec-root resolution (V3 lane move) ----------------------------------
//
// The V3 move relocated specs to the manifest-declared `workbench/specs`
// lane. `loadSpecs` still joined `<root>/specs`, found nothing, and returned
// an empty list, so `next` reported "no work" and `render` blanked the
// generated catalog and hot board it could no longer account for. A missing
// spec root is a misconfiguration and must fail loudly; a declared-but-empty
// spec root is a legitimately new workspace and must stay quiet.

function scratchRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-root-'));
  fs.writeFileSync(
    path.join(dir, 'BLUEPRINT.md'),
    '# Fixture Blueprint\n\n<!-- spec-catalog:start -->\n<!-- spec-catalog:end -->\n'
  );
  fs.writeFileSync(
    path.join(dir, 'TASKBOARD.md'),
    '# Fixture Taskboard\n\n<!-- hot-specs:start -->\n<!-- hot-specs:end -->\n'
  );
  return dir;
}

function seedSpec(dir, relativeSpecsRoot) {
  const target = path.join(dir, relativeSpecsRoot, 'S-001-fixture', 'SPEC.md');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fixtureSpec());
}

const manifestRoot = scratchRoot();
try {
  fs.mkdirSync(path.join(manifestRoot, 'workbench'), { recursive: true });
  fs.writeFileSync(
    path.join(manifestRoot, 'workbench/manifest.json'),
    JSON.stringify({ schemaVersion: 1, lanes: { specs: 'workbench/specs' } })
  );
  seedSpec(manifestRoot, 'workbench/specs');
  assert.equal(
    nextWork(manifestRoot)?.specId,
    'S-001',
    'the manifest-declared specs lane must be the spec root'
  );
  assert.equal(
    showSpec(manifestRoot, 'S-001').id,
    'S-001',
    'show must resolve specs through the manifest lane'
  );
  render(manifestRoot);
  assert.match(
    fs.readFileSync(path.join(manifestRoot, 'TASKBOARD.md'), 'utf8'),
    /S-001/,
    'render must project specs found through the manifest lane'
  );
} finally {
  fs.rmSync(manifestRoot, { recursive: true, force: true });
}

const legacyRoot = scratchRoot();
try {
  seedSpec(legacyRoot, 'specs');
  assert.equal(
    nextWork(legacyRoot)?.specId,
    'S-001',
    'a root without a manifest must still resolve the legacy specs/ layout'
  );
} finally {
  fs.rmSync(legacyRoot, { recursive: true, force: true });
}

const missingRoot = scratchRoot();
try {
  assert.throws(
    () => nextWork(missingRoot),
    /spec root/i,
    'a missing spec root is a misconfiguration and must throw, not report no work'
  );
  assert.throws(
    () => render(missingRoot),
    /spec root/i,
    'render must refuse to project a spec root it cannot find'
  );
  assert.match(
    fs.readFileSync(path.join(missingRoot, 'BLUEPRINT.md'), 'utf8'),
    /<!-- spec-catalog:start -->\n<!-- spec-catalog:end -->/,
    'a refused render must leave the generated region untouched'
  );
} finally {
  fs.rmSync(missingRoot, { recursive: true, force: true });
}

const emptyRoot = scratchRoot();
try {
  fs.mkdirSync(path.join(emptyRoot, 'specs'), { recursive: true });
  assert.equal(
    nextWork(emptyRoot),
    null,
    'a declared but empty spec root is a new workspace, not a misconfiguration'
  );
} finally {
  fs.rmSync(emptyRoot, { recursive: true, force: true });
}

console.log('ok - spec workbench lifecycle, rendering, and doctor self-test passed');

function fixtureSpec() {
  return [
    '# S-001 - Fixture Capability',
    '',
    '**Spec ID:** S-001',
    '**FUID:** 000001',
    '**Status:** active',
    '**Priority:** 0',
    '**Owner:** agent',
    '**Created:** 2026-07-10',
    '**Last worked:** 2026-07-11',
    '**Updated:** 2026-07-11',
    '**Catalog description:** Proves the fixture lifecycle.',
    '**Blockers:** none',
    '**Latest event:** Spec activated.',
    '**Next gate:** Complete TK-001.',
    '',
    '## Vertical Implementation Slices',
    '',
    '| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |',
    '|---|---|---|---|---|---|---|---|',
    '| TK-001 | 000002 | First slice | ready | none | 2026-07-10 | 2026-07-11 | pending |',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Expected behavior is verified.',
    '',
    '## Append-Only Evidence And Execution Log',
    '',
    '| Date | Ticket | Event | Verification | Docs | Remaining gap |',
    '|---|---|---|---|---|---|',
    '',
    '## Completion Result',
    '',
    'Pending.',
    '',
    '## Supersession',
    '',
    '- Supersedes: none',
    '- Superseded by: none',
    ''
  ].join('\n');
}

function legacyFixtureSpec() {
  return fixtureSpec()
    .replaceAll('S-001', 'S-003')
    .replace('**FUID:** 000001\n', '')
    .replace('**Created:** 2026-07-10\n', '')
    .replace('**Last worked:** 2026-07-11\n', '')
    .replace('| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |', '| Ticket | Slice | Status | Blockers | Proof |')
    .replace('|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|')
    .replace('| TK-001 | 000002 | First slice | ready | none | 2026-07-10 | 2026-07-11 | pending |', '| TK-001 | First slice | ready | none | pending |');
}

function archivedFixtureSpec(digest, bytes) {
  return fixtureSpec()
    .replaceAll('S-001', 'S-004')
    .replaceAll('000001', '000005')
    .replaceAll('000002', '000006')
    .replace('**Status:** active', '**Status:** active')
    .replace('| TK-001 | 000006 | First slice | ready | none | 2026-07-10 | 2026-07-11 | pending |', '| TK-001 | 000006 | First slice | done | none | 2026-07-10 | 2026-07-12 | archived proof |')
    .replace('- [ ] Expected behavior is verified.', '- [x] Expected behavior is verified.')
    .replace('## Completion Result\n\nPending.', '## Completion Result\n\nPass: archived evidence is sufficient.')
    .replace(
      '|---|---|---|---|---|---|\n\n## Completion Result',
      `|---|---|---|---|---|---|\n<!-- grounding-archive:v1 path=GROUNDING_PRE_R5.md rows=1 bytes=${bytes} sha256=${digest} -->\n\n## Completion Result`
    );
}

function canonArchivedFixtureSpec(digest, bytes, {
  specId = 'S-005',
  specFuid = '000007',
  ticketFuid = '000008',
  archiveFirst = 'JO-ABC129/R1',
  archiveLast = 'JO-ABC129/R1',
  hotIssuances = [
    { orderFuid: 'ABC130', revision: 'R2', body: 'Current hot Canon remains visible.' }
  ]
} = {}) {
  return fixtureSpec()
    .replaceAll('S-001', specId)
    .replaceAll('000001', specFuid)
    .replaceAll('000002', ticketFuid)
    .replace(
      '## Vertical Implementation Slices',
      [
        ...hotIssuances.flatMap(({ orderFuid, revision, body }) => [
          `## Canon Issuance — Job Order ${orderFuid} / ${revision}`,
          '',
          body,
          ''
        ]),
        'This fixture mentions `canon-archive:v1` in prose without creating a second declaration.',
        '',
        `<!-- canon-archive:v1 path=CANON_PRE_R7.md bytes=${bytes} sha256=${digest} first=${archiveFirst} last=${archiveLast} -->`,
        '',
        '## Vertical Implementation Slices'
      ].join('\n')
    );
}

function write(relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
