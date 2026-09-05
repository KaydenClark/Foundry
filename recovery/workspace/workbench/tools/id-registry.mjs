#!/usr/bin/env node
// Typed stable-ID registry check (S-008 TK-005). Validates the ID namespace
// in Wiki/Machine/Project Source Registry.md: every enrolled ID is unique and
// never reused across types, every row resolves to a current name, on-disk
// canonical sources exist, and socket bindings reference enrolled IDs.
import fs from 'node:fs';
import path from 'node:path';

export const ID_PATTERN = /^(P|F|C|K|M)-\d{3}$/;

export function parseIdRows(body) {
  // Any markdown table row whose first cell is a typed ID.
  const rows = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).slice(1, -1);
    if (!cells.length) continue;
    const id = cells[0].replace(/`/g, '');
    if (ID_PATTERN.test(id)) rows.push({ id, cells });
  }
  return rows;
}

export function checkRegistry(body, { root } = {}) {
  const errors = [];
  const rows = parseIdRows(body);
  if (!rows.length) errors.push('no typed IDs enrolled');

  const seen = new Map();
  for (const { id } of rows) seen.set(id, (seen.get(id) || 0) + 1);
  for (const [id, count] of seen) {
    if (count > 1) errors.push(`duplicate ID: ${id} enrolled ${count} times`);
  }

  for (const { id, cells } of rows) {
    const name = cells[1] || '';
    if (!name || name === '—' || name === '-') {
      errors.push(`${id} does not resolve to a current name`);
    }
    const sourceCell = (cells[2] || '').replace(/`/g, '');
    if (root && sourceCell.startsWith('/')) {
      if (!fs.existsSync(sourceCell)) errors.push(`${id} canonical source missing: ${sourceCell}`);
    }
  }

  // Socket bindings (K rows): a bound entity reference must be an enrolled ID.
  const enrolled = new Set(rows.map((r) => r.id));
  for (const { id, cells } of rows) {
    if (!id.startsWith('K-')) continue;
    const binding = cells[3] || '';
    const ref = binding.match(/\b([PFCKM]-\d{3})\b/);
    if (ref && !enrolled.has(ref[1])) {
      errors.push(`${id} binds unenrolled entity ${ref[1]}`);
    } else if (!ref && !/planned/i.test(binding)) {
      errors.push(`${id} has no bound entity and is not marked planned`);
    }
  }

  return { errors, count: rows.length };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedDirectly) {
  if (process.argv[2] !== 'check') {
    console.error('Usage: id-registry.mjs check [--registry PATH]');
    process.exit(2);
  }
  const flag = process.argv.indexOf('--registry');
  const registry =
    flag !== -1
      ? path.resolve(process.argv[flag + 1])
      : '/ABSOLUTE/WORKSPACE/Wiki/Machine/Project Source Registry.md';
  let body;
  try {
    body = fs.readFileSync(registry, 'utf8');
  } catch (err) {
    console.error(`error: cannot read registry ${registry}: ${err.message}`);
    process.exit(2);
  }
  const { errors, count } = checkRegistry(body, { root: path.dirname(registry) });
  for (const e of errors) console.error(`error: ${e}`);
  console.log(`${errors.length ? 'fail' : 'ok'} - id registry: ${count} IDs enrolled, ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
