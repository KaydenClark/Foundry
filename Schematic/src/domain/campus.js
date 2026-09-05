import { FOUNDRY_PROJECTION } from "./foundryProjection.js";

const ENTITY_COLLECTIONS = Object.freeze({
  factory: "factories",
  hall: "halls",
  module: "modules",
  socket: "sockets",
  workshop: "workshops",
  facility: "facilities",
});

const HALL_POSITIONS = Object.freeze({
  "2K7P": { x: 29, y: 28 }, "8L4T": { x: 40, y: 22 }, "6V1N": { x: 36, y: 54 },
  "3W9H": { x: 51, y: 19 }, "5B2Y": { x: 63, y: 23 }, "1R6F": { x: 70, y: 31 },
  "7C4J": { x: 73, y: 45 }, "7M2Q": { x: 46, y: 38 }, "9P8A": { x: 58, y: 38 },
  "4X8C": { x: 61, y: 51 }, "6G3S": { x: 53, y: 62 }, "9D3R": { x: 42, y: 66 },
  "2N5E": { x: 72, y: 61 },
});

const CAMPUS_HALLS = Object.freeze(FOUNDRY_PROJECTION.halls.map((hall) => Object.freeze({
  id: hall.id,
  factoryId: "factory-east",
  name: hall.name,
  label: hall.status,
  position: Object.freeze(HALL_POSITIONS[hall.id]),
  detail: hall.summary,
})));

export const CAMPUS = Object.freeze({
  id: "foundry-end-state-campus",
  name: "The Foundry",
  factories: Object.freeze([
    Object.freeze({
      id: "factory-east",
      modelId: "portable-foundry",
      name: "Factory East",
      label: "PRIMARY FACTORY",
      floors: 6,
      position: Object.freeze({ x: 47, y: 45 }),
      detail: "One host deployment of the portable Foundry: six repeated factory floors with native Halls inside.",
    }),
    Object.freeze({
      id: "factory-west",
      modelId: "portable-foundry",
      name: "Factory West",
      label: "SECOND HOST",
      floors: 6,
      position: Object.freeze({ x: 78, y: 24 }),
      detail: "A second host deployment of the same portable Foundry model, proving the campus is not one machine.",
    }),
  ]),
  halls: CAMPUS_HALLS,
  workshops: Object.freeze([
    Object.freeze({ id: "workshop-alpha", factoryId: "factory-east", name: "Project Workshop", label: "WORKBENCH ACTIVE", position: Object.freeze({ x: 46, y: 54 }), detail: "A project work area whose Workbench applies the harness to one enrolled project." }),
  ]),
  modules: Object.freeze([
    Object.freeze({ id: "module-memory", name: "Memory Module", label: "DURABLE CONTEXT", position: Object.freeze({ x: 16, y: 28 }), detail: "A replaceable supporting building reached only through its declared Socket contract." }),
    Object.freeze({ id: "module-interface", name: "Interface Module", label: "CONTROL SURFACE", position: Object.freeze({ x: 17, y: 68 }), detail: "A replaceable supporting building that presents approved controls through a typed boundary." }),
    Object.freeze({ id: "module-messaging", name: "Messaging Module", label: "DELIVERY", position: Object.freeze({ x: 76, y: 70 }), detail: "A replaceable supporting building that carries approved outbound messages through a Socket." }),
  ]),
  sockets: Object.freeze([
    Object.freeze({ id: "socket-memory-east", name: "Memory Socket", factoryId: "factory-east", moduleId: "module-memory", contract: "memory.lookup.v1", detail: "A typed contract and conduit between Factory East and the replaceable Memory Module." }),
    Object.freeze({ id: "socket-interface-east", name: "Interface Socket", factoryId: "factory-east", moduleId: "module-interface", contract: "interface.control.v1", detail: "A typed contract and conduit between Factory East and the replaceable Interface Module." }),
    Object.freeze({ id: "socket-messaging-east", name: "Messaging Socket", factoryId: "factory-east", moduleId: "module-messaging", contract: "messaging.delivery.v1", detail: "A typed contract and conduit between Factory East and the replaceable Messaging Module." }),
    Object.freeze({ id: "socket-memory-west", name: "Memory Socket", factoryId: "factory-west", moduleId: "module-memory", contract: "memory.lookup.v1", detail: "The same typed Memory contract bound by the second Factory deployment." }),
  ]),
  facilities: Object.freeze([
    Object.freeze({ id: "facility-power", name: "Power House", label: "SUPPORTING FACILITY", position: Object.freeze({ x: 88, y: 50 }), detail: "Illustrative campus infrastructure. It is not a Hall, Module, Socket, or authority boundary." }),
    Object.freeze({ id: "facility-shipping", name: "Shipping Yard", label: "CANDIDATE / UNSETTLED", position: Object.freeze({ x: 42, y: 78 }), detail: "A visible candidate facility whose future product role is intentionally not settled by this drawing." }),
  ]),
});

export const CAMPUS_VIEW_DEFAULTS = Object.freeze({
  yaw: -18,
  pitch: 8,
  selection: Object.freeze({ kind: "factory", id: "factory-east" }),
});

export function validateCampus(campus) {
  if (!campus || typeof campus !== "object") return ["Campus is required."];

  const errors = [];
  const factories = new Set((campus.factories ?? []).map((factory) => factory.id));
  const modules = new Set((campus.modules ?? []).map((module) => module.id));

  for (const factory of campus.factories ?? []) {
    if (factory.modelId !== "portable-foundry" || factory.floors !== 6) {
      errors.push(`Factory ${factory.id} must repeat the six-floor Foundry model.`);
    }
  }
  for (const hall of campus.halls ?? []) {
    if (!factories.has(hall.factoryId)) errors.push(`Hall ${hall.id} points to missing Factory ${hall.factoryId}.`);
  }
  for (const workshop of campus.workshops ?? []) {
    if (!factories.has(workshop.factoryId)) errors.push(`Workshop ${workshop.id} points to missing Factory ${workshop.factoryId}.`);
  }
  for (const socket of campus.sockets ?? []) {
    if (!factories.has(socket.factoryId)) errors.push(`Socket ${socket.id} points to missing Factory ${socket.factoryId}.`);
    if (!modules.has(socket.moduleId)) errors.push(`Socket ${socket.id} points to missing Module ${socket.moduleId}.`);
    if (!socket.contract) errors.push(`Socket ${socket.id} must declare a contract.`);
  }

  return errors;
}

export function resolveCampusEntity(campus, kind, id) {
  const collectionName = ENTITY_COLLECTIONS[kind];
  if (!collectionName) throw new RangeError(`Unsupported campus entity kind: ${kind}`);
  const entity = campus[collectionName]?.find((candidate) => candidate.id === id);
  if (!entity) throw new RangeError(`Unknown ${kind} campus entity: ${id}`);
  return { ...entity, kind };
}

export function createCampusView() {
  return {
    ...CAMPUS_VIEW_DEFAULTS,
    selection: { ...CAMPUS_VIEW_DEFAULTS.selection },
  };
}

export function rotateCampus(view, rotation) {
  const yaw = Math.max(-180, Math.min(180, Number(rotation.yaw ?? view.yaw)));
  const pitch = Math.max(0, Math.min(16, Number(rotation.pitch ?? view.pitch)));
  return { ...view, yaw, pitch };
}

export function selectCampusEntity(view, campus, kind, id) {
  resolveCampusEntity(campus, kind, id);
  return { ...view, selection: { kind, id } };
}
