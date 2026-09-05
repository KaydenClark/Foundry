#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_IDENTITY_REGISTRY_PATH = resolve(HERE, "..", "manifest", "identity-registry.json");
const ARCHITECTURAL_ID = /^[A-Z0-9]{4}$/;
const RUNTIME_PATTERN = "^[A-Z0-9]{6}$";
const ENTITY_TYPES = new Set(["hall", "module", "socket"]);
const INSTANCE_ENTITY_TYPES = new Set(["project", "workshop", "spec", "ticket", "intent-request", "job-order", "passage-receipt"]);
const WORK_ENTITY_TYPES = new Set(["spec", "ticket", "intent-request", "job-order", "passage-receipt"]);
const FUID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\")) return false;
  const segments = value.split("/");
  return !value.startsWith("/") && segments.every((segment) => segment && segment !== "." && segment !== "..");
}

export function loadIdentityRegistry(filePath = DEFAULT_IDENTITY_REGISTRY_PATH) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function fuidPattern(width) {
  return new RegExp(`^[A-Z0-9]{${width}}$`);
}

function zeroFuid(width) {
  return "0".repeat(width);
}

function registryIds(registry) {
  return new Set([
    ...Object.keys(registry?.entities || {}),
    ...Object.keys(registry?.retired || {}),
  ]);
}

export function allocateNextFuid({ width, lastIssued, occupied = new Set(), retired = new Set() }) {
  if (![4, 6].includes(width)) throw new Error("FUID width must be 4 or 6");
  if (!fuidPattern(width).test(lastIssued || "")) throw new Error(`last-issued FUID must be ${width} uppercase base36 characters`);
  const reserved = new Set([zeroFuid(width), ...occupied, ...retired]);
  const maximum = (36n ** BigInt(width)) - 1n;
  let candidate = BigInt(parseInt(lastIssued, 36));
  while (candidate < maximum) {
    candidate += 1n;
    const fuid = candidate.toString(36).toUpperCase().padStart(width, "0");
    if (!reserved.has(fuid)) return fuid;
  }
  throw new Error(`${width}-character FUID space exhausted`);
}

export function resolveFuid(registry, reference, { parent = null } = {}) {
  if (typeof reference !== "string" || !reference.trim()) return null;
  const value = reference.trim().toUpperCase();
  const direct = registry?.entities?.[value];
  if (direct) return { fuid: value, entity: direct };
  const matches = Object.entries(registry?.entities || {}).filter(([, entity]) =>
    (!parent || entity.parent === parent) && entity.aliases?.some((alias) => alias.toUpperCase() === value));
  if (matches.length > 1) throw new Error(`ambiguous FUID alias '${reference}'`);
  return matches.length ? { fuid: matches[0][0], entity: matches[0][1] } : null;
}

