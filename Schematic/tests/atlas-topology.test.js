import assert from "node:assert/strict";
import test from "node:test";

import { createRun, transitionRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";
import {
  ATLAS_FLOOR_TOPOLOGY,
  projectAtlasPoint,
  resolveAtlasGeometry,
  resolveAtlasRoom,
  resolveAtlasRoute,
} from "../src/view/atlasTopology.js";
import { FOUNDRY_PROJECTION } from "../src/domain/foundryProjection.js";

test("the repeated Atlas floor is a hub-and-spoke thirteen-Hall Projection with provisional Shipping", () => {
  const rooms = Object.fromEntries(ATLAS_FLOOR_TOPOLOGY.rooms.map((room) => [room.id, room]));

  assert.deepEqual(ATLAS_FLOOR_TOPOLOGY.entrance, {
    roomId: "gatehouse",
    edge: "inbound",
  });
  assert.equal(rooms.workspace.role, "hub");
  assert.deepEqual(rooms.workspace.point, { x: 50, y: 54 });
  assert.equal(rooms.gatehouse.role, "entrance");
  assert.equal(rooms.shipping.role, "outward");
  assert.equal(rooms.shipping.status, "provisional");
  assert.deepEqual(
    ATLAS_FLOOR_TOPOLOGY.rooms.filter((room) => room.hallId).map(({ hallId }) => hallId),
    FOUNDRY_PROJECTION.halls.map(({ id }) => id),
  );
  assert.equal(ATLAS_FLOOR_TOPOLOGY.rooms.length, 14);
});

test("the real seed demonstrates an intra-floor Job Order move before its next Crossing", () => {
  let run = createRun(feedbackAuditScenario, 1);
  while (feedbackAuditScenario.steps[run.stepIndex].id !== "enter-actuality") {
    run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
  }
  const states = [];
  for (let index = 0; index < 3; index += 1) {
    states.push({
      step: feedbackAuditScenario.steps[run.stepIndex],
      tokenRoomId: resolveAtlasRoom(run.jobOrder.location).id,
    });
    if (index < 2) run = transitionRun(run, { type: "STEP" }, feedbackAuditScenario);
  }

  assert.deepEqual(states.map(({ step }) => step.id), [
    "enter-actuality",
    "stage-actuality-workspace",
    "perform-audit",
  ]);
  assert.deepEqual(states.map(({ tokenRoomId }) => tokenRoomId), ["gatehouse", "workspace", "assay"]);
  for (let index = 1; index < states.length; index += 1) {
    const route = resolveAtlasRoute({ fromStep: states[index - 1].step, toStep: states[index].step });
    assert.equal(route.kind, "same-plane");
    assert.equal(route.crossing, null);
    assert.equal(route.segments.length, 1);
    assert.equal(route.segments[0].fromRoomId, states[index - 1].tokenRoomId);
    assert.equal(route.segments[0].toRoomId, states[index].tokenRoomId);
    assert.equal(route.destination.roomId, states[index].tokenRoomId);
  }
});

test("cardinal orbit projects the floor plan around its central workspace without collapsing it", () => {
  const gatehouse = ATLAS_FLOOR_TOPOLOGY.rooms.find((room) => room.id === "gatehouse");

  assert.deepEqual(projectAtlasPoint(gatehouse.point, 0), { x: 20, y: 76 });
  assert.deepEqual(projectAtlasPoint(gatehouse.point, 90), { x: 24, y: 20 });
  assert.deepEqual(projectAtlasPoint(gatehouse.point, 180), { x: 80, y: 24 });
  assert.deepEqual(projectAtlasPoint(gatehouse.point, -90), { x: 76, y: 80 });
});

test("renderer geometry exposes the projected Gatehouse anchor at cardinal angles", () => {
  const expected = new Map([
    [0, { x: 20, y: 76 }],
    [90, { x: 24, y: 20 }],
    [180, { x: 80, y: 24 }],
    [-90, { x: 76, y: 80 }],
  ]);
  for (const [yaw, point] of expected) {
    const geometry = resolveAtlasGeometry(yaw);
    const gatehouse = geometry.rooms.find((room) => room.id === "gatehouse");
    assert.strictEqual(geometry.gatehouseAnchor, gatehouse.projectedPoint);
    assert.deepEqual(geometry.gatehouseAnchor, point);
  }
});

test("a same-plane step resolves to a room-to-room Passageway without a Crossing", () => {
  const route = resolveAtlasRoute({
    fromStep: { planeId: "grounding", location: "Main Foundry Workspace" },
    toStep: { planeId: "grounding", location: "Assay evidence bench" },
  });

  assert.equal(route.kind, "same-plane");
  assert.equal(route.crossing, null);
  assert.deepEqual(route.destination, {
    planeId: "grounding",
    roomId: "assay",
    point: { x: 79, y: 30 },
  });
  assert.deepEqual(route.segments, [{
    kind: "passageway",
    planeId: "grounding",
    fromRoomId: "workspace",
    toRoomId: "assay",
    from: { x: 50, y: 54 },
    to: { x: 79, y: 30 },
  }]);
});

test("a plane change routes through Gatehouse before entering the destination floor", () => {
  const route = resolveAtlasRoute({
    fromStep: { planeId: "canon", location: "Gatehouse issue desk" },
    toStep: { planeId: "actuality", location: "Assay workbench" },
  });

  assert.equal(route.kind, "plane-crossing");
  assert.deepEqual(route.crossing, {
    kind: "crossing",
    fromPlaneId: "canon",
    toPlaneId: "actuality",
    roomId: "gatehouse",
  });
  assert.deepEqual(route.segments.map(({ fromRoomId, toRoomId }) => [fromRoomId, toRoomId]), [
    ["gatehouse", "workspace"],
    ["workspace", "assay"],
  ]);
});

test("every emitted route segment traverses a declared topology Passageway", () => {
  const declaredEdges = new Set(ATLAS_FLOOR_TOPOLOGY.passageways.map(({ fromRoomId, toRoomId }) => (
    [fromRoomId, toRoomId].sort().join(":")
  )));
  const routes = [
    resolveAtlasRoute({
      fromStep: { planeId: "actuality", location: "Assay workbench" },
      toStep: { planeId: "actuality", location: "Foundry exit" },
    }),
    resolveAtlasRoute({
      fromStep: { planeId: "actuality", location: "Assay workbench" },
      toStep: { planeId: "grounding", location: "Assay evidence bench" },
    }),
  ];

  assert.deepEqual(
    routes[0].segments.map(({ fromRoomId, toRoomId }) => [fromRoomId, toRoomId]),
    [["assay", "workspace"], ["workspace", "gatehouse"]],
  );
  for (const route of routes) {
    for (const segment of route.segments) {
      assert.ok(declaredEdges.has([segment.fromRoomId, segment.toRoomId].sort().join(":")));
    }
  }
});
