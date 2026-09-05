const LIMITS = Object.freeze({
  yaw: Object.freeze({ min: -180, max: 180 }),
  pitch: Object.freeze({ min: -8, max: 12 }),
  separation: Object.freeze({ min: 0.75, max: 1.6 }),
  routeIntensity: Object.freeze({ min: 0.1, max: 1 }),
  crossingIntensity: Object.freeze({ min: 0.1, max: 1 }),
  inactiveEmphasis: Object.freeze({ min: 0.15, max: 0.9 }),
});

const SELECTION_KINDS = new Set(["floor", "room", "crossing", "token"]);
const PRESET_NAMES = new Set(["factory-overview", "follow-job-order", "explain-crossing", "inspect-selection", "custom"]);

function clamp(value, { min, max }, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return Math.min(Math.max(number, min), max);
}

function normalizeSelection(selection) {
  if (!selection || typeof selection !== "object") throw new TypeError("Atlas selection is required.");
  const { kind, planeId, itemId } = selection;
  if (!kind || !planeId || !itemId) throw new TypeError("Atlas selection requires kind, planeId, and itemId.");
  if (!SELECTION_KINDS.has(kind)) throw new RangeError(`Unsupported Atlas selection kind: ${kind}`);
  return Object.freeze({ kind, planeId, itemId });
}

function boolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return value;
}

const FACTORY_OVERVIEW = Object.freeze({
  yaw: -8,
  pitch: 4,
  separation: 1,
  routeIntensity: 0.85,
  crossingIntensity: 0.8,
  inactiveEmphasis: 0.58,
  showRoute: true,
  showCrossings: true,
  showLabels: true,
  showInactive: true,
  preset: "factory-overview",
});

export const ATLAS_VIEW_PRESETS = Object.freeze({
  "factory-overview": FACTORY_OVERVIEW,
  "follow-job-order": Object.freeze({
    yaw: -8,
    pitch: 3,
    separation: 0.88,
    routeIntensity: 1,
    crossingIntensity: 1,
    inactiveEmphasis: 0.3,
    showRoute: true,
    showCrossings: true,
    showLabels: true,
    showInactive: true,
    preset: "follow-job-order",
  }),
  "explain-crossing": Object.freeze({
    yaw: 0,
    pitch: 5,
    separation: 1.12,
    routeIntensity: 1,
    crossingIntensity: 1,
    inactiveEmphasis: 0.4,
    showRoute: true,
    showCrossings: true,
    showLabels: true,
    showInactive: true,
    preset: "explain-crossing",
  }),
  "inspect-selection": Object.freeze({
    yaw: -8,
    pitch: 5,
    separation: 1.08,
    routeIntensity: 0.72,
    crossingIntensity: 0.78,
    inactiveEmphasis: 0.46,
    showRoute: true,
    showCrossings: true,
    showLabels: true,
    showInactive: true,
    preset: "inspect-selection",
  }),
});

export const ATLAS_VIEW_DEFAULTS = Object.freeze({
  ...FACTORY_OVERVIEW,
  selection: Object.freeze({ kind: "floor", planeId: "projection", itemId: "projection" }),
});

function normalizePreset(preset) {
  if (!PRESET_NAMES.has(preset)) throw new RangeError(`Unsupported Atlas preset: ${preset}`);
  return preset;
}

export function createAtlasView(overrides = {}) {
  return Object.freeze({
    yaw: clamp(overrides.yaw ?? ATLAS_VIEW_DEFAULTS.yaw, LIMITS.yaw, "Atlas yaw"),
    pitch: clamp(overrides.pitch ?? ATLAS_VIEW_DEFAULTS.pitch, LIMITS.pitch, "Atlas pitch"),
    separation: clamp(overrides.separation ?? ATLAS_VIEW_DEFAULTS.separation, LIMITS.separation, "Atlas separation"),
    routeIntensity: clamp(overrides.routeIntensity ?? ATLAS_VIEW_DEFAULTS.routeIntensity, LIMITS.routeIntensity, "Route intensity"),
    crossingIntensity: clamp(overrides.crossingIntensity ?? ATLAS_VIEW_DEFAULTS.crossingIntensity, LIMITS.crossingIntensity, "Crossing intensity"),
    inactiveEmphasis: clamp(overrides.inactiveEmphasis ?? ATLAS_VIEW_DEFAULTS.inactiveEmphasis, LIMITS.inactiveEmphasis, "Inactive floor emphasis"),
    showRoute: boolean(overrides.showRoute ?? ATLAS_VIEW_DEFAULTS.showRoute, "Route visibility"),
    showCrossings: boolean(overrides.showCrossings ?? ATLAS_VIEW_DEFAULTS.showCrossings, "Crossing visibility"),
    showLabels: boolean(overrides.showLabels ?? ATLAS_VIEW_DEFAULTS.showLabels, "Label visibility"),
    showInactive: boolean(overrides.showInactive ?? ATLAS_VIEW_DEFAULTS.showInactive, "Inactive-floor visibility"),
    preset: normalizePreset(overrides.preset ?? ATLAS_VIEW_DEFAULTS.preset),
    selection: normalizeSelection(overrides.selection ?? ATLAS_VIEW_DEFAULTS.selection),
  });
}

export function updateAtlasView(view, patch = {}) {
  if (!view || typeof view !== "object") throw new TypeError("Current Atlas view is required.");
  if (!patch || typeof patch !== "object") throw new TypeError("Atlas view patch must be an object.");
  const changesView = Object.keys(patch).some((key) => !["preset", "selection"].includes(key));
  return createAtlasView({ ...view, ...patch, preset: patch.preset ?? (changesView ? "custom" : view.preset) });
}

export function rotateAtlas(view, rotation = {}) {
  return updateAtlasView(view, {
    yaw: rotation.yaw ?? view.yaw,
    pitch: rotation.pitch ?? view.pitch,
  });
}

export function selectAtlas(view, selection) {
  return updateAtlasView(view, { selection: normalizeSelection(selection) });
}

export function applyAtlasPreset(view, presetName) {
  if (!view || typeof view !== "object") throw new TypeError("Current Atlas view is required.");
  const preset = ATLAS_VIEW_PRESETS[presetName];
  if (!preset) throw new RangeError(`Unsupported Atlas preset: ${presetName}`);
  return createAtlasView({ ...view, ...preset, selection: view.selection });
}

export function resetAtlasView() {
  return createAtlasView();
}

export const ATLAS_VIEW_LIMITS = LIMITS;
