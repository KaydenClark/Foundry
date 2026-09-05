#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allocateNextFuid,
  loadIdentityRegistry,
  resolveFuid,
  validateIdentityRegistry,
  validateInstanceIdentityRegistry,
} from "./identity-registry.mjs";

const registry = loadIdentityRegistry();
assert.deepEqual(validateIdentityRegistry(registry), [], "shipped identity registry validates clean");

const entities = Object.values(registry.entities);
const manifest = JSON.parse(readFileSync(new URL("../manifest/foundry.json", import.meta.url), "utf8"));
const socketRegistry = JSON.parse(readFileSync(new URL("../Halls/Forge/tools/socket-registry/registry.json", import.meta.url), "utf8"));
const declaredHalls = manifest.components.filter((component) => component.tier === "native-hall");
const declaredModules = manifest.components.filter((component) => component.tier === "installed-module");
const currentSocketNames = ["Activity Signal", "Grounding Journal", "Lifecycle Transition", "Passage Finding", "Passage Receipt", "Recall", "Workflow Handoff"];
assert.equal(entities.filter((entity) => entity.type === "hall").length, declaredHalls.length, "every manifest-declared native Hall has a permanent identity");
assert.equal(entities.filter((entity) => entity.type === "module").length, declaredModules.length, "every manifest-declared Module has a permanent identity");
assert.deepEqual(entities.filter((entity) => entity.type === "socket").map(({ name }) => name).sort(), currentSocketNames, "every current Canon-declared Socket has a permanent identity");
assert.equal(registry.entities["6A9G"].name, "Activity Signal", "Activity Signal identity remains unchanged");
assert.ok(entities.every((entity) => /^[A-Z0-9]{4}$/.test(entity.id)), "architectural identities are four alphanumeric characters");
assert.equal(registry.runtime.idPattern, "^[A-Z0-9]{6}$", "runtime records use six-character identities");
assert.equal(registry.runtime.neverReuse, true, "runtime identities are never reused");
assert.deepEqual(registry.allocation, {
  alphabet: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  zeroReserved: true,
  neverReuse: true,
  widths: { architectural: 4, work: 6 },
  authority: "canonical-instance-registry",
}, "portable registry declares the shared FUID allocation policy without instance high-water state");

for (const component of manifest.components) {
  const entity = entities.find((candidate) => candidate.aliases.includes(component.id));
  assert.ok(entity, `${component.id} has a permanent identity alias`);
  assert.equal(
    entity.home,
    component.tier === "native-hall" ? component.path : component.destination,
    `${component.id} registry home matches the declared product location`,
  );
}
for (const socketId of Object.keys(socketRegistry.sockets)) {
  assert.ok(entities.some((entity) => entity.aliases.includes(socketId)), `${socketId} has a permanent identity alias`);
}

const duplicateAlias = structuredClone(registry);
duplicateAlias.entities["7M2Q"].aliases.push("K-001");
assert.ok(
  validateIdentityRegistry(duplicateAlias).some((error) => error.includes("duplicate alias 'K-001'")),
  "legacy aliases cannot identify two permanent entities",
);

const badRuntimePattern = structuredClone(registry);
badRuntimePattern.runtime.idPattern = "^[A-Z0-9]{4}$";
assert.ok(
  validateIdentityRegistry(badRuntimePattern).some((error) => error.includes("runtime.idPattern")),
  "runtime records cannot use architectural identity width",
);

const missingHome = structuredClone(registry);
delete missingHome.entities["5R1K"].home;
assert.ok(
  validateIdentityRegistry(missingHome).some((error) => error.includes("5R1K: home must be a safe relative path")),
  "every movable entity has an explicit registry home",
);

assert.equal(allocateNextFuid({ width: 4, lastIssued: "0000" }), "0001");
assert.equal(allocateNextFuid({ width: 4, lastIssued: "0008" }), "0009");
assert.equal(allocateNextFuid({ width: 4, lastIssued: "0009" }), "000A");
assert.equal(allocateNextFuid({ width: 4, lastIssued: "000Z" }), "0010");
assert.equal(allocateNextFuid({ width: 6, lastIssued: "00000Z" }), "000010");
assert.equal(
  allocateNextFuid({ width: 4, lastIssued: "0009", occupied: new Set(["000A", "000B"]), retired: new Set(["000C"]) }),
  "000D",
  "allocator skips active and retired identities",
);
assert.throws(
  () => allocateNextFuid({ width: 4, lastIssued: "ZZZZ" }),
  /exhausted/,
  "allocator fails closed when the fixed width is exhausted",
);

const instanceRegistry = {
  schemaVersion: "1.0",
  artifact: "foundry-instance-identity-registry",
  allocators: {
    "4": { width: 4, lastIssued: "0002" },
    "6": { width: 6, lastIssued: "000002" },
  },
  entities: {
    "0001": { id: "0001", type: "project", name: "Alpha", home: "Projects/Alpha", aliases: ["P-001"] },
    "000001": { id: "000001", type: "spec", name: "Baseline", home: "Projects/Alpha/specs/S-001-baseline/SPEC.md", aliases: ["P-001/S-001", "S-001"], parent: "0001", created: "2026-08-18", lastWorked: "2026-08-18" },
    "000002": { id: "000002", type: "ticket", name: "First slice", home: "Projects/Alpha/specs/S-001-baseline/SPEC.md", aliases: ["P-001/S-001/TK-001", "TK-001"], parent: "000001", created: "2026-08-18", lastWorked: "2026-08-19" },
  },
  retired: {
    "0002": { retiredAt: "2026-08-18", aliases: ["P-099"] },
  },
};
assert.deepEqual(validateInstanceIdentityRegistry(instanceRegistry, registry), [], "instance FUID registry composes with portable identities");
assert.equal(resolveFuid(instanceRegistry, "P-001/S-001/TK-001").fuid, "000002", "typed alias resolves to FUID");
assert.equal(resolveFuid(instanceRegistry, "000001").entity.type, "spec", "FUID resolves directly");

const duplicatePortable = structuredClone(instanceRegistry);
duplicatePortable.entities["7M2Q"] = { id: "7M2Q", type: "project", name: "Collision", home: "Projects/Collision", aliases: ["P-099"] };
assert.ok(validateInstanceIdentityRegistry(duplicatePortable, registry).some((error) => error.includes("already reserved by the portable registry")));

const duplicateTypedAlias = structuredClone(instanceRegistry);
duplicateTypedAlias.entities["000001"].aliases.push("F-001");
assert.ok(validateInstanceIdentityRegistry(duplicateTypedAlias, registry).some((error) => error.includes("duplicate alias 'F-001'")));

const badDates = structuredClone(instanceRegistry);
badDates.entities["000002"].lastWorked = "2026-08-17";
assert.ok(validateInstanceIdentityRegistry(badDates, registry).some((error) => error.includes("Last worked precedes Created")));

const missingParent = structuredClone(instanceRegistry);
missingParent.entities["000002"].parent = "999999";
assert.ok(validateInstanceIdentityRegistry(missingParent, registry).some((error) => error.includes("parent '999999' is not active")));

const zeroIdentity = structuredClone(instanceRegistry);
zeroIdentity.entities["0000"] = { id: "0000", type: "project", name: "Zero", home: "Projects/Zero", aliases: [] };
assert.ok(validateInstanceIdentityRegistry(zeroIdentity, registry).some((error) => error.includes("all-zero FUID is reserved")));

console.log("ok - Foundry identity registry passed");
