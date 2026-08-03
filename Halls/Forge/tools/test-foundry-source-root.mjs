#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_CONTRACT_PATH,
  classifyPath,
  inventoryRef,
  loadContract,
  validateContract
} from './foundry-source-root.mjs';

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${name}`);
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function write(root, path, body = 'fixture\n') {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, body);
}

function makeRepo(contract) {
  const root = mkdtempSync(join(tmpdir(), 'foundry-source-root-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Foundry Source Root Test']);
  git(root, ['config', 'user.email', 'foundry-source-root@example.invalid']);
  write(root, 'Foundry/source-root.json', `${JSON.stringify(contract, null, 2)}\n`);
  write(root, 'Foundry/Halls/Forge/AGENTS.md');
  write(root, 'Foundry/Halls/Forge/.env.example', 'EXAMPLE_ONLY=1\n');
  write(root, 'Foundry/Wiki/README.md');
  git(root, ['add', 'Foundry']);
  git(root, ['commit', '-qm', 'allowed tree']);
  return root;
}

const contract = loadContract(DEFAULT_CONTRACT_PATH);

ok('shipped source-root contract validates', () => {
  assert.deepEqual(validateContract(contract), []);
});

ok('Hall source maps to its product-relative path', () => {
  const hall = classifyPath(contract, 'Foundry/Halls/Forge/AGENTS.md');
  assert.equal(hall.included, true);
  assert.equal(hall.productPath, 'Halls/Forge/AGENTS.md');
  assert.equal(hall.category, 'hall-source');
});

ok('Schematic app source maps to the public product without generated output', () => {
  const source = classifyPath(contract, 'Foundry/Schematic/src/App.jsx');
  assert.equal(source.included, true);
  assert.equal(source.productPath, 'Schematic/src/App.jsx');
  assert.equal(source.category, 'schematic-source');

  const dependency = classifyPath(contract, 'Foundry/Schematic/node_modules/react/index.js');
  assert.equal(dependency.included, false);
  assert.equal(dependency.reason, 'runtime-segment');

  const build = classifyPath(contract, 'Foundry/Schematic/dist/index.html');
  assert.equal(build.included, false);
  assert.equal(build.reason, 'runtime-segment');
});

ok('generated, private, runtime, and secret paths fail closed', () => {
  const cases = [
    ['Foundry/Skills/PUBLISHED.md', 'generated-skills'],
    ['Foundry/.worktrees/task/HEAD', 'worktrees'],
    ['Foundry/Wiki/Kayden/Profile.md', 'private-wiki'],
    ['Foundry/Halls/Forge/node_modules/pkg/index.js', 'runtime-segment'],
    ['Foundry/Halls/Forge/runtime/state.json', 'runtime-segment'],
    ['Foundry/Halls/Forge/Secrets/api.txt', 'runtime-segment'],
    ['Foundry/Halls/Forge/.env', 'secret-file'],
    ['Foundry/Halls/Forge/.ENV', 'secret-file'],
    ['Foundry/Halls/Forge/private.key', 'secret-suffix'],
    ['Foundry/Halls/Forge/PRIVATE.KEY', 'secret-suffix'],
    ['Foundry/unknown.txt', 'unclassified-producer-path']
  ];
  for (const [path, reason] of cases) {
    const result = classifyPath(contract, path);
    assert.equal(result.included, false, path);
    assert.equal(result.prohibited, true, path);
    assert.equal(result.reason, reason, path);
  }

  const rootPrivate = classifyPath(contract, 'Wiki/Kayden/Profile.md');
  assert.equal(rootPrivate.included, false);
  assert.equal(rootPrivate.prohibited, false);
  assert.equal(rootPrivate.reason, 'outside-producer-root');

  assert.equal(classifyPath(contract, 'Foundry/Halls/Forge/.env.example').included, true);

  const moduleSource = classifyPath(contract, 'Foundry/Modules/OpenBrain/README.md');
  assert.equal(moduleSource.included, false);
  assert.equal(moduleSource.prohibited, false);
  assert.equal(moduleSource.reason, 'producer-only-modules');
});

ok('immutable inventory reports exact included product paths', () => {
  const root = makeRepo(contract);
  try {
    const allowedSha = git(root, ['rev-parse', 'HEAD']);
    const report = inventoryRef({ repoRoot: root, ref: allowedSha });
    assert.equal(report.producerSha, allowedSha);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.productPaths, [
      'Halls/Forge/.env.example',
      'Halls/Forge/AGENTS.md',
      'Wiki/README.md',
      'source-root.json'
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

ok('immutable inventory permits a declared tracked producer-only prefix without publishing it', () => {
  const producerContract = {
    ...contract,
    excludedPrefixes: [{ path: 'Foundry/Modules/', reason: 'producer-only-modules' }],
    prohibitedPrefixes: contract.prohibitedPrefixes.filter((entry) => entry.path !== 'Foundry/Modules/')
  };
  const root = makeRepo(producerContract);
  try {
    write(root, 'Foundry/Modules/OpenBrain/README.md');
    git(root, ['add', 'Foundry/Modules/OpenBrain/README.md']);
    git(root, ['commit', '-qm', 'track producer-only module source']);
    const report = inventoryRef({ repoRoot: root, ref: 'HEAD' });
    assert.deepEqual(report.errors, []);
    assert.equal(report.productPaths.includes('Modules/OpenBrain/README.md'), false);
    assert.equal(report.excludedPaths, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

ok('immutable inventory rejects a tracked prohibited path', () => {
  const root = makeRepo(contract);
  try {
    write(root, 'Foundry/Wiki/Kayden/Profile.md');
    git(root, ['add', 'Foundry/Wiki/Kayden/Profile.md']);
    git(root, ['commit', '-qm', 'plant prohibited private wiki path']);
    const report = inventoryRef({ repoRoot: root, ref: 'HEAD' });
    assert.ok(report.errors.some((error) => error.includes('Foundry/Wiki/Kayden/Profile.md')));
    assert.ok(report.errors.some((error) => error.includes('private-wiki')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\nfoundry-source-root: ${passed} checks passed`);
