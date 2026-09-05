#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { allocateNextFuid } from '../../Foundry/tools/identity-registry.mjs';
import { escapeMarkdownTableCell, parseMarkdownTableRow } from '../../Foundry/tools/markdown-table.mjs';

const FUID_PATTERN = /^[0-9A-Z]{6}$/;

export function migrateWorkItems(options) {
  const repoRoot = path.resolve(required(options.repoRoot, 'repoRoot'));
  const specsRoot = path.resolve(required(options.specsRoot, 'specsRoot'));
  const registryPath = path.resolve(required(options.registryPath, 'registryPath'));
  const namespace = required(options.namespace, 'namespace');
  const parentFuid = required(options.parentFuid, 'parentFuid');
  const homePrefix = options.homePrefix ?? '.';
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const originalRegistry = JSON.stringify(registry, null, 2);
  const occupied = new Set(Object.keys(registry.entities ?? {}));
  const retired = new Set(Object.keys(registry.retired ?? {}));
  const specs = [];
  const changes = [];

  for (const filePath of specFiles(specsRoot)) {
    const relativePath = posixPath(path.relative(repoRoot, filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    const spec = parseSpec(content, relativePath);
    const specDates = provenanceDates(repoRoot, relativePath);
    const created = spec.created ?? specDates.created;
    const lastWorked = spec.lastWorked ?? specDates.lastWorked;
    const specFuid = ensureEntity({
      registry, occupied, retired,
      preferred: spec.fuid,
      type: 'spec',
      name: spec.title,
      home: joinedHome(homePrefix, path.relative(specsRoot, filePath)),
      aliases: [`${namespace}/${spec.id}`],
      parent: parentFuid,
      created,
      lastWorked
    });
    const tickets = spec.tickets.map((ticket) => {
      const dates = provenanceDates(repoRoot, relativePath, `^\\| ${escapeRegExp(ticket.id)} \\|`);
      const ticketCreated = ticket.created ?? dates.created ?? created;
      const ticketLastWorked = ticket.lastWorked ?? dates.lastWorked ?? lastWorked;
      const fuid = ensureEntity({
        registry, occupied, retired,
        preferred: ticket.fuid,
        type: 'ticket',
        name: ticket.slice,
        home: joinedHome(homePrefix, path.relative(specsRoot, filePath)),
        aliases: [`${namespace}/${spec.id}/${ticket.id}`],
        parent: specFuid,
        created: ticketCreated,
        lastWorked: ticketLastWorked
      });
      return { ...ticket, fuid, created: ticketCreated, lastWorked: ticketLastWorked };
    });
    const migrated = migrateContent(content, {
      fuid: specFuid,
      created,
      lastWorked,
      tickets
    });
    specs.push({
      id: spec.id,
      fuid: specFuid,
      path: relativePath,
      created,
      lastWorked,
      tickets: tickets.map(({ id, fuid, created, lastWorked }) => ({ id, fuid, created, lastWorked }))
    });
    if (migrated !== content) {
      changes.push(relativePath);
      if (options.apply) atomicWrite(filePath, migrated);
    }
  }

  removeAmbiguousAliases(registry);

  const registryText = `${JSON.stringify(registry, null, 2)}\n`;
  const registryChanged = registryText !== `${originalRegistry}\n`;
  if (options.apply && registryChanged) atomicWrite(registryPath, registryText);
  return { namespace, applied: Boolean(options.apply), registryChanged, changes, specs };
}

function parseSpec(content, relativePath) {
  const fields = Object.fromEntries([...content.matchAll(/^\*\*([^*]+):\*\*\s*(.+)$/gm)].map((match) => [match[1].trim(), match[2].trim()]));
  const id = fields['Spec ID'];
  if (!/^S-\d{3}$/.test(id ?? '')) throw new Error(`${relativePath} has an invalid or missing Spec ID`);
  const title = content.match(new RegExp(`^# ${escapeRegExp(id)} - (.+)$`, 'm'))?.[1]?.trim();
  if (!title) throw new Error(`${relativePath} has no matching title`);
  const slice = section(content, 'Vertical Implementation Slices');
  const tickets = [];
  for (const line of slice.split('\n')) {
    if (!/^\|\s*TK-\d+\s*\|/.test(line)) continue;
    const cells = parseMarkdownTableRow(line);
    if (![5, 8].includes(cells.length)) throw new Error(`${relativePath} has a malformed ticket row`);
    tickets.push(cells.length === 5
      ? { id: cells[0], fuid: null, slice: cells[1], status: cells[2], blockers: cells[3], created: null, lastWorked: null, proof: cells[4] }
      : {
          id: cells[0], fuid: cells[1], slice: cells[2], status: cells[3], blockers: cells[4],
          created: lifecycleDate(cells[5], `${relativePath} ${cells[0]} Created`),
          lastWorked: lifecycleDate(cells[6], `${relativePath} ${cells[0]} Last worked`),
          proof: cells[7]
        });
  }
  if (!tickets.length) throw new Error(`${relativePath} has no tickets`);
  return {
    id,
    fuid: fields.FUID ?? null,
    title,
    created: lifecycleDate(fields.Created, `${relativePath} Created`),
    lastWorked: lifecycleDate(fields['Last worked'], `${relativePath} Last worked`),
    tickets
  };
}

function lifecycleDate(value, label) {
  if (value == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function ensureEntity({ registry, occupied, retired, preferred, type, name, home, aliases, parent, created, lastWorked }) {
  const qualifiedAlias = aliases[0];
  const existing = Object.values(registry.entities ?? {}).find((entity) => entity.aliases?.includes(qualifiedAlias));
  let fuid = existing?.id ?? preferred;
  if (fuid && !FUID_PATTERN.test(fuid)) throw new Error(`${aliases[0]} has invalid FUID ${fuid}`);
  if (fuid && occupied.has(fuid) && !existing && !registry.entities?.[fuid]) throw new Error(`${fuid} is already occupied`);
  if (!fuid) {
    fuid = allocateNextFuid({
      width: 6,
      lastIssued: registry.allocators?.['6']?.lastIssued ?? '000000',
      occupied,
      retired
    });
  }
  occupied.add(fuid);
  registry.entities ??= {};
  registry.entities[fuid] = {
    ...(registry.entities[fuid] ?? {}),
    id: fuid,
    type,
    name,
    home,
    aliases: unique([...(registry.entities[fuid]?.aliases ?? []), ...aliases]),
    parent,
    created,
    lastWorked
  };
  const allocator = registry.allocators?.['6'];
  if (!allocator) throw new Error('registry has no six-character allocator');
  if (base36Value(fuid) > base36Value(allocator.lastIssued)) allocator.lastIssued = fuid;
  return fuid;
}

function migrateContent(content, spec) {
  let result = upsertField(content, 'Spec ID', 'FUID', spec.fuid);
  result = upsertField(result, 'Owner', 'Created', spec.created);
  result = upsertField(result, 'Created', 'Last worked', spec.lastWorked);
  result = replaceField(result, 'Updated', spec.lastWorked);
  const ticketById = new Map(spec.tickets.map((ticket) => [ticket.id, ticket]));
  const heading = '## Vertical Implementation Slices';
  const start = result.indexOf(heading);
  if (start < 0) throw new Error('Missing Vertical Implementation Slices');
  const bodyStart = start + heading.length;
  const nextHeading = result.indexOf('\n## ', bodyStart);
  const end = nextHeading < 0 ? result.length : nextHeading;
  const migratedTable = result.slice(bodyStart, end).split('\n').map((line) => {
    if (/^\|\s*Ticket\s*\|/.test(line)) return '| Ticket | FUID | Slice | Status | Blockers | Created | Last worked | Proof |';
    if (/^\|\s*---/.test(line) && line.includes('|') && parseMarkdownTableRow(line).length === 5) return '|---|---|---|---|---|---|---|---|';
    if (!/^\|\s*TK-\d+\s*\|/.test(line)) return line;
    const cells = parseMarkdownTableRow(line);
    const ticket = ticketById.get(cells[0]);
    if (!ticket) return line;
    const values = cells.length === 5
      ? [cells[0], ticket.fuid, cells[1], cells[2], cells[3], ticket.created, ticket.lastWorked, cells[4]]
      : [cells[0], ticket.fuid, cells[2], cells[3], cells[4], ticket.created, ticket.lastWorked, cells[7]];
    return `| ${values.map(escapeMarkdownTableCell).join(' | ')} |`;
  }).join('\n');
  return `${result.slice(0, bodyStart)}${migratedTable}${result.slice(end)}`;
}

function upsertField(content, after, name, value) {
  const existing = new RegExp(`^\\*\\*${escapeRegExp(name)}:\\*\\*.*$`, 'm');
  if (existing.test(content)) return content.replace(existing, `**${name}:** ${value}`);
  const anchor = new RegExp(`^(\\*\\*${escapeRegExp(after)}:\\*\\*.*)$`, 'm');
  if (!anchor.test(content)) throw new Error(`Missing field: ${after}`);
  return content.replace(anchor, `$1\n**${name}:** ${value}`);
}

function replaceField(content, name, value) {
  const pattern = new RegExp(`^\\*\\*${escapeRegExp(name)}:\\*\\*.*$`, 'm');
  if (!pattern.test(content)) throw new Error(`Missing field: ${name}`);
  return content.replace(pattern, `**${name}:** ${value}`);
}

function provenanceDates(repoRoot, relativePath, grepPattern) {
  const args = ['log', '--format=%ad', '--date=short'];
  if (grepPattern) args.push(`-G${grepPattern}`);
  args.push('--', relativePath);
  const output = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  const dates = output ? output.split('\n').filter(Boolean) : [];
  return { created: dates.at(-1) ?? null, lastWorked: dates[0] ?? null };
}

function specFiles(specsRoot) {
  return fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(specsRoot, entry.name, 'SPEC.md'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function section(content, heading) {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = start + marker.length;
  const end = content.indexOf('\n## ', bodyStart);
  return content.slice(bodyStart, end < 0 ? content.length : end).trim();
}

function joinedHome(prefix, relative) {
  return path.posix.join(prefix, posixPath(relative));
}

function posixPath(value) {
  return value.split(path.sep).join('/');
}

function unique(values) {
  return [...new Set(values)];
}

function removeAmbiguousAliases(registry) {
  const counts = new Map();
  for (const entity of Object.values(registry.entities ?? {})) {
    for (const alias of entity.aliases ?? []) counts.set(alias, (counts.get(alias) ?? 0) + 1);
  }
  for (const entity of Object.values(registry.entities ?? {})) {
    entity.aliases = (entity.aliases ?? []).filter((alias) => counts.get(alias) === 1);
    if (!entity.aliases.length) throw new Error(`${entity.id} has no unambiguous compatibility alias`);
  }
}

function base36Value(value) {
  return [...value].reduce((total, character) => total * 36 + parseInt(character, 36), 0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function atomicWrite(filePath, content) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content.endsWith('\n') ? content : `${content}\n`);
  fs.renameSync(temporary, filePath);
}

function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg.startsWith('--')) options[toCamel(arg.slice(2))] = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    const result = migrateWorkItems(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
