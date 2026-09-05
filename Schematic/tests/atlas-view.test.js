import assert from "node:assert/strict";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";

import {
  ATLAS_VIEW_DEFAULTS,
  ATLAS_VIEW_PRESETS,
  applyAtlasPreset,
  createAtlasView,
  resetAtlasView,
  rotateAtlas,
  selectAtlas,
  updateAtlasView,
} from "../src/view/atlasView.js";

test("the Atlas view starts in the owner-selected stacked composition", () => {
  const view = createAtlasView();

  assert.deepEqual(view, ATLAS_VIEW_DEFAULTS);
  assert.equal(view.yaw, -8);
  assert.equal(view.pitch, 4);
  assert.equal(view.separation, 1);
  assert.equal(view.routeIntensity, 0.85);
  assert.equal(view.crossingIntensity, 0.8);
  assert.equal(view.inactiveEmphasis, 0.58);
  assert.equal(view.showRoute, true);
  assert.equal(view.showCrossings, true);
  assert.equal(view.showLabels, true);
  assert.equal(view.showInactive, true);
  assert.deepEqual(view.selection, { kind: "floor", planeId: "projection", itemId: "projection" });
});

test("view sliders and toggles normalize values without mutating the prior state", () => {
  const view = createAtlasView();
  const updated = updateAtlasView(view, {
    separation: 99,
    routeIntensity: -1,
    crossingIntensity: 0.45,
    inactiveEmphasis: 0.2,
    showRoute: false,
    showCrossings: false,
    showLabels: false,
    showInactive: false,
  });

  assert.equal(updated.separation, 1.6);
  assert.equal(updated.routeIntensity, 0.1);
  assert.equal(updated.crossingIntensity, 0.45);
  assert.equal(updated.inactiveEmphasis, 0.2);
  assert.equal(updated.showRoute, false);
  assert.equal(updated.showCrossings, false);
  assert.equal(updated.showLabels, false);
  assert.equal(updated.showInactive, false);
  assert.equal(view.separation, 1);
  assert.deepEqual(resetAtlasView(), ATLAS_VIEW_DEFAULTS);
});

test("view-only changes leave task, authority, evidence, and trace untouched", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);

  updateAtlasView(createAtlasView(), {
    yaw: 24,
    separation: 1.6,
    showRoute: false,
    showInactive: false,
  });

  assert.deepEqual(run, before);
});

test("rotation supports four cardinal viewpoints while pitch remains legible", () => {
  const view = createAtlasView();
  const minimum = rotateAtlas(view, { yaw: -200, pitch: -200 });
  const maximum = rotateAtlas(view, { yaw: 200, pitch: 200 });
  const cardinalViews = [-180, -90, 0, 90, 180].map((yaw) => rotateAtlas(view, { yaw }).yaw);

  assert.equal(minimum.yaw, -180);
  assert.equal(minimum.pitch, -8);
  assert.equal(maximum.yaw, 180);
  assert.equal(maximum.pitch, 12);
  assert.deepEqual(cardinalViews, [-180, -90, 0, 90, 180]);
  assert.equal(view.yaw, ATLAS_VIEW_DEFAULTS.yaw);
});

test("floor, room, crossing, and token selection is stable explanatory state", () => {
  const runBeforeSelection = Object.freeze({ stepIndex: 3, trace: Object.freeze(["EVT-0001"]) });
  let view = createAtlasView();

  view = selectAtlas(view, { kind: "room", planeId: "actuality", itemId: "assay" });
  assert.deepEqual(view.selection, { kind: "room", planeId: "actuality", itemId: "assay" });

  view = selectAtlas(view, { kind: "crossing", planeId: "grounding", itemId: "grounding-canon" });
  assert.equal(view.selection.kind, "crossing");

  view = selectAtlas(view, { kind: "token", planeId: "grounding", itemId: "FEEDBACK-AUDIT-JO-01" });
  assert.equal(view.selection.kind, "token");
  assert.deepEqual(runBeforeSelection, { stepIndex: 3, trace: ["EVT-0001"] });
});

test("invalid Atlas selections fail visibly", () => {
  const view = createAtlasView();

  assert.throws(
    () => selectAtlas(view, { kind: "room", planeId: "actuality" }),
    /kind, planeId, and itemId/,
  );
  assert.throws(
    () => selectAtlas(view, { kind: "unknown", planeId: "actuality", itemId: "assay" }),
    /Unsupported Atlas selection kind/,
  );
});

test("task-oriented presets are complete, deterministic, and preserve selection", () => {
  assert.deepEqual(Object.keys(ATLAS_VIEW_PRESETS), [
    "factory-overview",
    "follow-job-order",
    "explain-crossing",
    "inspect-selection",
  ]);

  const selected = selectAtlas(createAtlasView(), {
    kind: "room",
    planeId: "actuality",
    itemId: "assay",
  });
  const followed = applyAtlasPreset(selected, "follow-job-order");
  const explained = applyAtlasPreset(followed, "explain-crossing");

  assert.equal(followed.preset, "follow-job-order");
  assert.equal(followed.showRoute, true);
  assert.equal(followed.showCrossings, true);
  assert.deepEqual(followed.selection, selected.selection);
  assert.equal(explained.preset, "explain-crossing");
  assert.equal(explained.crossingIntensity, 1);
  assert.deepEqual(explained.selection, selected.selection);
  const overview = applyAtlasPreset(explained, "factory-overview");
  assert.deepEqual({ ...overview, selection: ATLAS_VIEW_DEFAULTS.selection }, ATLAS_VIEW_DEFAULTS);
  assert.deepEqual(overview.selection, selected.selection);
});

test("preset changes leave deterministic run state untouched and invalid names fail", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);

  applyAtlasPreset(createAtlasView(), "inspect-selection");

  assert.deepEqual(run, before);
  assert.throws(
    () => applyAtlasPreset(createAtlasView(), "unknown-preset"),
    /Unsupported Atlas preset/,
  );
});
