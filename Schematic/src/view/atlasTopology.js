import { FOUNDRY_PROJECTION } from "../domain/foundryProjection.js";

const room = (record) => Object.freeze({
  ...record,
  point: Object.freeze(record.point),
});

const HALL_POINTS = Object.freeze({
  "2K7P": { x: 11, y: 49 }, "8L4T": { x: 30, y: 13 }, "6V1N": { x: 20, y: 76 },
  "3W9H": { x: 50, y: 10 }, "5B2Y": { x: 68, y: 14 }, "1R6F": { x: 89, y: 21 },
  "7C4J": { x: 90, y: 50 }, "7M2Q": { x: 50, y: 18 }, "9P8A": { x: 62, y: 50 },
  "4X8C": { x: 79, y: 30 }, "6G3S": { x: 21, y: 30 }, "9D3R": { x: 39, y: 79 },
  "2N5E": { x: 80, y: 76 },
});

const rooms = Object.freeze([
  room({
    id: "workspace",
    label: "MAIN FOUNDRY WORKSPACE",
    sub: "PROJECT WORK LIVES HERE",
    role: "hub",
    status: "native",
    point: { x: 50, y: 54 },
  }),
  ...FOUNDRY_PROJECTION.halls.map((hall) => room({
    id: hall.name.toLowerCase(),
    hallId: hall.id,
    label: hall.name.toUpperCase(),
    sub: hall.outputs[0].toUpperCase(),
    role: hall.name === "Gatehouse" ? "entrance" : hall.name === "Shipping" ? "outward" : "destination",
    status: hall.status === "PROVISIONAL HALL" ? "provisional" : "native",
    point: HALL_POINTS[hall.id],
  })),
]);

const roomsById = new Map(rooms.map((candidate) => [candidate.id, candidate]));

export const ATLAS_FLOOR_TOPOLOGY = Object.freeze({
  id: "foundry-floor",
  entrance: Object.freeze({ roomId: "gatehouse", edge: "inbound" }),
  hubRoomId: "workspace",
  rooms,
  passageways: Object.freeze(
    rooms
      .filter((candidate) => candidate.id !== "workspace")
      .map((candidate) => Object.freeze({ fromRoomId: candidate.id, toRoomId: "workspace" })),
  ),
});

export function resolveAtlasRoom(location) {
  const normalized = String(location ?? "").trim().toLowerCase();
  const namedHall = FOUNDRY_PROJECTION.halls.find((hall) => normalized.includes(hall.name.toLowerCase()));
  const roomId = namedHall?.name.toLowerCase() ?? ((normalized.includes("entrance") || normalized.includes("exit")) ? "gatehouse" : "workspace");
  return roomsById.get(roomId);
}

export function projectAtlasPoint(point, yaw = 0) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const degrees = Number(yaw);
  if (![x, y, degrees].every(Number.isFinite)) {
    throw new TypeError("Atlas projection requires a finite point and yaw.");
  }
  const radians = degrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const offsetX = x - 50;
  const offsetY = y - 50;
  const round = (value) => Math.round(value * 100) / 100;
  return Object.freeze({
    x: round(50 + (offsetX * cosine) - (offsetY * sine)),
    y: round(50 + (offsetX * sine) + (offsetY * cosine)),
  });
}

export function resolveAtlasGeometry(yaw = 0) {
  const projectedRooms = Object.freeze(rooms.map((candidate) => Object.freeze({
    ...candidate,
    projectedPoint: projectAtlasPoint(candidate.point, yaw),
  })));
  const gatehouse = projectedRooms.find((candidate) => candidate.id === ATLAS_FLOOR_TOPOLOGY.entrance.roomId);
  return Object.freeze({
    rooms: projectedRooms,
    gatehouseAnchor: gatehouse.projectedPoint,
  });
}

function resolveStepLocation(step, label) {
  if (!step || typeof step !== "object" || !step.planeId) {
    throw new TypeError(`${label} requires a planeId.`);
  }
  const resolvedRoom = resolveAtlasRoom(step.location);
  return Object.freeze({
    planeId: step.planeId,
    roomId: resolvedRoom.id,
    point: resolvedRoom.point,
  });
}

function passageway(planeId, from, to) {
  if (from.roomId === to.roomId) return null;
  return Object.freeze({
    kind: "passageway",
    planeId,
    fromRoomId: from.roomId,
    toRoomId: to.roomId,
    from: from.point,
    to: to.point,
  });
}

function passagewayPath(planeId, from, to) {
  if (from.roomId === to.roomId) return [];
  const hub = roomsById.get(ATLAS_FLOOR_TOPOLOGY.hubRoomId);
  const hubLocation = { roomId: hub.id, point: hub.point };
  if (from.roomId === hub.id || to.roomId === hub.id) {
    return [passageway(planeId, from, to)];
  }
  return [
    passageway(planeId, from, hubLocation),
    passageway(planeId, hubLocation, to),
  ];
}

export function resolveAtlasRoute({ fromStep, toStep } = {}) {
  const origin = resolveStepLocation(fromStep, "Atlas route origin");
  const destination = resolveStepLocation(toStep, "Atlas route destination");
  const samePlane = origin.planeId === destination.planeId;
  const gatehouse = roomsById.get(ATLAS_FLOOR_TOPOLOGY.entrance.roomId);
  const segments = [];

  if (samePlane) {
    segments.push(...passagewayPath(destination.planeId, origin, destination));
  } else {
    const sourceGatehouse = { roomId: gatehouse.id, point: gatehouse.point };
    segments.push(...passagewayPath(origin.planeId, origin, sourceGatehouse));
    segments.push(...passagewayPath(destination.planeId, sourceGatehouse, destination));
  }

  return Object.freeze({
    kind: samePlane ? "same-plane" : "plane-crossing",
    origin,
    destination,
    crossing: samePlane ? null : Object.freeze({
      kind: "crossing",
      fromPlaneId: origin.planeId,
      toPlaneId: destination.planeId,
      roomId: gatehouse.id,
    }),
    segments: Object.freeze(segments),
  });
}
