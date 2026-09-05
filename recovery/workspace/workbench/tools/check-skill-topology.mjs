#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspace = path.resolve(scriptDir, '..');

function exists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

function resolvedLink(linkPath) {
  const target = fs.readlinkSync(linkPath);
  const absolute = path.isAbsolute(target) ? target : path.resolve(path.dirname(linkPath), target);
  try {
    return fs.realpathSync(absolute);
  } catch {
    return path.normalize(absolute);
  }
}

export function checkSkillTopology({
  home = os.homedir(),
  workspace = defaultWorkspace,
  catalog = path.join(home, '.agents', 'skills'),
} = {}) {
  const failures = [];
  const report = { catalog: path.resolve(catalog), engines: {}, workspace: path.resolve(workspace) };
  let canonical;

  try {
    canonical = fs.realpathSync(catalog);
    if (!fs.statSync(path.join(canonical)).isDirectory()) throw new Error('not a directory');
  } catch (error) {
    failures.push({ check: 'catalog-missing', detail: `${catalog}: ${error.message}` });
    canonical = path.resolve(catalog);
  }

  for (const engine of ['.claude', '.codex']) {
    const linkPath = path.join(home, engine, 'skills');
    if (!exists(linkPath)) {
      failures.push({ check: 'engine-root-missing', detail: `${linkPath} does not exist` });
      continue;
    }
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) {
      failures.push({ check: 'engine-root-not-link', detail: `${linkPath} must be one directory symlink` });
      continue;
    }
    const resolved = resolvedLink(linkPath);
    report.engines[engine] = resolved;
    if (/(^|[/\\])Foundry[/\\]Skills([/\\]|$)/i.test(resolved)) {
      failures.push({ check: 'foundry-target', detail: `${linkPath} resolves into Foundry: ${resolved}` });
    }
    if (resolved !== canonical) {
      failures.push({ check: 'engine-root-diverged', detail: `${linkPath} resolves to ${resolved}, expected ${canonical}` });
    }
  }

  for (const engine of ['.claude', '.codex']) {
    const shadow = path.join(workspace, engine, 'skills');
    if (exists(shadow)) {
      failures.push({ check: 'workspace-shadow', detail: `${shadow} creates a second discovery root` });
    }
  }

  return { pass: failures.length === 0, report, failures };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--home') options.home = argv[++index];
    else if (arg === '--workspace') options.workspace = argv[++index];
    else if (arg === '--catalog') options.catalog = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`usage error: ${error.message}`);
    process.exit(2);
  }
  const result = checkSkillTopology(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.pass) console.log(`ok - Claude and Codex resolve one shared custom-skill home: ${result.report.catalog}`);
  else {
    console.error(`BLOCKED - skill discovery topology has ${result.failures.length} problem(s):`);
    for (const failure of result.failures) console.error(`- ${failure.check}: ${failure.detail}`);
  }
  process.exit(result.pass ? 0 : 1);
}
