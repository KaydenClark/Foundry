#!/usr/bin/env node
import { closeJobOrder } from '../src/lifecycle-composition.mjs';

const FLAGS = new Set([
  '--repository', '--remote', '--lifecycle-ref', '--job-order', '--revision',
  '--actor-class', '--gate-evidence', '--evaluated-at', '--event-id', '--payload',
  '--policy', '--git-executable',
]);
const REQUIRED = [
  '--repository', '--remote', '--lifecycle-ref', '--job-order', '--revision',
  '--gate-evidence', '--evaluated-at', '--event-id', '--payload',
];

function usage() {
  return [
    'usage: lifecycle.mjs close --repository PATH --remote NAME_OR_PATH --lifecycle-ref REF',
    '         --job-order ID --revision REV --gate-evidence a,b,c --evaluated-at ISO8601',
    '         --event-id EVENT-ID --payload JSON',
    '         [--actor-class CLASS] [--policy PATH] [--git-executable PATH]',
  ].join('\n');
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!FLAGS.has(flag)) throw new Error(`unknown or misplaced argument '${flag}'\n${usage()}`);
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value\n${usage()}`);
    options[flag] = value;
    index += 1;
  }
  const missing = REQUIRED.filter((flag) => !(flag in options));
  if (missing.length) throw new Error(`missing required argument(s): ${missing.join(', ')}\n${usage()}`);
  return options;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command !== 'close') throw new Error(`close is the only supported command\n${usage()}`);
  const options = parse(rest);
  let payload;
  try {
    payload = JSON.parse(options['--payload']);
  } catch {
    throw new Error('--payload must be valid JSON');
  }
  const result = closeJobOrder({
    policyPath: options['--policy'],
    jobOrder: { id: options['--job-order'], revision: options['--revision'] },
    actorClass: options['--actor-class'] ?? 'engineer',
    gateEvidence: options['--gate-evidence'].split(',').map((gate) => gate.trim()).filter(Boolean),
    evaluatedAt: options['--evaluated-at'],
    ...(options['--git-executable'] ? { gitExecutable: options['--git-executable'] } : {}),
    repositoryPath: options['--repository'],
    remote: options['--remote'],
    lifecycleRef: options['--lifecycle-ref'],
    eventId: options['--event-id'],
    payload,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // Only an accepted lifecycle transition is a success; every other outcome —
  // denial, conflict, rejection, recovery — exits non-zero with its findings.
  return ['accepted', 'accepted-idempotent'].includes(result.outcome) ? 0 : 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
