#!/usr/bin/env node
// Deterministic navigation check for the WORKSPACE one-vault ("traverse, don't
// search").
//
// Wikilink layer (S-008 TK-004): scans link-bearing doc sets — root specs, the
// Wiki, and room MEMORY.md brains — and verifies every [[wikilink]] resolves to
// exactly one Markdown file in the vault, using Obsidian-style unique
// path-suffix resolution.
//
// Navigation layer (S-019 TK-001): Markdown links are the portable navigation
// syntax for the control surface. This layer verifies that every required root
// route is present, that every local Markdown target exists inside the vault,
// and that the vault is configured to create and maintain Markdown links.
import fs from 'node:fs';
import path from 'node:path';
import { laneRelative } from './workspace-paths.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.local', '.claude']);

export function loadIgnoreFilters(root) {
  // Obsidian userIgnoreFilters: slash-wrapped entries are regexes matched
  // against vault-relative paths; plain entries are path prefixes. The vault
  // config is the authority on what is outside the graph.
  const appJson = path.join(root, '.obsidian', 'app.json');
  if (!fs.existsSync(appJson)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(appJson, 'utf8'));
  } catch (err) {
    throw new Error(`unreadable ${appJson}: ${err.message}`);
  }
  return (parsed.userIgnoreFilters || []).map((f) => {
    if (f.length > 1 && f.startsWith('/') && f.endsWith('/')) return new RegExp(f.slice(1, -1));
    return new RegExp('^' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  });
}

export function buildIndex(root, filters = loadIgnoreFilters(root)) {
  const files = [];
  const ignored = (rel) => filters.some((re) => re.test(rel) || re.test('/' + rel + '/'));
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`cannot read directory ${dir}: ${err.message}`);
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const rel = path.relative(root, path.join(dir, e.name));
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.endsWith('-worktrees') || ignored(rel)) continue;
        walk(path.join(dir, e.name));
      } else if (e.name.endsWith('.md') && !ignored(rel)) {
        files.push(rel);
      }
    }
  };
  walk(root);
  return files;
}

export function extractLinks(body) {
  // [[target]], [[target|alias]], [[target#heading]]; ignore embeds ![[...]]
  // and anything inside code fences or inline code spans (those are prose
  // about wikilinks, not links).
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = [];
  const re = /(!?)\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(prose))) {
    if (m[1] === '!') continue;
    const target = m[2].split('|')[0].split('#')[0].trim();
    if (target) links.push(target);
  }
  return links;
}

export function resolve(target, index) {
  // A full vault-root path names exactly one file, as it does in Obsidian; only
  // a shorter path falls back to the unique-suffix rule. Without this, a nested
  // checkout carrying the same suffix makes the root router ambiguous.
  const exact = `${target}.md`;
  if (index.includes(exact)) return [exact];
  const suffix = `/${target}.md`;
  return index.filter((f) => f.endsWith(suffix));
}

// Links written before the V3 move name the wiki lane by its pre-move
// directory. Completed spec evidence may not be rewritten, so a `Wiki/`
// prefix that fails direct resolution is retried through the manifest lane,
// the same way REQUIRED_ROUTES resolves its pre-V3 names. A target that exists
// under neither name still fails; a checkout without a manifest is unchanged.
export function resolveWithLegacyLane(root, target, index) {
  const direct = resolve(target, index);
  if (direct.length > 0) return direct;
  const wiki = laneRelative(root, 'wiki');
  if (wiki !== 'Wiki' && target.startsWith('Wiki/')) return resolve(`${wiki}/${target.slice('Wiki/'.length)}`, index);
  return direct;
}

export function checkVault(root, sources) {
  const index = buildIndex(root);
  const problems = [];
  let scanned = 0;
  let linkCount = 0;
  for (const rel of sources) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    scanned += 1;
    const body = fs.readFileSync(abs, 'utf8');
    for (const target of extractLinks(body)) {
      linkCount += 1;
      const matches = resolveWithLegacyLane(root, target, index);
      if (matches.length === 0) problems.push({ file: rel, target, kind: 'broken' });
      else if (matches.length > 1) problems.push({ file: rel, target, kind: 'ambiguous', matches });
    }
  }
  return { scanned, linkCount, problems };
}

export function defaultSources(root) {
  const sources = [];
  const filters = loadIgnoreFilters(root);
  const ignored = (rel) => filters.some((re) => re.test(rel) || re.test('/' + rel + '/'));
  const glob = (dir, file) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.endsWith('-worktrees')) continue;
      const cand = path.join(dir, e.name, file);
      if (!ignored(cand) && fs.existsSync(path.join(root, cand))) sources.push(cand);
    }
  };
  glob(laneRelative(root, 'specs'), 'SPEC.md');
  glob('Projects', 'MEMORY.md');
  glob('Foundry', 'MEMORY.md');
  // Active Wiki notes only: Archive/ is historical evidence whose dead links
  // are preserved, not repaired. Archived files stay in the resolution index;
  // they are just not link sources the check enforces.
  // The wiki lane moved under `workbench/`. Joining the pre-move name left
  // `fs.existsSync` false, so the walk was skipped and the check silently
  // scanned three files instead of the whole vault.
  const wiki = path.join(root, laneRelative(root, 'wiki'));
  if (fs.existsSync(wiki)) {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.relative(root, path.join(dir, e.name));
        if (ignored(rel)) continue;
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name) && e.name !== 'Archive') walk(path.join(dir, e.name));
        } else if (e.name.endsWith('.md')) {
          sources.push(path.relative(root, path.join(dir, e.name)));
        }
      }
    };
    walk(wiki);
  }
  return sources;
}

