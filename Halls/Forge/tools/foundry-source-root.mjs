#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(HERE, '../../../..');
export const DEFAULT_CONTRACT_REPO_PATH = 'Foundry/source-root.json';
export const DEFAULT_CONTRACT_PATH = path.join(DEFAULT_REPO_ROOT, DEFAULT_CONTRACT_REPO_PATH);

function stringArray(value, label, errors) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return [];
  }
  return value;
}

function normalizedRepoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) return null;
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) return null;
  return normalized;
}

export function loadContract(contractPath = DEFAULT_CONTRACT_PATH) {
  return JSON.parse(fs.readFileSync(contractPath, 'utf8'));
}

export function validateContract(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return ['contract must be an object'];
  }
  if (contract.schemaVersion !== '1.0') errors.push("schemaVersion must be '1.0'");
  if (!normalizedRepoPath(contract.producerRoot) || contract.producerRoot.includes('/')) {
    errors.push('producerRoot must be one top-level relative directory');
  }
  if (contract.productPathMode !== 'strip-producer-root') {
    errors.push("productPathMode must be 'strip-producer-root'");
  }

  if (!Array.isArray(contract.includeRules) || contract.includeRules.length === 0) {
    errors.push('includeRules must be a non-empty array');
  } else {
    const categories = new Set();
    for (const [index, rule] of contract.includeRules.entries()) {
      const label = `includeRules[${index}]`;
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      if (typeof rule.category !== 'string' || rule.category.length === 0) {
        errors.push(`${label}.category must be a non-empty string`);
      } else if (categories.has(rule.category)) {
        errors.push(`duplicate include category '${rule.category}'`);
      } else {
        categories.add(rule.category);
      }
      const files = rule.files === undefined ? [] : stringArray(rule.files, `${label}.files`, errors);
      const prefixes = rule.prefixes === undefined ? [] : stringArray(rule.prefixes, `${label}.prefixes`, errors);
      if (files.length + prefixes.length === 0) errors.push(`${label} must declare files or prefixes`);
      for (const candidate of [...files, ...prefixes]) {
        if (!normalizedRepoPath(candidate) || !candidate.startsWith(`${contract.producerRoot}/`)) {
          errors.push(`${label} path '${candidate}' must be relative to ${contract.producerRoot}/`);
        }
      }
    }
  }

  for (const key of ['excludedPrefixes', 'prohibitedPrefixes']) {
    const entries = key === 'excludedPrefixes' && contract[key] === undefined ? [] : contract[key];
    if (!Array.isArray(entries)) {
      errors.push(`${key} must be an array`);
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.reason !== 'string') {
        errors.push(`${key}[${index}] must carry string path and reason`);
      } else if (!normalizedRepoPath(entry.path) || !entry.path.startsWith(`${contract.producerRoot}/`)) {
        errors.push(`${key}[${index}].path must be relative to ${contract.producerRoot}/`);
      }
    }
  }

  for (const key of ['runtimeSegments', 'allowedBasenames', 'secretBasenames', 'secretNamePrefixes', 'prohibitedSuffixes']) {
    stringArray(contract[key], key, errors);
  }
  return errors;
}

