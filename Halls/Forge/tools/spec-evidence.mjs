import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownTableRow } from './markdown-table.mjs';

const FILE_LIMIT = 64 * 1024;
const REFERENCE_LIMIT = 512;
const GROUNDING_TOKEN = 'grounding-archive:';
const CANON_TOKEN = 'canon-archive:';
const GROUNDING_PREFIX = `<!-- ${GROUNDING_TOKEN}`;
const CANON_PREFIX = `<!-- ${CANON_TOKEN}`;
const GROUNDING_DECLARATION = /^<!-- grounding-archive:v(1|2) path=(GROUNDING_[A-Za-z0-9_.-]*\.md) rows=([1-9]\d*) bytes=([1-9]\d*) sha256=([0-9a-f]{64})(?: first=([^\s]+) last=([^\s]+))? -->$/;
const CANON_DECLARATION = /^<!-- canon-archive:v1 path=(CANON_[A-Za-z0-9_.-]*\.md) bytes=([1-9]\d*) sha256=([0-9a-f]{64}) first=(JO-[0-9A-Z]{6}\/R[1-9]\d*) last=(JO-[0-9A-Z]{6}\/R[1-9]\d*) -->$/;
const STORAGE_FILE = /^(?:GROUNDING|CANON)_[A-Za-z0-9_.-]*\.md$/;
const CANON_IDENTITY = /^JO-([0-9A-Z]{6})\/R([1-9]\d*)$/;
const CANON_ISSUANCE_HEADING = /^## Canon Issuance — Job Order ([0-9A-Z]{6}) \/ (R[1-9]\d*)$/gm;
const CANON_PROTECTED_PATTERNS = [
  /^## Vertical Implementation Slices$/m,
  /^\| Ticket \|/m,
  /^## Acceptance Criteria$/m,
  /^## Append-Only Evidence And Execution Log$/m,
  /^\| Date \| Ticket \| Event \| Verification \| Docs \| Remaining gap \|$/m,
  /^## Completion Result$/m,
  /^## Supersession$/m,
];

export class SpecEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(code, message) {
  throw new SpecEvidenceError(code, message);
}