// ---------------------------------------------------------------------------
// S-019: deterministic navigation contract
// ---------------------------------------------------------------------------

// The vault must create Markdown links and keep internal links correct when
// files move or are renamed inside Obsidian. Out-of-band drift is then a
// detectable audit failure rather than a silent broken graph.
export const REQUIRED_OBSIDIAN_SETTINGS = {
  alwaysUpdateLinks: true,
  useMarkdownLinks: true,
};

// Stable entry topology. Keys are vault-relative navigation source documents;
// values are the vault-relative targets each one must route to directly. A
// librarian changes this map only when ownership, canonicality, or routing
// meaning changes — never to paper over an ordinary moved file.
//
// Deliberately NOT routed here: `Foundry/Roles/`. Roles are being retired into skills
// (S-016), and the governance rework routes by clearance rather than by role at
// large. Pinning required navigation to `Foundry/Roles/` would harden a surface that is
// on its way out. Add a clearance route here once that surface exists.
export const REQUIRED_ROUTES = {
  'AGENTS.md': [
    'BLUEPRINT.md',
    'LEXICON.md',
    'TASKBOARD.md',
    'RUNBOOK.md',
    'README.md',
    'Projects/INDEX.md',
    'Wiki/MEMORY.md',
    'specs',
  ],
  'CLAUDE.md': [
    'AGENTS.md',
    'BLUEPRINT.md',
    'LEXICON.md',
    'TASKBOARD.md',
    'RUNBOOK.md',
    'Projects/INDEX.md',
    'Wiki/MEMORY.md',
  ],
  'README.md': [
    'AGENTS.md',
    'BLUEPRINT.md',
    'LEXICON.md',
    'TASKBOARD.md',
    'RUNBOOK.md',
    'Projects/INDEX.md',
    'Wiki/MEMORY.md',
  ],
  'BLUEPRINT.md': ['AGENTS.md', 'LEXICON.md', 'TASKBOARD.md', 'RUNBOOK.md', 'specs'],
  'LEXICON.md': ['AGENTS.md', 'BLUEPRINT.md'],
  'TASKBOARD.md': ['AGENTS.md', 'BLUEPRINT.md', 'RUNBOOK.md', 'specs'],
  'RUNBOOK.md': ['AGENTS.md', 'BLUEPRINT.md', 'TASKBOARD.md', 'specs'],
  'Wiki/MEMORY.md': ['AGENTS.md', 'Wiki/SCHEMA.md', 'Projects/INDEX.md'],
};

