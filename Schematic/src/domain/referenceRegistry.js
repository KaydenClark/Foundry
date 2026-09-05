import { FOUNDRY_PROJECTION } from "./foundryProjection.js";

const COLLECTION_ORDER = Object.freeze(["hall", "socket", "module", "workshop", "workbench"]);

export const REFERENCE_REGISTRY = Object.freeze({
  schemaVersion: 1,
  provenance: Object.freeze({
    label: "PUBLIC EXPLANATORY FIXTURE",
    source: "Foundry Canon projection + Schematic S-017",
    liveInventory: false,
    note: "Illustrative end-state records only. No host discovery, installed-repository scan, active binding lookup, credentials, or private project data.",
  }),
  collections: Object.freeze({
    hall: FOUNDRY_PROJECTION.halls,
    socket: FOUNDRY_PROJECTION.sockets,
    module: FOUNDRY_PROJECTION.modules,
    workshop: Object.freeze([
      Object.freeze({ id: "workshop-project", name: "Project Workshop", status: "ILLUSTRATIVE WORKSHOP", hallId: "7M2Q", workbenchId: "workbench-project", summary: "One bounded project room where a Workbench is applied to local Canon and Actuality." }),
    ]),
    workbench: Object.freeze([
      Object.freeze({
        id: "workbench-project",
        name: "Project Workbench",
        status: "PORTABLE HARNESS",
        workshopId: "workshop-project",
        summary: "The operating surface that turns one Workshop's governed context into traceable agent work.",
        anatomy: Object.freeze([
          Object.freeze({ name: "Contract", detail: "AGENTS and its thin bridge define behavior, authority, and edit scope." }),
          Object.freeze({ name: "Canon", detail: "Blueprint and Lexicon hold stable architecture and shared meaning." }),
          Object.freeze({ name: "Wiki / Brain", detail: "Maintained memory routes durable context without replacing live project controls." }),
          Object.freeze({ name: "Specifications", detail: "Stable specs own capability decisions, acceptance, tickets, and append-only proof." }),
          Object.freeze({ name: "Procedures", detail: "The Runbook owns exact install, verify, recovery, and demonstration commands." }),
          Object.freeze({ name: "Skills + Tools", detail: "Loadable techniques and deterministic utilities perform bounded tasks." }),
          Object.freeze({ name: "Tests", detail: "Focused and full checks provide repeatable evidence before promotion." }),
          Object.freeze({ name: "Workshop Application", detail: "The portable harness is applied to one project's own rooms, source, and controls." }),
        ]),
      }),
    ]),
  }),
});

function records(registry) {
  return COLLECTION_ORDER.flatMap((type) => (registry.collections?.[type] ?? []).map((record) => ({ ...record, type })));
}

export function resolveReference(registry, type, id) {
  if (!COLLECTION_ORDER.includes(type)) throw new RangeError(`Unsupported reference type: ${type}`);
  const record = registry.collections?.[type]?.find((candidate) => candidate.id === id);
  if (!record) throw new RangeError(`Unknown ${type} reference: ${id}`);
  return { ...record, type };
}

export function relatedReferences(registry, type, id) {
  const record = resolveReference(registry, type, id);
  if (type === "hall") {
    return [
      ...registry.collections.socket.filter((socket) => socket.homeHallId === id).map((socket) => ({ ...socket, type: "socket" })),
      ...registry.collections.workshop.filter((workshop) => workshop.hallId === id).map((workshop) => ({ ...workshop, type: "workshop" })),
    ];
  }
  if (type === "socket") {
    return [resolveReference(registry, "hall", record.homeHallId), ...record.moduleIds.map((moduleId) => resolveReference(registry, "module", moduleId))];
  }
  if (type === "module") return record.implementsSocketIds.map((socketId) => resolveReference(registry, "socket", socketId));
  if (type === "workshop") return [resolveReference(registry, "hall", record.hallId), resolveReference(registry, "workbench", record.workbenchId)];
  return [resolveReference(registry, "workshop", record.workshopId)];
}

export function validateReferenceRegistry(registry) {
  if (!registry?.collections) return ["Reference registry collections are required."];
  const errors = [];
  const all = records(registry);
  const ids = new Set();
  for (const record of all) {
    if (ids.has(record.id)) errors.push(`Duplicate reference ID ${record.id}.`);
    ids.add(record.id);
  }

  const has = (type, id) => registry.collections[type]?.some((record) => record.id === id);
  const emitted = new Set();
  const emit = (message) => { if (!emitted.has(message)) { emitted.add(message); errors.push(message); } };

  for (const module of registry.collections.module ?? []) {
    for (const socketId of module.implementsSocketIds ?? []) {
      if (!has("socket", socketId)) emit(`Module ${module.id} points to missing Socket ${socketId}.`);
      else {
        const socket = registry.collections.socket.find((candidate) => candidate.id === socketId);
        if (!socket.moduleIds.includes(module.id)) emit(`Socket ${socket.id} and Module ${module.id} must declare the same binding.`);
      }
    }
  }
  for (const socket of registry.collections.socket ?? []) {
    if (!has("hall", socket.homeHallId)) emit(`Socket ${socket.id} points to missing Hall ${socket.homeHallId}.`);
    if (!socket.contract) emit(`Socket ${socket.id} must declare a contract.`);
    for (const moduleId of socket.moduleIds ?? []) {
      if (!has("module", moduleId)) emit(`Socket ${socket.id} points to missing Module ${moduleId}.`);
      else {
        const module = registry.collections.module.find((candidate) => candidate.id === moduleId);
        if (!module.implementsSocketIds.includes(socket.id)) emit(`Socket ${socket.id} and Module ${module.id} must declare the same binding.`);
      }
    }
  }
  for (const workshop of registry.collections.workshop ?? []) {
    if (!has("hall", workshop.hallId)) emit(`Workshop ${workshop.id} points to missing Hall ${workshop.hallId}.`);
    if (!has("workbench", workshop.workbenchId)) emit(`Workshop ${workshop.id} points to missing Workbench ${workshop.workbenchId}.`);
  }
  for (const workbench of registry.collections.workbench ?? []) {
    if (!has("workshop", workbench.workshopId)) emit(`Workbench ${workbench.id} points to missing Workshop ${workbench.workshopId}.`);
    else {
      const workshop = registry.collections.workshop.find((candidate) => candidate.id === workbench.workshopId);
      if (workshop.workbenchId !== workbench.id) emit(`Workshop ${workshop.id} and Workbench ${workbench.id} must declare the same application.`);
    }
  }
  return errors;
}

export function selectReference(registry, selection) {
  resolveReference(registry, selection?.type, selection?.id);
  return { type: selection.type, id: selection.id };
}