function decodeUtf8(bytes) {
  if ((bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || bytes.includes(0)) {
    fail('archive.invalid-utf8', 'archived evidence must be UTF-8 without BOM or NUL');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('archive.invalid-utf8', 'archived evidence must be valid UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) {
    fail('archive.invalid-utf8', 'archived evidence must be UTF-8 without BOM or NUL');
  }
  return text;
}

export function parseEvidenceTableRow(line) {
  if (String(line).charCodeAt(0) === 0xfeff) {
    fail('evidence.row-invalid', 'evidence rows may not begin with a BOM');
  }
  const cells = parseMarkdownTableRow(line);
  if (cells.length !== 6) fail('evidence.row-invalid', 'evidence rows must contain exactly six cells');
  const date = cells[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('evidence.row-invalid', 'evidence rows must begin with a valid date');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail('evidence.row-invalid', 'evidence rows must begin with a valid date');
  }
  return cells;
}

function evidenceBoundaryIdentity(line) {
  const cells = parseEvidenceTableRow(line);
  const ticket = cells[1].trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!ticket) fail('archive.boundary-mismatch', 'archived evidence boundary identity is empty');
  return `${cells[0]}/${ticket}`;
}

function canonBoundaryIdentities(text) {
  return [...text.matchAll(CANON_ISSUANCE_HEADING)].map((match) => `JO-${match[1]}/${match[2]}`);
}

function parseCanonIdentity(identity) {
  const match = CANON_IDENTITY.exec(identity);
  if (!match) fail('archive.boundary-mismatch', 'archived Canon boundary identity is invalid');
  return { orderFuid: match[1], revision: Number(match[2]) };
}

function compareCanonIdentities(left, right) {
  const leftIdentity = parseCanonIdentity(left);
  const rightIdentity = parseCanonIdentity(right);
  return leftIdentity.orderFuid.localeCompare(rightIdentity.orderFuid)
    || leftIdentity.revision - rightIdentity.revision;
}

export function sensitiveContentCodes(text) {
  const codes = [];
  if (/(^|\n)(```diff\s*$|diff --git\s|@@\s+[-+]\d)/mi.test(text)) codes.push('content.diff');
  const credentialPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    /\bAuthorization\s*:\s*Bearer\s+(?!\[(?:redacted|omitted)\]|<redacted>)[^\s]+/i,
    /\b(?:api[_-]?key|password|passwd|token|secret)\s*[:=]\s*["']?(?!none\b|redacted\b|omitted\b|example\b|<redacted>)[A-Za-z0-9_./+:-]{12,}/i,
    /https?:\/\/[^\s/@:]+:[^\s/@]+@/i,
  ];
  if (credentialPatterns.some((pattern) => pattern.test(text))) codes.push('content.credential');
  if (/^#{1,6}\s+(?:private payload|raw private data)\b/im.test(text)
      || /^\*\*(?:Private payload|Raw private data):\*\*\s*\S/im.test(text)) codes.push('content.private-payload');
  if (/\/(?:Users|home)\/[^/\s]+\/(?:\.ssh|\.aws|\.gnupg|Library\/Keychains|Library\/(?:Application Support\/)?(?:Google\/Chrome|Firefox)|\.config\/gh)(?:\/|\b)/i.test(text)) codes.push('content.host-private');
  return codes;
}

function declarationRange(hotText) {
  const evidenceStart = hotText.indexOf('## Append-Only Evidence And Execution Log');
  const evidenceEnd = evidenceStart < 0 ? -1 : hotText.indexOf('\n## ', evidenceStart + 4);
  const ticketTableStart = hotText.indexOf('## Vertical Implementation Slices');
  return { evidenceStart, evidenceEnd, ticketTableStart };
}

function lineBounds(text) {
  const lines = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const hasNewline = offset + line.length < text.length && text[offset + line.length] === '\n';
    const lineStart = offset;
    const lineEnd = hasNewline ? offset + line.length + 1 : offset + line.length;
    lines.push({ line, lineStart, lineEnd });
    offset = lineEnd;
  }
  return lines;
}

function parseDeclarationLine(line, lineStart, lineEnd, bounds) {
  const token = line.startsWith(GROUNDING_PREFIX) ? 'grounding'
    : line.startsWith(CANON_PREFIX) ? 'canon'
      : null;
  if (!token) return null;
  if (Buffer.byteLength(`${line}\n`) > REFERENCE_LIMIT) {
    fail('archive.declaration-invalid', 'archived-evidence declaration is invalid');
  }
  if (token === 'grounding') {
    const match = GROUNDING_DECLARATION.exec(line);
    if (!match || (match[1] === '2' && (!match[6] || !match[7]))) {
      fail('archive.declaration-invalid', 'archived-evidence declaration is invalid');
    }
    if (bounds.evidenceStart < 0 || lineStart < bounds.evidenceStart || (bounds.evidenceEnd >= 0 && lineStart >= bounds.evidenceEnd)) {
      fail('archive.declaration-invalid', 'archived-evidence declaration must be inside the execution log');
    }
    return {
      kind: 'grounding',
      version: Number(match[1]),
      path: match[2],
      rows: Number(match[3]),
      bytes: Number(match[4]),
      sha256: match[5],
      first: match[6] || null,
      last: match[7] || null,
      line,
      lineStart,
      lineEnd,
    };
  }
  const match = CANON_DECLARATION.exec(line);
  if (!match) fail('archive.declaration-invalid', 'archived-evidence declaration is invalid');
  if (bounds.ticketTableStart < 0 || lineStart >= bounds.ticketTableStart) {
    fail('archive.protected-section', 'archived Canon may not hide the current ticket table or later protected sections');
  }
  if (canonBoundaryIdentities(hotTextBefore(bounds.ticketTableStart, lineStart, bounds.sourceText ?? '')).length === 0) {
    fail('archive.protected-section', 'archived Canon must leave at least one hot current issuance visible');
  }
  return {
    kind: 'canon',
    version: 1,
    path: match[1],
    rows: null,
    bytes: Number(match[2]),
    sha256: match[3],
    first: match[4],
    last: match[5],
    line,
    lineStart,
    lineEnd,
  };
}

function hotTextBefore(ticketTableStart, lineStart, text) {
  if (!text) return '';
  const cutoff = Math.min(ticketTableStart < 0 ? lineStart : ticketTableStart, lineStart);
  return text.slice(0, cutoff);
}

export function parseSpecEvidenceDeclaration(hotText) {
  const bounds = { ...declarationRange(hotText), sourceText: hotText };
  const declarations = [];
  const seen = new Set();
  for (const { line, lineStart, lineEnd } of lineBounds(hotText)) {
    const declaration = parseDeclarationLine(line, lineStart, lineEnd, bounds);
    if (!declaration) continue;
    if (seen.has(declaration.path)) fail('archive.declaration-multiple', 'archive paths must be unique');
    seen.add(declaration.path);
    declarations.push(declaration);
  }
  if (!declarations.length) return null;
  return declarations.length === 1 ? declarations[0] : declarations;
}

function loadArchiveFile({ root, specDir, declaration }) {
  const archivePath = path.resolve(specDir, declaration.path);
  const relative = path.relative(specDir, archivePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('archive.declaration-invalid', 'archived evidence path is not contained by its Spec');
  }
  let stat;
  try {
    stat = fs.lstatSync(archivePath);
  } catch {
    fail('archive.missing', 'declared archived evidence is missing');
  }
  if (stat.isSymbolicLink()) fail('archive.symlink', 'archived evidence may not be a symbolic link');
  if (!stat.isFile()) fail('archive.special', 'archived evidence must be a regular file');
  if (stat.size > FILE_LIMIT) fail('archive.file-too-large', `archived evidence exceeds ${FILE_LIMIT} bytes`);
  const canonicalRoot = fs.realpathSync(root);
  const canonicalSpecDir = fs.realpathSync(specDir);
  const canonicalArchive = fs.realpathSync(archivePath);
  if (!canonicalSpecDir.startsWith(`${canonicalRoot}${path.sep}`) || path.dirname(canonicalArchive) !== canonicalSpecDir) {
    fail('archive.escape', 'archived evidence escapes its private Spec directory');
  }
  const bytes = fs.readFileSync(archivePath);
  const text = decodeUtf8(bytes);
  const sensitiveCodes = sensitiveContentCodes(text);
  if (sensitiveCodes.length) fail(sensitiveCodes[0], 'archived evidence contains prohibited sensitive content');
  if (bytes.length !== declaration.bytes) fail('archive.bytes-mismatch', 'archived evidence byte count does not match');
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== declaration.sha256) fail('archive.hash-mismatch', 'archived evidence digest does not match');
  return { bytes, text };
}

function validateGroundingArchive({ declaration, bytes, text }) {
  if (!text.endsWith('\n')) fail('archive.rows-mismatch', 'archived evidence must end with one LF');
  const physicalLines = text.slice(0, -1).split('\n');
  const rows = declaration.version === 2 ? physicalLines.filter(Boolean) : physicalLines;
  let rowsValid = rows.length === declaration.rows;
  if (rowsValid) {
    try {
      for (const line of rows) {
        if (line !== '') parseEvidenceTableRow(line);
      }
    } catch {
      rowsValid = false;
    }
  }
  if (!rowsValid) fail('archive.rows-mismatch', 'archived evidence rows do not match the declaration');
  const evidenceRows = text.split('\n').filter(Boolean);
  const firstIdentity = evidenceBoundaryIdentity(evidenceRows[0]);
  const lastIdentity = evidenceBoundaryIdentity(evidenceRows.at(-1));
  if (declaration.version === 2 && (declaration.first !== firstIdentity || declaration.last !== lastIdentity)) {
    fail('archive.boundary-mismatch', 'archive first/last rows do not match declared boundary identities');
  }
  return {
    kind: declaration.kind,
    declaration,
    bytes,
    text,
    firstIdentity,
    lastIdentity,
    identities: evidenceRows.map((line) => parseEvidenceTableRow(line).slice(0, 3).join('\u0000')),
  };
}

function validateCanonArchive({ declaration, text, hotText }) {
  if (CANON_PROTECTED_PATTERNS.some((pattern) => pattern.test(text))) {
    fail('archive.protected-section', 'archived Canon may not capture protected hot sections');
  }
  const archiveIssuances = canonBoundaryIdentities(text);
  if (!archiveIssuances.length) fail('archive.boundary-mismatch', 'archived Canon must contain at least one Canon issuance heading');
  if (declaration.first !== archiveIssuances[0] || declaration.last !== archiveIssuances.at(-1)) {
    fail('archive.boundary-mismatch', 'archived Canon boundaries do not match the declaration');
  }
  if (new Set(archiveIssuances).size !== archiveIssuances.length) {
    fail('archive.identity-duplicate', 'archived Canon contains duplicate issuance identities');
  }
  const hotIssuances = canonBoundaryIdentities(hotText.slice(0, declaration.lineStart));
  if (!hotIssuances.length) {
    fail('archive.protected-section', 'archived Canon must leave at least one hot current issuance visible');
  }
  if (compareCanonIdentities(archiveIssuances.at(-1), hotIssuances[0]) >= 0) {
    fail('archive.protected-section', 'archived Canon must archive only historical issuances older than the visible hot Canon');
  }
  if (archiveIssuances.some((identity) => hotIssuances.includes(identity))) {
    fail('archive.protected-section', 'archived Canon may not capture a current hot issuance');
  }
  return {
    kind: declaration.kind,
    declaration,
    bytes: Buffer.from(text),
    text,
    firstIdentity: archiveIssuances[0],
    lastIdentity: archiveIssuances.at(-1),
    identities: archiveIssuances,
  };
}

export function loadSpecEvidence({ root, specFilePath }) {
  const hotBytes = fs.readFileSync(specFilePath);
  const hotText = decodeUtf8(hotBytes);
  const parsed = parseSpecEvidenceDeclaration(hotText);
  const declarations = parsed ? (Array.isArray(parsed) ? parsed : [parsed]) : [];
  const specDir = path.dirname(specFilePath);
  const candidates = fs.readdirSync(specDir).filter((name) => STORAGE_FILE.test(name)).sort();
  if (!declarations.length) {
    if (candidates.length) fail('archive.undeclared', 'archived evidence exists without a declaration');
    return { hotText, logicalText: hotText, archiveBytes: 0, declaration: null, declarations: [], archives: [] };
  }
  const declaredPaths = declarations.map((item) => item.path).sort();
  if (candidates.length < declarations.length) fail('archive.missing', 'declared archived evidence is missing');
  if (candidates.length !== declarations.length || candidates.some((name, index) => name !== declaredPaths[index])) {
    fail('archive.undeclared', 'archived evidence declarations and sibling files do not match');
  }

  let logicalText = hotText;
  let archiveBytes = 0;
  const archives = [];
  for (const declaration of [...declarations].reverse()) {
    const archive = loadArchiveFile({ root, specDir, declaration });
    const validated = declaration.kind === 'canon'
      ? validateCanonArchive({ declaration, text: archive.text, hotText })
      : validateGroundingArchive({ declaration, bytes: archive.bytes, text: archive.text });
    logicalText = `${logicalText.slice(0, declaration.lineStart)}${archive.text}${logicalText.slice(declaration.lineEnd)}`;
    archiveBytes += archive.bytes.length;
    archives.unshift(validated);
  }

  const groundingArchives = archives.filter((item) => item.kind === 'grounding');
  for (let index = 1; index < groundingArchives.length; index += 1) {
    const previous = groundingArchives[index - 1];
    const current = groundingArchives[index];
    const previousDate = previous.lastIdentity.slice(0, 10);
    const currentDate = current.firstIdentity.slice(0, 10);
    if (previousDate.localeCompare(currentDate) > 0) {
      fail('archive.chain-reordered', 'archive boundaries overlap or are not in declaration order');
    }
  }

  const seenGrounding = new Set();
  const seenCanon = new Set();
  for (const archive of archives) {
    if (archive.kind === 'canon') {
      for (const identity of archive.identities) {
        if (seenCanon.has(identity)) {
          fail('archive.identity-duplicate', 'archived Canon contains duplicate issuance identities');
        }
        seenCanon.add(identity);
      }
      continue;
    }
    const localIdentities = new Set();
    for (const identity of archive.identities) {
      if (seenGrounding.has(identity)) {
        fail('archive.identity-duplicate', 'archive chain contains duplicate canonical identities');
      }
      localIdentities.add(identity);
    }
    for (const identity of localIdentities) seenGrounding.add(identity);
  }

  return {
    hotText,
    logicalText,
    archiveBytes,
    declaration: declarations[0] ?? null,
    declarations,
    archives,
  };
}
