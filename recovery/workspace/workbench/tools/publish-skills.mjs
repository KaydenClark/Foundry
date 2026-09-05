#!/usr/bin/env node
// Package legacy Forge skills into an inert generated directory.
//
// Custom-skill discovery is owned exclusively by ~/.agents/skills. This legacy
// release helper may reproduce a Forge package for explicit downstream use,
// but it never creates, removes, or repoints Claude or Codex discovery paths.
// It archives skills/ from a named Forge git ref into WORKSPACE/Foundry/Skills;
// the shared checkout's working tree is never read or switched.
//
// The source ref is the one dangerous input: this script rm -rf's the whole
// live catalog before swapping in what it extracted, and on 2026-07-25 a
// publish from a wrong ref destroyed both agents' catalogs. So there is no
// default ref and no branch name frozen in this file (S-023 TK-007). The ref
// is either explicit or provably the identity operation:
//
//   node tools/publish-skills.mjs <ref>   advance the catalog to <ref>
//   node tools/publish-skills.mjs         republish exactly what is live,
//                                         from the ref AND commit recorded in
//                                         the generated PUBLISHED.md
//
// A bare run is the repair path (restore a clobbered catalog or dangling
// links), so it must reproduce what is live rather than move it. If the
// record is missing or unparseable, or if the recorded ref has since moved
// off the recorded commit, the bare form fails closed and asks for an
// explicit ref — advancing is always deliberate.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORGE = '/ABSOLUTE/WORKSPACE/Foundry/Halls/Forge';
const DEST = '/ABSOLUTE/WORKSPACE/Foundry/Skills';
const PUBLISHED_FILE = path.join(DEST, 'PUBLISHED.md');

const USAGE =
  'Usage: node tools/publish-skills.mjs [ref]\n' +
  '  With <ref>: publish that ref (advancing the catalog is always explicit).\n' +
  '  Without:    republish exactly what is already live, from the ref and\n' +
  '              commit recorded in Foundry/Skills/PUBLISHED.md.';

function git(...args) {
  return execFileSync('git', ['-C', FORGE, ...args], { encoding: 'utf8' }).trim();
}

function resolveRefWithGit(ref) {
  return git('rev-parse', '--verify', `${ref}^{commit}`);
}

/** Read `Source ref:` / `Source commit:` out of a generated PUBLISHED.md body. */
export function parsePublishedRecord(text) {
  const ref = /^Source ref:[ \t]*(\S+)[ \t]*$/m.exec(text)?.[1] ?? null;
  const commit = /^Source commit:[ \t]*([0-9a-f]{7,40})[ \t]*$/m.exec(text)?.[1] ?? null;
  if (!ref && !commit) return null;
  return { ref, commit };
}

/**
 * Decide which ref and commit to publish, or throw with a named reason.
 * Never falls back to a hardcoded branch: the answer is the argument, or the
 * live record proven unmoved, or a failure.
 */
export function resolvePublishSource({
  argRef = null,
  publishedPath = PUBLISHED_FILE,
  resolveRef = resolveRefWithGit,
} = {}) {
  if (argRef) {
    let commit;
    try {
      commit = resolveRef(argRef);
    } catch (error) {
      throw new Error(`ref ${argRef} does not resolve in ${FORGE}: ${error.message}`);
    }
    return { ref: argRef, commit, source: 'argument' };
  }

  let body;
  try {
    body = fs.readFileSync(publishedPath, 'utf8');
  } catch (error) {
    throw new Error(
      `no ref given and ${publishedPath} is unreadable (${error.code || error.message}), ` +
        `so there is nothing proving what is currently live.\n${USAGE}`,
    );
  }

  const record = parsePublishedRecord(body);
  if (!record || !record.ref) {
    throw new Error(`${publishedPath} records no source ref.\n${USAGE}`);
  }
  if (!record.commit) {
    throw new Error(
      `${publishedPath} records ref ${record.ref} but no source commit, so a bare run ` +
        `cannot prove it would republish what is live.\n${USAGE}`,
    );
  }

  let current;
  try {
    current = resolveRef(record.ref);
  } catch (error) {
    throw new Error(
      `recorded ref ${record.ref} no longer resolves in ${FORGE} (${error.message}).\n${USAGE}`,
    );
  }

  if (current !== record.commit) {
    throw new Error(
      `recorded ref ${record.ref} has moved: PUBLISHED.md records ` +
        `${record.commit.slice(0, 7)} but it now resolves to ${current.slice(0, 7)}. ` +
        'A bare run would advance the catalog instead of reproducing it. ' +
        `Pass the ref explicitly to advance deliberately.\n${USAGE}`,
    );
  }

  return { ref: record.ref, commit: record.commit, source: 'published' };
}

function publish({ ref, commit }) {
  // Archive the resolved commit, not the ref name: the ref cannot move out
  // from under us between resolution and extraction.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-publish-'));
  let skills;
  try {
    const tarFile = path.join(staging, 'skills.tar');
    fs.writeFileSync(
      tarFile,
      execFileSync('git', ['-C', FORGE, 'archive', commit, 'skills'], { maxBuffer: 256 * 1024 * 1024 }),
    );
    execFileSync('tar', ['-xf', tarFile, '-C', staging]);
    const extracted = path.join(staging, 'skills');
    if (!fs.existsSync(extracted)) {
      throw new Error(`ref ${ref} (${commit.slice(0, 7)}) has no skills/ directory`);
    }

    fs.rmSync(DEST, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(DEST), { recursive: true });
    fs.renameSync(extracted, DEST);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }

  skills = fs
    .readdirSync(DEST, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  fs.writeFileSync(
    PUBLISHED_FILE,
    [
      '# Published Skills (generated — do not edit)',
      '',
      `Source ref: ${ref}`,
      `Source commit: ${commit}`,
      '',
      'Regenerate with: node /ABSOLUTE/WORKSPACE/tools/publish-skills.mjs',
      'A bare run republishes exactly this ref and commit. Pass a ref argument',
      'to advance the catalog to a different one.',
      'This is an inert release package. Claude and Codex discover custom',
      'skills only from ~/.agents/skills and never from this directory.',
      '',
    ].join('\n'),
  );

  return { skills };
}

function main() {
  const argRef = process.argv[2] || null;
  if (argRef === '--help' || argRef === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  let source;
  try {
    // Resolve first so a bad or drifted ref fails before anything is touched.
    source = resolvePublishSource({ argRef });
  } catch (error) {
    console.error(`BLOCKED - ${error.message}`);
    process.exit(1);
  }

  if (source.source === 'published') {
    console.log(`No ref given; republishing what is already live: ${source.ref} (${source.commit.slice(0, 7)})`);
  }

  const { skills } = publish(source);

  console.log(
    `Published ${skills.length} skills from ${source.ref} (${source.commit.slice(0, 7)}) to ${DEST}`,
  );
  console.log('Discovery unchanged: Claude and Codex continue to use ~/.agents/skills');
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