// Required routes are declared with pre-V3 names so the table stays readable.
// Resolve the lane segments against the manifest before they are enforced.
function resolveRoutes(root) {
  const rewrite = (value) =>
    value === 'specs'
      ? laneRelative(root, 'specs')
      : value.replace(/^Wiki\//, `${laneRelative(root, 'wiki')}/`);
  return Object.fromEntries(
    Object.entries(REQUIRED_ROUTES).map(([file, routes]) => [rewrite(file), routes.map(rewrite)]),
  );
}

export function extractMarkdownLinks(body) {
  // [text](target), [text](target "title"), [text](<target>); ignore embeds
  // ![...](...), code fences, and inline code. External schemes, protocol-
  // relative URLs, and pure anchors are not vault navigation.
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = [];
  const re = /(!?)\[[^\]]*\]\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(prose))) {
    if (m[1] === '!') continue;
    let target = m[2].trim();
    // Strip an optional link title, then optional angle brackets.
    target = target.replace(/\s+(["']).*\1$/s, '').trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim();
    if (!target || target.startsWith('#') || target.startsWith('//')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    target = target.split('#')[0].trim();
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      // A malformed escape is reported later as an unresolvable target.
    }
    links.push(target);
  }
  return links;
}

function toVaultRelative(root, sourceRel, target) {
  // Resolve the link the way a reader would, then express it back as a
  // vault-relative POSIX path with no trailing slash.
  const abs = path.resolve(path.dirname(path.join(root, sourceRel)), target);
  const rel = path.relative(root, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/').replace(/\/+$/, '');
}

export function checkObsidianSettings(root, required = REQUIRED_OBSIDIAN_SETTINGS) {
  const appJson = path.join(root, '.obsidian', 'app.json');
  if (!fs.existsSync(appJson)) {
    return [{ kind: 'setting-missing-config', file: path.relative(root, appJson) }];
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(appJson, 'utf8'));
  } catch (err) {
    return [{ kind: 'setting-unreadable', file: '.obsidian/app.json', detail: err.message }];
  }
  const problems = [];
  for (const [setting, expected] of Object.entries(required)) {
    if (parsed[setting] !== expected) {
      problems.push({
        kind: 'setting',
        file: '.obsidian/app.json',
        setting,
        expected,
        actual: Object.prototype.hasOwnProperty.call(parsed, setting) ? parsed[setting] : undefined,
      });
    }
  }
  return problems;
}

export function checkRequiredRoutes(root, routes = resolveRoutes(root)) {
  const problems = [];
  for (const [sourceRel, targets] of Object.entries(routes)) {
    const abs = path.join(root, sourceRel);
    if (!fs.existsSync(abs)) {
      problems.push({ kind: 'missing-nav-source', file: sourceRel });
      continue;
    }
    const present = new Set();
    for (const target of extractMarkdownLinks(fs.readFileSync(abs, 'utf8'))) {
      const rel = toVaultRelative(root, sourceRel, target);
      if (rel) present.add(rel);
    }
    for (const target of targets) {
      if (!present.has(target.replace(/\/+$/, ''))) {
        problems.push({ kind: 'missing-route', file: sourceRel, target });
      }
    }
  }
  return problems;
}

export function checkMarkdownTargets(root, sources) {
  const problems = [];
  let scanned = 0;
  let linkCount = 0;
  for (const sourceRel of sources) {
    const abs = path.join(root, sourceRel);
    if (!fs.existsSync(abs)) continue;
    scanned += 1;
    for (const target of extractMarkdownLinks(fs.readFileSync(abs, 'utf8'))) {
      linkCount += 1;
      const rel = toVaultRelative(root, sourceRel, target);
      if (rel === null) {
        problems.push({ kind: 'outside-vault', file: sourceRel, target });
      } else if (!fs.existsSync(path.join(root, rel))) {
        problems.push({ kind: 'broken-markdown', file: sourceRel, target });
      }
    }
  }
  return { scanned, linkCount, problems };
}

export function checkNavigation(root, options = {}) {
  const routes = options.routes || resolveRoutes(root);
  const sources = options.sources || [...Object.keys(routes), ...defaultSources(root)];
  const unique = [...new Set(sources)];
  const targets = checkMarkdownTargets(root, unique);
  return {
    scanned: targets.scanned,
    linkCount: targets.linkCount,
    problems: [
      ...checkObsidianSettings(root, options.settings || REQUIRED_OBSIDIAN_SETTINGS),
      ...checkRequiredRoutes(root, routes),
      ...targets.problems,
    ],
  };
}

function describeProblem(p) {
  switch (p.kind) {
    case 'setting':
      return `setting: ${p.file} must set ${p.setting}=${p.expected} (found ${JSON.stringify(p.actual)})`;
    case 'setting-unreadable':
      return `setting-unreadable: ${p.file}: ${p.detail}`;
    case 'setting-missing-config':
      return `setting-missing-config: ${p.file} is absent`;
    case 'missing-nav-source':
      return `missing-nav-source: required navigation document ${p.file} is absent`;
    case 'missing-route':
      return `missing-route: ${p.file} must link directly to ${p.target}`;
    case 'outside-vault':
      return `outside-vault: [](${p.target}) in ${p.file} leaves the vault root`;
    case 'broken-markdown':
      return `broken-markdown: [](${p.target}) in ${p.file}`;
    default:
      return `${p.kind}: [[${p.target}]] in ${p.file}` + (p.matches ? ` -> ${p.matches.join(', ')}` : '');
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (!['check', 'nav'].includes(args[0])) {
    console.error('Usage: vault-links.mjs check|nav [--root PATH]');
    process.exit(2);
  }
  const rootFlag = args.indexOf('--root');
  const root = rootFlag !== -1 ? path.resolve(args[rootFlag + 1]) : '/ABSOLUTE/WORKSPACE';

  const nav = checkNavigation(root);
  const wiki = args[0] === 'nav' ? { scanned: 0, linkCount: 0, problems: [] } : checkVault(root, defaultSources(root));

  for (const p of [...nav.problems, ...wiki.problems]) console.error(describeProblem(p));

  const problemCount = nav.problems.length + wiki.problems.length;
  if (args[0] !== 'nav') {
    console.log(
      `${wiki.problems.length ? 'fail' : 'ok'} - vault wikilinks: ` +
        `${wiki.scanned} files scanned, ${wiki.linkCount} links, ${wiki.problems.length} problems`
    );
  }
  console.log(
    `${nav.problems.length ? 'fail' : 'ok'} - navigation contract: ` +
      `${nav.scanned} files scanned, ${nav.linkCount} markdown links, ${nav.problems.length} problems`
  );
  process.exit(problemCount ? 1 : 0);
}