export function validateIdentityRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return ["registry must be an object"];
  if (!new Set(["1.0", "2.0"]).has(registry.schemaVersion)) errors.push("schemaVersion must be '1.0' or '2.0'");
  if (registry.artifact !== "foundry-identity-registry") errors.push("artifact must be 'foundry-identity-registry'");
  if (!registry.entities || typeof registry.entities !== "object" || Array.isArray(registry.entities)) {
    errors.push("entities must be an object");
    return errors;
  }

  const reserved = new Set();
  const aliases = new Set();
  for (const [key, entity] of Object.entries(registry.entities)) {
    if (!ARCHITECTURAL_ID.test(key)) errors.push(`invalid architectural id '${key}'`);
    if (reserved.has(key)) errors.push(`duplicate identity '${key}'`);
    reserved.add(key);
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      errors.push(`${key}: entity must be an object`);
      continue;
    }
    if (entity.id !== key) errors.push(`${key}: entity id must equal its registry key`);
    if (!ENTITY_TYPES.has(entity.type)) errors.push(`${key}: entity type must be hall, module, or socket`);
    if (typeof entity.name !== "string" || !entity.name.trim()) errors.push(`${key}: name must be a non-empty string`);
    if (!isSafeRelativePath(entity.home)) errors.push(`${key}: home must be a safe relative path`);
    if (!Array.isArray(entity.aliases)) {
      errors.push(`${key}: aliases must be an array`);
      continue;
    }
    for (const alias of entity.aliases) {
      if (typeof alias !== "string" || !alias.trim()) {
        errors.push(`${key}: aliases must contain non-empty strings`);
      } else if (aliases.has(alias)) {
        errors.push(`duplicate alias '${alias}'`);
      } else {
        aliases.add(alias);
      }
    }
  }

  if (!registry.retired || typeof registry.retired !== "object" || Array.isArray(registry.retired)) {
    errors.push("retired must be an object");
  } else {
    for (const id of Object.keys(registry.retired)) {
      if (!ARCHITECTURAL_ID.test(id)) errors.push(`invalid retired identity '${id}'`);
      if (reserved.has(id)) errors.push(`retired identity '${id}' is still active`);
      reserved.add(id);
    }
  }

  const runtime = registry.runtime;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    errors.push("runtime must be an object");
  } else {
    if (runtime.idPattern !== RUNTIME_PATTERN) errors.push(`runtime.idPattern must be '${RUNTIME_PATTERN}'`);
    if (!Array.isArray(runtime.types) || runtime.types.length === 0 || !runtime.types.every((type) => typeof type === "string" && type)) {
      errors.push("runtime.types must be a non-empty string array");
    }
    if (runtime.neverReuse !== true) errors.push("runtime.neverReuse must be true");
  }
  if (registry.schemaVersion === "2.0") {
    const allocation = registry.allocation;
    if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) {
      errors.push("allocation must be an object");
    } else {
      if (allocation.alphabet !== FUID_ALPHABET) errors.push(`allocation.alphabet must be '${FUID_ALPHABET}'`);
      if (allocation.zeroReserved !== true) errors.push("allocation.zeroReserved must be true");
      if (allocation.neverReuse !== true) errors.push("allocation.neverReuse must be true");
      if (allocation.widths?.architectural !== 4 || allocation.widths?.work !== 6) errors.push("allocation widths must be architectural=4 and work=6");
      if (allocation.authority !== "canonical-instance-registry") errors.push("allocation.authority must be 'canonical-instance-registry'");
    }
    const work = registry.work;
    if (!work || typeof work !== "object" || Array.isArray(work)) {
      errors.push("work must be an object");
    } else {
      if (work.idPattern !== RUNTIME_PATTERN) errors.push(`work.idPattern must be '${RUNTIME_PATTERN}'`);
      if (!Array.isArray(work.types) || ![...WORK_ENTITY_TYPES].every((type) => work.types.includes(type))) {
        errors.push("work.types must include spec, ticket, intent-request, job-order, and passage-receipt");
      }
      if (work.neverReuse !== true) errors.push("work.neverReuse must be true");
    }
  }
  return errors;
}