export function classifyPath(contract, candidate) {
  const contractErrors = validateContract(contract);
  if (contractErrors.length) throw new Error(`invalid source-root contract: ${contractErrors.join('; ')}`);
  const repoPath = normalizedRepoPath(candidate);
  if (!repoPath) return { included: false, prohibited: true, reason: 'invalid-path', sourcePath: candidate };

  const rootPrefix = `${contract.producerRoot}/`;
  if (!repoPath.startsWith(rootPrefix)) {
    return { included: false, prohibited: false, reason: 'outside-producer-root', sourcePath: repoPath };
  }

  for (const entry of contract.prohibitedPrefixes) {
    if (repoPath.startsWith(entry.path)) {
      return { included: false, prohibited: true, reason: entry.reason, sourcePath: repoPath };
    }
  }

  for (const entry of contract.excludedPrefixes ?? []) {
    if (repoPath.startsWith(entry.path)) {
      return { included: false, prohibited: false, reason: entry.reason, sourcePath: repoPath };
    }
  }

  const segments = repoPath.split('/');
  const runtimeSegments = new Set(contract.runtimeSegments.map((segment) => segment.toLowerCase()));
  if (segments.some((segment) => runtimeSegments.has(segment.toLowerCase()))) {
    return { included: false, prohibited: true, reason: 'runtime-segment', sourcePath: repoPath };
  }

  const basename = segments.at(-1);
  const normalizedBasename = basename.toLowerCase();
  const explicitlyAllowed = contract.allowedBasenames.includes(basename);
  if (!explicitlyAllowed && (
    contract.secretBasenames.some((secretBasename) => normalizedBasename === secretBasename.toLowerCase()) ||
    contract.secretNamePrefixes.some((prefix) => normalizedBasename.startsWith(prefix.toLowerCase()))
  )) {
    return { included: false, prohibited: true, reason: 'secret-file', sourcePath: repoPath };
  }
  if (!explicitlyAllowed && contract.prohibitedSuffixes.some((suffix) => normalizedBasename.endsWith(suffix.toLowerCase()))) {
    return { included: false, prohibited: true, reason: 'secret-suffix', sourcePath: repoPath };
  }

  for (const rule of contract.includeRules) {
    if (rule.files?.includes(repoPath) || rule.prefixes?.some((prefix) => repoPath.startsWith(prefix))) {
      return {
        included: true,
        prohibited: false,
        reason: 'included',
        category: rule.category,
        sourcePath: repoPath,
        productPath: repoPath.slice(rootPrefix.length)
      };
    }
  }

  return { included: false, prohibited: true, reason: 'unclassified-producer-path', sourcePath: repoPath };
}

function gitText(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

function gitBuffer(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    const detail = Buffer.concat([
      result.stderr ?? Buffer.alloc(0),
      result.stdout ?? Buffer.alloc(0)
    ]).toString('utf8').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout;
}

export function inventoryRef({ repoRoot = DEFAULT_REPO_ROOT, ref, contractRepoPath = DEFAULT_CONTRACT_REPO_PATH }) {
  if (typeof ref !== 'string' || ref.length === 0) throw new Error('an explicit --ref is required');
  const producerSha = gitText(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const rawContract = gitText(repoRoot, ['show', `${producerSha}:${contractRepoPath}`]);
  let contract;
  try {
    contract = JSON.parse(rawContract);
  } catch (error) {
    throw new Error(`cannot parse ${contractRepoPath} at ${producerSha}: ${error.message}`);
  }
  const contractErrors = validateContract(contract);
  if (contractErrors.length) throw new Error(`invalid source-root contract at ${producerSha}: ${contractErrors.join('; ')}`);

  const rawPaths = gitBuffer(repoRoot, [
    'ls-tree', '-r', '-z', '--name-only', producerSha, '--', contract.producerRoot
  ]);
  const sourcePaths = rawPaths.toString('utf8').split('\0').filter(Boolean).sort();
  const entries = sourcePaths.map((sourcePath) => classifyPath(contract, sourcePath));
  const errors = entries
    .filter((entry) => entry.prohibited)
    .map((entry) => `${entry.sourcePath}: ${entry.reason}`);
  const included = entries.filter((entry) => entry.included);

  return {
    schemaVersion: contract.schemaVersion,
    producerSha,
    producerRoot: contract.producerRoot,
    contractPath: contractRepoPath,
    trackedPaths: sourcePaths.length,
    includedPaths: included.length,
    excludedPaths: entries.length - included.length,
    errors,
    entries: included,
    productPaths: included.map((entry) => entry.productPath).sort()
  };
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function main(argv) {
  const [command, ...args] = argv;
  if (!['validate', 'inventory'].includes(command)) {
    console.error('Usage: foundry-source-root.mjs <validate|inventory> --ref REF [--repo PATH] [--json]');
    return 2;
  }
  const ref = readFlag(args, '--ref');
  const repoRoot = readFlag(args, '--repo') ?? DEFAULT_REPO_ROOT;
  if (!ref) {
    console.error('error: an explicit --ref is required');
    return 2;
  }

  let report;
  try {
    report = inventoryRef({ repoRoot, ref });
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else if (command === 'inventory') {
    console.log(`# producer ${report.producerSha}`);
    for (const productPath of report.productPaths) console.log(productPath);
  } else {
    console.log(`${report.errors.length ? 'fail' : 'ok'} - Foundry source root ${report.producerSha}: ${report.includedPaths}/${report.trackedPaths} publishable paths, ${report.errors.length} errors`);
  }
  for (const error of report.errors) console.error(`error: ${error}`);
  return report.errors.length ? 1 : 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
