import { createHash } from 'node:crypto';

const POLICY_VERSION = '1.0';

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new Error('policy must be JSON-safe');
      output[key] = canonicalValue(value[key]);
    }
    return output;
  }
  throw new Error('policy must be JSON-safe');
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function stringList(value, label, { empty = true } = {}) {
  if (!Array.isArray(value) || (!empty && value.length === 0) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings`);
  }
}

export function compileClearancePolicy(policy) {
  const normalized = canonicalValue(policy);
  if (normalized?.schemaVersion !== POLICY_VERSION) throw new Error(`schemaVersion must be '${POLICY_VERSION}'`);
  if (!normalized.actorClasses || typeof normalized.actorClasses !== 'object' || Object.keys(normalized.actorClasses).length === 0) {
    throw new Error('actorClasses must be a non-empty object');
  }
  for (const [name, rule] of Object.entries(normalized.actorClasses)) {
    stringList(rule.actions, `${name}.actions`);
    stringList(rule.pathPrefixes, `${name}.pathPrefixes`);
    stringList(rule.requiredGates, `${name}.requiredGates`);
  }
  stringList(normalized.ownerOverride?.requiredFields, 'ownerOverride.requiredFields', { empty: false });
  if (typeof normalized.denial?.recoveryRoute !== 'string' || normalized.denial.recoveryRoute.length === 0) {
    throw new Error('denial.recoveryRoute is required');
  }
  return freeze({ policy: normalized, policyDigest: digest(normalized) });
}

function includesAll(container, requested) {
  return requested.every((item) => container.includes(item));
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function exactScope(authorized, requested) {
  return sameStringSet(authorized?.actions, [requested?.action])
    && sameStringSet(authorized?.paths, requested?.paths);
}

function validateOwnerCommand(command, request, gateEvidence, evaluatedAt) {
  const findings = [];
  if (!command || typeof command !== 'object') return ['owner-command.missing'];
  for (const field of ['commandId', 'actions', 'paths', 'expiresAt', 'reason', 'proofGates']) {
    if (!(field in command)) findings.push(`owner-command.${field}-missing`);
  }
  if (!sameStringSet(command.actions, [request?.action])) findings.push('owner-command.action-out-of-scope');
  if (!sameStringSet(command.paths, request?.paths)) {
    findings.push('owner-command.path-out-of-scope');
  }
  if (typeof command.reason !== 'string' || command.reason.trim().length === 0) findings.push('owner-command.reason-missing');
  const expires = Date.parse(command.expiresAt);
  const evaluated = Date.parse(evaluatedAt);
  if (!Number.isFinite(expires) || !Number.isFinite(evaluated) || expires <= evaluated) findings.push('owner-command.expired');
  if (!Array.isArray(command.proofGates) || !includesAll(gateEvidence, command.proofGates)) {
    findings.push('owner-command.proof-gate-missing');
  }
  return findings;
}

export function evaluateClearance(input) {
  const {
    compiledPolicy, actorClass, authorizedScope, request, gateEvidence = [], ownerCommand = null, evaluatedAt,
  } = input ?? {};
  const policy = compiledPolicy?.policy;
  const policyDigest = compiledPolicy?.policyDigest;
  if (!policy || !/^[a-f0-9]{64}$/.test(policyDigest ?? '')) throw new Error('compiledPolicy is required');
  if (digest(policy) !== policyDigest) throw new Error('compiledPolicy digest mismatch');

  const denied = [];
  if (!Number.isFinite(Date.parse(evaluatedAt))) denied.push('evaluation-time.invalid');
  const rule = policy.actorClasses[actorClass];
  if (!rule) denied.push('actor-class.unknown');
  if (!request || typeof request.action !== 'string' || !Array.isArray(request.paths)) denied.push('request.malformed');
  if (!exactScope(authorizedScope, request)) denied.push('authorization.scope-mismatch');

  if (rule && request?.action) {
    if (!(rule.actions.includes('*') || rule.actions.includes(request.action))) denied.push('policy.action-denied');
    for (const candidate of request.paths ?? []) {
      if (!rule.pathPrefixes.some((prefix) => candidate.startsWith(prefix))) denied.push('policy.path-denied');
    }
    for (const gate of rule.requiredGates) {
      if (!gateEvidence.includes(gate)) denied.push(`gate.${gate}-missing`);
    }
  }
  if (actorClass === 'owner') denied.push(...validateOwnerCommand(ownerCommand, request, gateEvidence, evaluatedAt));

  const deniedRuleIds = [...new Set(denied)].sort();
  if (deniedRuleIds.length === 0) {
    return { decision: 'allow', policyDigest, deniedRuleIds: [], denialReceipt: null };
  }
  const safeRequest = {
    action: typeof request?.action === 'string' ? request.action : 'invalid',
    pathCount: Array.isArray(request?.paths) ? request.paths.length : 0,
  };
  const denialReceipt = {
    schemaVersion: POLICY_VERSION,
    decision: 'deny',
    policyDigest,
    actorClass: typeof actorClass === 'string' ? actorClass : 'unknown',
    requestDigest: digest(safeRequest),
    deniedRuleIds,
    recoveryRoute: policy.denial.recoveryRoute,
    evaluatedAt: typeof evaluatedAt === 'string' ? evaluatedAt : 'unknown',
  };
  return { decision: 'deny', policyDigest, deniedRuleIds, denialReceipt };
}

export function createDenialRecord({
  decision, jobOrder, requestedTransition, requestedScope, evaluatedAt,
} = {}) {
  if (decision?.decision !== 'deny' || !Array.isArray(decision.deniedRuleIds)) {
    throw new Error('a Gatehouse deny decision is required');
  }
  if (typeof jobOrder?.id !== 'string' || typeof jobOrder?.revision !== 'string') {
    throw new Error('Job Order identity and revision are required');
  }
  if (typeof requestedTransition !== 'string' || !Array.isArray(requestedScope)) {
    throw new Error('requested transition and scope are required');
  }
  const requestedScopeDigest = digest([...requestedScope].sort());
  const identity = digest({
    jobOrder,
    requestedTransition,
    requestedScopeDigest,
    policyDigest: decision.policyDigest,
    deniedRuleIds: [...decision.deniedRuleIds].sort(),
  });
  return freeze({
    schemaVersion: POLICY_VERSION,
    denialId: `DENY-${identity.slice(0, 16).toUpperCase()}`,
    jobOrder: { id: jobOrder.id, revision: jobOrder.revision },
    actorClass: decision.denialReceipt?.actorClass ?? 'unknown',
    requestedTransition,
    requestedScopeDigest,
    policyDigest: decision.policyDigest,
    deniedRuleIds: [...decision.deniedRuleIds].sort(),
    recoveryRoute: decision.denialReceipt?.recoveryRoute ?? 'repair-and-reevaluate',
    evaluatedAt,
  });
}

export function projectPassage({ denialRecord, lifecycleCommitId } = {}) {
  if (!/^[a-f0-9]{40}$/.test(lifecycleCommitId ?? '')) {
    throw new Error('exact lifecycle commit is required');
  }
  if (!/^DENY-[A-F0-9]{16}$/.test(denialRecord?.denialId ?? '')) {
    throw new Error('valid denial record is required');
  }
  return freeze({
    schemaVersion: POLICY_VERSION,
    owner: 'Gatehouse',
    surface: 'passage',
    decision: 'deny',
    freshness: 'fresh',
    sourceDigest: digest({ denialRecord, lifecycleCommitId }),
  });
}
