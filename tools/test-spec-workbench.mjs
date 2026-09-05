#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  claimWork,
  closeTicket,
  completeSpec,
  doctor,
  nextWork,
  parseCliArgs,
  render
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
    read('TASKBOARD.md').replace('No active slice', 'Stale active state')
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

function write(relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