export function validateInstanceIdentityRegistry(registry, portableRegistry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return ["instance registry must be an object"];
  if (registry.schemaVersion !== "1.0") errors.push("instance schemaVersion must be '1.0'");
  if (registry.artifact !== "foundry-instance-identity-registry") errors.push("artifact must be 'foundry-instance-identity-registry'");

  const portableIds = registryIds(portableRegistry);
  const portableAliases = new Set(Object.values(portableRegistry?.entities || {}).flatMap((entity) => entity.aliases || []));
  const allocators = registry.allocators;
  if (!allocators || typeof allocators !== "object" || Array.isArray(allocators)) {
    errors.push("allocators must be an object");
  } else {
    for (const width of [4, 6]) {
      const allocator = allocators[String(width)];
      if (!allocator || allocator.width !== width || !fuidPattern(width).test(allocator.lastIssued || "")) {
        errors.push(`allocator ${width} must declare width ${width} and a fixed-width lastIssued value`);
      }
    }
  }

  if (!registry.entities || typeof registry.entities !== "object" || Array.isArray(registry.entities)) {
    errors.push("entities must be an object");
    return errors;
  }

  const active = new Set();
  const aliases = new Set();
  const workshopBindings = new Set(Object.values(registry.bindings || {})
    .filter((binding) => binding?.scope === "workshop")
    .map((binding) => binding.fuid));
  for (const [key, entity] of Object.entries(registry.entities)) {
    const width = new Set(["project", "workshop"]).has(entity?.type) ? 4 : 6;
    if (key === zeroFuid(width)) errors.push(`${key}: all-zero FUID is reserved`);
    if (!fuidPattern(width).test(key)) errors.push(`invalid ${width}-character FUID '${key}'`);
    if (portableIds.has(key)) errors.push(`${key}: identity is already reserved by the portable registry`);
    if (active.has(key)) errors.push(`duplicate identity '${key}'`);
    active.add(key);
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      errors.push(`${key}: entity must be an object`);
      continue;
    }
    if (entity.id !== key) errors.push(`${key}: entity id must equal its registry key`);
    if (!INSTANCE_ENTITY_TYPES.has(entity.type)) errors.push(`${key}: unsupported instance entity type '${entity.type}'`);
    if (typeof entity.name !== "string" || !entity.name.trim()) errors.push(`${key}: name must be a non-empty string`);
    if (!(entity.type === "workshop" && entity.home === ".") && !isSafeRelativePath(entity.home)) errors.push(`${key}: home must be a safe relative path`);
    if (!Array.isArray(entity.aliases)) {
      errors.push(`${key}: aliases must be an array`);
    } else {
      for (const alias of entity.aliases) {
        if (typeof alias !== "string" || !alias.trim()) {
          errors.push(`${key}: aliases must contain non-empty strings`);
          continue;
        }
        if (portableAliases.has(alias)) errors.push(`duplicate alias '${alias}'`);
        const aliasKey = alias.includes("/") || !entity.parent ? alias : `${entity.parent}/${alias}`;
        if (aliases.has(aliasKey)) errors.push(`duplicate alias '${alias}'`);
        aliases.add(aliasKey);
      }
    }
    if (new Set(["spec", "ticket"]).has(entity.type)) {
      if (!ISO_DATE.test(entity.created || "")) errors.push(`${key}: Created must be an ISO date`);
      if (!ISO_DATE.test(entity.lastWorked || "")) errors.push(`${key}: Last worked must be an ISO date`);
      if (ISO_DATE.test(entity.created || "") && ISO_DATE.test(entity.lastWorked || "") && entity.lastWorked < entity.created) {
        errors.push(`${key}: Last worked precedes Created`);
      }
    }
  }

  for (const [key, entity] of Object.entries(registry.entities)) {
    if (entity.parent && !active.has(entity.parent) && !portableIds.has(entity.parent)) errors.push(`${key}: parent '${entity.parent}' is not active`);
    if (entity.type === "spec" && !new Set(["project", "workshop"]).has(registry.entities[entity.parent]?.type) && !workshopBindings.has(entity.parent)) errors.push(`${key}: spec parent must be a project or workshop`);
    if (entity.type === "ticket" && registry.entities[entity.parent]?.type !== "spec") errors.push(`${key}: ticket parent must be a spec`);
  }

  if (registry.bindings !== undefined) {
    if (!registry.bindings || typeof registry.bindings !== "object" || Array.isArray(registry.bindings)) {
      errors.push("bindings must be an object");
    } else {
      for (const [alias, binding] of Object.entries(registry.bindings)) {
        if (!alias.trim()) errors.push("binding alias must be non-empty");
        if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
          errors.push(`${alias}: binding must be an object`);
          continue;
        }
        if (!active.has(binding.fuid) && !portableIds.has(binding.fuid)) errors.push(`${alias}: binding FUID '${binding.fuid}' is not active`);
        if (binding.scope !== "workshop") errors.push(`${alias}: binding scope must be 'workshop'`);
        if (typeof binding.name !== "string" || !binding.name.trim()) errors.push(`${alias}: binding name must be non-empty`);
        if (!isSafeRelativePath(binding.home)) errors.push(`${alias}: binding home must be a safe relative path`);
        if (aliases.has(alias)) errors.push(`duplicate alias '${alias}'`);
        aliases.add(alias);
        const portableMatch = Object.entries(portableRegistry?.entities || {}).find(([, entity]) => entity.aliases?.includes(alias));
        if (portableMatch && portableMatch[0] !== binding.fuid && binding.scope !== "workshop") errors.push(`duplicate alias '${alias}'`);
      }
    }
  }

  if (!registry.retired || typeof registry.retired !== "object" || Array.isArray(registry.retired)) {
    errors.push("retired must be an object");
  } else {
    for (const [key, record] of Object.entries(registry.retired)) {
      if (![4, 6].some((width) => fuidPattern(width).test(key))) errors.push(`invalid retired FUID '${key}'`);
      if ([zeroFuid(4), zeroFuid(6)].includes(key)) errors.push(`${key}: all-zero FUID is reserved`);
      if (active.has(key)) errors.push(`retired identity '${key}' is still active`);
      if (portableIds.has(key)) errors.push(`${key}: identity is already reserved by the portable registry`);
      for (const alias of record?.aliases || []) {
        if (portableAliases.has(alias)) errors.push(`duplicate alias '${alias}'`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateIdentityRegistry(loadIdentityRegistry());
  console.log(errors.length ? errors.map((error) => `error: ${error}`).join("\n") : "ok - Foundry identity registry valid");
  process.exitCode = errors.length ? 1 : 0;
}
