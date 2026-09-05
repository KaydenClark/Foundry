#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  allocateNextFuid,
  loadIdentityRegistry,
  resolveFuid,
  validateIdentityRegistry,
  validateInstanceIdentityRegistry,
} from "../../Foundry/tools/identity-registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadInstanceFuidRegistry(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, "fuid-registry.json"), "utf8"));
}

export function validateInstanceFuidRegistry(registry, root = ROOT) {
  const portable = loadIdentityRegistry(path.join(root, "Foundry", "manifest", "identity-registry.json"));
  return [
    ...validateIdentityRegistry(portable).map((error) => `portable: ${error}`),
    ...validateInstanceIdentityRegistry(registry, portable).map((error) => `instance: ${error}`),
  ];
}

export function resolveInstanceFuid(registry, reference, options = {}) {
  const binding = registry.bindings?.[reference];
  if (binding && (!options.scope || options.scope === binding.scope)) {
    const portable = loadIdentityRegistry();
    const entity = registry.entities?.[binding.fuid] || portable.entities?.[binding.fuid];
    return entity ? { fuid: binding.fuid, entity: { ...entity, name: binding.name, home: binding.home, scope: binding.scope }, binding } : null;
  }
  const instance = resolveFuid(registry, reference, options);
  if (instance) return instance;
  const portable = loadIdentityRegistry();
  return resolveFuid(portable, reference, options);
}

export function candidateFuid(registry, width, root = ROOT) {
  const allocator = registry.allocators?.[String(width)];
  if (!allocator) throw new Error(`No ${width}-character allocator is configured`);
  const portable = loadIdentityRegistry(path.join(root, "Foundry", "manifest", "identity-registry.json"));
  return allocateNextFuid({
    width,
    lastIssued: allocator.lastIssued,
    occupied: new Set([...Object.keys(registry.entities || {}), ...Object.keys(portable.entities || {})]),
    retired: new Set([...Object.keys(registry.retired || {}), ...Object.keys(portable.retired || {})]),
  });
}

function usage() {
  return "usage: fuid-registry.mjs check | resolve REFERENCE | next --width 4|6";
}

function main(argv) {
  const [command, ...args] = argv;
  const registry = loadInstanceFuidRegistry();
  if (command === "check") {
    const errors = validateInstanceFuidRegistry(registry);
    process.stdout.write(errors.length ? `${errors.map((error) => `error: ${error}`).join("\n")}\n` : "ok - WORKSPACE FUID registry valid\n");
    process.exitCode = errors.length ? 1 : 0;
    return;
  }
  if (command === "resolve" && args.length === 1) {
    const result = resolveInstanceFuid(registry, args[0]);
    if (!result) throw new Error(`Unknown FUID or alias '${args[0]}'`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "next" && args[0] === "--width" && new Set(["4", "6"]).has(args[1])) {
    process.stdout.write(`${candidateFuid(registry, Number(args[1]))}\n`);
    return;
  }
  throw new Error(usage());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
