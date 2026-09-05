import { createHash } from 'node:crypto';

const REQUIRED_EVENT_FIELDS = [
  'schemaVersion', 'eventId', 'sequence', 'type', 'priorDigest', 'stateDigest', 'payload',
];
const EVENT_FIELDS = new Set(REQUIRED_EVENT_FIELDS);
const FORBIDDEN_FIELDS = new Set([
  'repository', 'branch', 'ref', 'actor', 'runId', 'receiptId', 'runtime', 'credential', 'secret', 'prompt',
]);

function normalize(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('value must be JSON-safe');
    seen.add(value);
    const output = value.map((item) => normalize(item, seen));
    seen.delete(value);
    return output;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    if (seen.has(value)) throw new Error('value must be JSON-safe');
    seen.add(value);
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new Error('value must be JSON-safe');
      output[key] = normalize(value[key], seen);
    }
    seen.delete(value);
    return output;
  }
  throw new Error('value must be JSON-safe');
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function digestCanonical(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function findForbidden(value, prefix = '') {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...findForbidden(item, `${prefix}[${index}]`)));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const current = prefix ? `${prefix}.${key}` : key;
      if (FORBIDDEN_FIELDS.has(key)) findings.push(`payload forbids private operational field '${key}' at ${current}`);
      findings.push(...findForbidden(child, current));
    }
  }
  return findings;
}

export function validateJournalEvent({ event, predecessor, pairedState } = {}) {
  const findings = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { valid: false, eventDigest: null, findings: ['event must be an object'] };
  }
  for (const field of REQUIRED_EVENT_FIELDS) {
    if (!(field in event)) findings.push(`event missing required field '${field}'`);
  }
  for (const field of Object.keys(event)) {
    if (!EVENT_FIELDS.has(field)) findings.push(`event field '${field}' is not allowed`);
  }
  if (!['1.0', '2.0'].includes(event.schemaVersion)) findings.push("event schemaVersion must be '1.0' or '2.0'");
  if (!/^[A-Z0-9-]+$/.test(event.eventId ?? '')) findings.push('eventId must be a synthetic uppercase identifier');
  if (!Number.isInteger(event.sequence) || event.sequence < 1) findings.push('sequence must be a positive integer');
  if (event.schemaVersion === '1.0' && event.type !== 'migration.steward-serialization-imported') {
    findings.push('schema-v1 event type is outside the migration slice');
  }
  if (event.schemaVersion === '2.0' && !/^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+$/.test(event.type ?? '')) {
    findings.push('schema-v2 event type must be a stage-agnostic dotted identifier');
  }
  if (!/^[a-f0-9]{64}$/.test(event.stateDigest ?? '')) findings.push('stateDigest must be a SHA-256 digest');
  findings.push(...findForbidden(event));

  if (event.sequence === 1) {
    if (predecessor !== null) findings.push('first event predecessor must be null');
    if (event.priorDigest !== 'none') findings.push("first event priorDigest must be 'none'");
  } else if (!predecessor || event.sequence !== predecessor.sequence + 1) {
    findings.push('sequence must directly follow predecessor');
  } else if (event.priorDigest !== digestCanonical(predecessor)) {
    findings.push('priorDigest does not match predecessor');
  }

  if (!pairedState || typeof pairedState !== 'object') {
    findings.push('paired state is required');
  } else {
    if (pairedState.schemaVersion !== '2.0') {
      findings.push('paired state must be schema v2');
    }
    if (pairedState.journal?.eventId !== event.eventId || pairedState.journal?.sequence !== event.sequence) {
      findings.push('paired state Journal identity does not match event');
    }
    if (event.schemaVersion === '1.0'
      && (pairedState.status !== 'unclaimed' || pairedState.migration?.sourceSchemaVersion !== '1.0')) {
      findings.push('migration event paired state must be schema v2 unclaimed from schema v1');
    }
    try {
      if (event.stateDigest !== digestCanonical(pairedState)) findings.push('stateDigest does not match paired state');
    } catch (error) {
      findings.push(error.message);
    }
  }

  let eventDigest = null;
  if (findings.length === 0) {
    try {
      eventDigest = digestCanonical(event);
    } catch (error) {
      findings.push(error.message);
    }
  }
  return { valid: findings.length === 0, eventDigest, findings };
}

export function replayJournal(events, { pairedStates } = {}) {
  if (!Array.isArray(events)) throw new Error('events must be an array');
  if (!(pairedStates instanceof Map)) throw new Error('pairedStates must be a Map');
  const seen = new Map();
  let predecessor = null;
  let lastDigest = 'none';

  for (const event of events) {
    const eventId = event?.eventId;
    const encoded = canonicalJson(event);
    if (seen.has(eventId)) {
      if (seen.get(eventId) !== encoded) throw new Error(`conflicting duplicate event '${eventId}'`);
      continue;
    }
    const pairedState = pairedStates.get(eventId);
    if (!pairedState) throw new Error(`paired state missing for event '${eventId}'`);
    const result = validateJournalEvent({ event, predecessor, pairedState });
    if (!result.valid) throw new Error(`invalid Journal event '${eventId}': ${result.findings.join('; ')}`);
    seen.set(eventId, encoded);
    predecessor = event;
    lastDigest = result.eventDigest;
  }

  return { count: seen.size, health: 'healthy', lastDigest };
}

export function recoverJournal(events, { pairedStates, expectedLastDigest } = {}) {
  let replayed;
  try {
    replayed = replayJournal(events, { pairedStates });
  } catch (error) {
    return { count: 0, health: 'recovery-required', lastDigest: null, recovery: 'invalid', findings: [error.message] };
  }
  return {
    ...replayed,
    recovery: replayed.lastDigest === expectedLastDigest ? 'exact' : 'mismatch',
  };
}

export function projectJournalHealth(recovery, { recoveryRef, recoverySha } = {}) {
  const healthy = recovery?.health === 'healthy'
    && recovery?.recovery === 'exact'
    && typeof recoveryRef === 'string'
    && /^[a-f0-9]{40}$/.test(recoverySha ?? '');
  const projection = {
    schemaVersion: '1.0',
    owner: 'Knowledge',
    surface: 'journal-health',
    freshness: healthy ? 'fresh' : 'failed',
    sourceDigest: digestCanonical({
      count: recovery?.count ?? null,
      health: recovery?.health ?? 'unknown',
      lastDigest: recovery?.lastDigest ?? null,
      recovery: recovery?.recovery ?? 'unknown',
      recoveryRef: recoveryRef ?? null,
      recoverySha: recoverySha ?? null,
    }),
  };
  return Object.freeze(projection);
}
