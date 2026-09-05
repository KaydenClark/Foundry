/**
 * A local-only runtime for explanatory Foundry Schematic routes.
 *
 * It deliberately has no I/O, timers, DOM access, or live control adapter.
 * A browser view can subscribe to state changes; a Node consumer can validate
 * the same route data before rendering it.
 */

const AUTHORITY_SEQUENCE = [
  "projection-signal",
  "intent-candidate",
  "grounding",
  "canon-issue",
  "actuality",
  "grounding-receipt",
  "intent-disposition",
  "projection-capture",
];

const ACTOR_TYPES = new Set(["pawn", "agent", "owner"]);
const FRESHNESS = new Set(["fresh", "stale"]);
const MODES = new Set(["atlas", "simulation"]);

export class RuntimeValidationError extends Error {
  constructor(errors) {
    super(`Simulation route validation failed: ${errors.join("; ")}`);
    this.name = "RuntimeValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isoTimestamp(value) {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) freeze(item);
  return value;
}

function snapshot(value) {
  return freeze(clone(value));
}

function merge(left, right) {
  if (!isObject(left) || !isObject(right)) return clone(right);
  const result = clone(left);
  for (const [key, value] of Object.entries(right)) {
    result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : clone(value);
  }
  return result;
}

function emptyPanels() {
  return {
    taskboard: {
      surface: "canon",
      state: "No Job Order issued",
      ownerGate: "Canon issue required",
      jobOrder: null,
    },
    grounding: {
      surface: "grounding",
      receipts: [],
      disposition: null,
    },
    projection: {
      surface: "projection",
      source: null,
      captureAt: null,
      freshness: "stale",
      writer: null,
    },
  };
}

function validatePanel(step, index, errors) {
  const label = `steps[${index}]`;
  if (!isObject(step.panels)) {
    errors.push(`${label}.panels must be an object`);
    return;
  }

  const { taskboard, grounding, projection } = step.panels;
  if (!isObject(taskboard) || taskboard.surface !== "canon") {
    errors.push(`${label}.panels.taskboard must declare surface "canon"`);
  }
  if (!isObject(grounding) || grounding.surface !== "grounding") {
    errors.push(`${label}.panels.grounding must declare surface "grounding"`);
  } else if (!Array.isArray(grounding.receipts)) {
    errors.push(`${label}.panels.grounding.receipts must be an array`);
  }
  if (!isObject(projection) || projection.surface !== "projection") {
    errors.push(`${label}.panels.projection must declare surface "projection"`);
    return;
  }
  if (projection.grantsAuthority === true) {
    errors.push(`${label}.panels.projection cannot grant authority`);
  }
  if (!isObject(projection.source) || !nonEmptyString(projection.source.identity) || !isoTimestamp(projection.source.at)) {
    errors.push(`${label}.panels.projection must include source identity and source time`);
  }
  if (!isoTimestamp(projection.captureAt)) {
    errors.push(`${label}.panels.projection must include a capture time`);
  } else if (isoTimestamp(projection.source?.at) && Date.parse(projection.captureAt) < Date.parse(projection.source.at)) {
    errors.push(`${label}.panels.projection capture time cannot precede source time`);
  }
  if (!FRESHNESS.has(projection.freshness)) {
    errors.push(`${label}.panels.projection.freshness must be fresh or stale`);
  }
}

function validateAtlas(atlas, label, errors) {
  if (!isObject(atlas) || !Array.isArray(atlas.nodes) || !Array.isArray(atlas.edges)) {
    errors.push(`${label}.atlas must declare node and edge arrays`);
    return;
  }
  for (const [field, values] of Object.entries(atlas)) {
    if (!Array.isArray(values) || values.some((value) => !nonEmptyString(value))) {
      errors.push(`${label}.atlas.${field} must contain nonempty component keys`);
    }
  }
}

function validateComponentReferences(atlas, components, label, errors) {
  if (!components || !isObject(components)) return;
  const keysFor = (entries) => new Set((entries ?? []).map((entry) => (
    typeof entry === "string" ? entry : entry?.key ?? entry?.id
  )).filter(nonEmptyString));
  const nodeKeys = keysFor(components.nodes);
  const edgeKeys = keysFor([...(components.edges ?? []), ...(components.relationships ?? [])]);
  for (const node of atlas.nodes ?? []) {
    if (!nodeKeys.has(node)) errors.push(`${label} references unknown Atlas node ${node}`);
  }
  for (const edge of atlas.edges ?? []) {
    if (!edgeKeys.has(edge)) errors.push(`${label} references unknown Atlas edge ${edge}`);
  }
}

/**
 * Validate one declarative route. Unknown display metadata is allowed so the
 * workflow library can extend labels and copy without adding runtime branches.
 */
export function validateRoute(route, { components } = {}) {
  const errors = [];
  if (!isObject(route)) return { ok: false, errors: ["route must be an object"] };
  if (!nonEmptyString(route.id)) errors.push("route.id must be a nonempty string");
  if (!nonEmptyString(route.title)) errors.push("route.title must be a nonempty string");
  validateAtlas(route.atlas, "route", errors);
  if (isObject(route.atlas)) validateComponentReferences(route.atlas, components, "route", errors);

  if (!Array.isArray(route.actors) || route.actors.length === 0) {
    errors.push("route.actors must contain declared actors");
  }
  const actors = new Map();
  for (const [index, actor] of (route.actors ?? []).entries()) {
    if (!isObject(actor) || !nonEmptyString(actor.id) || !ACTOR_TYPES.has(actor.type) || !nonEmptyString(actor.label)) {
      errors.push(`actors[${index}] must have id, supported type, and label`);
      continue;
    }
    if (actors.has(actor.id)) errors.push(`actors contains duplicate id ${actor.id}`);
    actors.set(actor.id, actor);
  }

  if (!Array.isArray(route.packets) || route.packets.length === 0) {
    errors.push("route.packets must contain declared packets");
  }
  const packets = new Set();
  for (const [index, packet] of (route.packets ?? []).entries()) {
    if (!isObject(packet) || !nonEmptyString(packet.id) || !nonEmptyString(packet.type) || !nonEmptyString(packet.label)) {
      errors.push(`packets[${index}] must have id, type, and label`);
      continue;
    }
    if (packets.has(packet.id)) errors.push(`packets contains duplicate id ${packet.id}`);
    packets.add(packet.id);
  }

  if (!Array.isArray(route.steps) || route.steps.length === 0) {
    errors.push("route.steps must contain route transitions");
    return { ok: false, errors };
  }

  const stepIds = new Set();
  const positions = new Map();
  const issuedOrders = new Map();
  for (const [index, step] of route.steps.entries()) {
    const label = `steps[${index}]`;
    if (!isObject(step) || !nonEmptyString(step.id) || !nonEmptyString(step.kind)) {
      errors.push(`${label} must have id and kind`);
      continue;
    }
    if (stepIds.has(step.id)) errors.push(`steps contains duplicate id ${step.id}`);
    stepIds.add(step.id);
    if (!actors.has(step.actorId)) errors.push(`${label}.actorId must reference a declared actor`);
    if (!packets.has(step.packetId)) errors.push(`${label}.packetId must reference a declared packet`);
    validateAtlas(step.atlas, label, errors);
    if (isObject(step.atlas)) validateComponentReferences(step.atlas, components, label, errors);
    validatePanel(step, index, errors);

    if (AUTHORITY_SEQUENCE.includes(step.kind)) {
      if (positions.has(step.kind)) errors.push(`route must contain exactly one ${step.kind} step`);
      else positions.set(step.kind, index);
    }
    if (step.kind === "canon-issue") {
      if (!isObject(step.jobOrder) || !nonEmptyString(step.jobOrder.id) || !nonEmptyString(step.jobOrder.scope) || !nonEmptyString(step.jobOrder.canonRef)) {
        errors.push(`${label}.jobOrder must have id, bounded scope, and Canon reference`);
      } else {
        issuedOrders.set(step.jobOrder.id, index);
      }
    }
    if (step.kind === "actuality") {
      if (!nonEmptyString(step.jobOrderId) || !issuedOrders.has(step.jobOrderId)) {
        errors.push(`${label}.actuality requires an earlier issued bounded Job Order`);
      }
    }
    if (step.kind === "intent-disposition" && !nonEmptyString(step.panels?.grounding?.disposition)) {
      errors.push(`${label}.intent-disposition requires a named Grounding disposition`);
    }
    if (step.kind === "projection-capture" && actors.get(step.actorId)?.type !== "pawn") {
      errors.push(`${label}.projection-capture must be written by a Pawn`);
    }
    if (step.kind === "projection-capture") {
      const actor = actors.get(step.actorId);
      const namedWriters = [step.panels?.projection?.writer, step.panels?.projection?.capture?.actor]
        .filter(nonEmptyString);
      if (namedWriters.some((writer) => writer !== actor?.id && writer !== actor?.label)) {
        errors.push(`${label}.projection-capture writer must name its Pawn capture actor`);
      }
    }
  }

  for (const kind of AUTHORITY_SEQUENCE) {
    if (!positions.has(kind)) errors.push(`route must include ${kind}`);
  }
  for (let index = 1; index < AUTHORITY_SEQUENCE.length; index += 1) {
    const previous = positions.get(AUTHORITY_SEQUENCE[index - 1]);
    const current = positions.get(AUTHORITY_SEQUENCE[index]);
    if (previous !== undefined && current !== undefined && previous >= current) {
      errors.push(`${AUTHORITY_SEQUENCE[index]} must follow ${AUTHORITY_SEQUENCE[index - 1]}`);
    }
  }
  const canonIssueIndex = positions.get("canon-issue");
  if (canonIssueIndex !== undefined) {
    for (let index = 0; index < canonIssueIndex; index += 1) {
      if (route.steps[index].panels?.taskboard?.jobOrder != null) {
        errors.push(`steps[${index}].panels.taskboard cannot show a Job Order before Canon issue`);
      }
    }
  }
  if (route.steps.at(-1)?.kind !== "projection-capture") {
    errors.push("route completion must be a Pawn Projection capture");
  }

  return { ok: errors.length === 0, errors };
}

export function validateRoutes(routes, options = {}) {
  if (!Array.isArray(routes) || routes.length === 0) return { ok: false, errors: ["routes must be a nonempty array"] };
  const errors = [];
  const routeIds = new Set();
  for (const [index, route] of routes.entries()) {
    const result = validateRoute(route, options);
    errors.push(...result.errors.map((error) => `routes[${index}]: ${error}`));
    if (route?.id) {
      if (routeIds.has(route.id)) errors.push(`routes contains duplicate id ${route.id}`);
      routeIds.add(route.id);
    }
  }
  return { ok: errors.length === 0, errors };
}

function routeState(route, cursor, controls) {
  const priorPanels = emptyPanels();
  for (let index = 0; index < cursor; index += 1) {
    Object.assign(priorPanels, merge(priorPanels, route.steps[index].panels));
  }
  const panels = merge(priorPanels, route.steps[cursor].panels);
  const currentStep = route.steps[cursor];
  const currentActor = route.actors.find((actor) => actor.id === currentStep.actorId);
  const currentPacket = route.packets.find((packet) => packet.id === currentStep.packetId);
  return {
    routeId: route.id,
    routeTitle: route.title,
    cursor,
    complete: cursor === route.steps.length - 1,
    mode: controls.mode,
    playing: controls.playing,
    reducedMotion: controls.reducedMotion,
    selection: clone(controls.selection),
    highlights: {
      nodes: [...new Set([...(currentStep.atlas.nodes ?? []), ...(controls.selection.nodeId ? [controls.selection.nodeId] : [])])],
      edges: [...new Set([...(currentStep.atlas.edges ?? []), ...(controls.selection.edgeId ? [controls.selection.edgeId] : [])])],
    },
    currentStep: clone(currentStep),
    currentActor: clone(currentActor),
    currentPacket: clone(currentPacket),
    before: priorPanels,
    panels,
  };
}

/** Create a deterministic, UI-independent runtime for valid local route data. */
export function createSimulationRuntime({
  routes,
  routeId,
  mode = "atlas",
  reducedMotion = false,
  components,
  onEvent,
} = {}) {
  const validation = validateRoutes(routes, { components });
  if (!validation.ok) throw new RuntimeValidationError(validation.errors);
  if (!MODES.has(mode)) throw new RuntimeValidationError([`mode must be one of ${[...MODES].join(", ")}`]);
  if (onEvent !== undefined && typeof onEvent !== "function") throw new RuntimeValidationError(["onEvent must be a function"]);

  const routeById = new Map(routes.map((route) => [route.id, route]));
  if (routeId !== undefined && !routeById.has(routeId)) throw new RuntimeValidationError([`unknown route ${routeId}`]);
  let route = routeById.get(routeId ?? routes[0].id);
  let cursor = 0;
  const controls = {
    mode,
    playing: false,
    reducedMotion: Boolean(reducedMotion),
    selection: { nodeId: null, edgeId: null },
  };
  const subscribers = new Set(onEvent ? [onEvent] : []);

  const emit = (type, detail = {}) => {
    const event = snapshot({ type, detail: clone(detail), state: routeState(route, cursor, controls) });
    for (const listener of subscribers) listener(event);
    return event.state;
  };
  const current = () => snapshot(routeState(route, cursor, controls));
  const move = (direction) => {
    const nextCursor = cursor + direction;
    if (nextCursor < 0 || nextCursor >= route.steps.length) return emit("refused", { reason: "route-boundary", direction });
    cursor = nextCursor;
    return emit("step", { direction, stepId: route.steps[cursor].id });
  };
  const play = () => {
    if (!current().complete) controls.playing = true;
    return emit("play");
  };
  const pause = () => {
    controls.playing = false;
    return emit("pause");
  };

  return Object.freeze({
    snapshot: current,
    getState: current,
    next: () => move(1),
    previous: () => move(-1),
    tick: () => (controls.playing ? move(1) : emit("refused", { reason: "paused" })),
    play,
    pause,
    reset: () => {
      cursor = 0;
      controls.playing = false;
      return emit("reset");
    },
    selectRoute: (nextRouteId) => {
      if (!routeById.has(nextRouteId)) return emit("refused", { reason: "unknown-route", routeId: nextRouteId });
      route = routeById.get(nextRouteId);
      cursor = 0;
      controls.playing = false;
      return emit("route", { routeId: nextRouteId });
    },
    setMode: (nextMode) => {
      if (!MODES.has(nextMode)) return emit("refused", { reason: "unknown-mode", mode: nextMode });
      controls.mode = nextMode;
      return emit("mode", { mode: nextMode });
    },
    setReducedMotion: (nextValue) => {
      controls.reducedMotion = Boolean(nextValue);
      return emit("reduced-motion", { reducedMotion: controls.reducedMotion });
    },
    selectAtlas: ({ nodeId = null, edgeId = null } = {}) => {
      if (nodeId !== null && !nonEmptyString(nodeId)) return emit("refused", { reason: "invalid-atlas-node" });
      if (edgeId !== null && !nonEmptyString(edgeId)) return emit("refused", { reason: "invalid-atlas-edge" });
      controls.selection = { nodeId, edgeId };
      return emit("selection", controls.selection);
    },
    handleKey: (key) => {
      if (key === "ArrowRight") return move(1);
      if (key === "ArrowLeft") return move(-1);
      if (key === " " || key === "Spacebar" || key === "Enter") return controls.playing ? pause() : play();
      if (key === "Home") {
        cursor = 0;
        controls.playing = false;
        return emit("reset");
      }
      return emit("refused", { reason: "unsupported-key", key });
    },
    subscribe: (listener) => {
      if (typeof listener !== "function") throw new RuntimeValidationError(["subscriber must be a function"]);
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  });
}

export const PROJECT_UPDATE_ROUTE = freeze({
  id: "project-update",
  title: "Generic project update",
  purpose: "A local explanatory route from a freshness-visible signal to a Pawn-written Projection capture.",
  atlas: {
    nodes: ["projection", "intent", "grounding", "canon-taskboard", "actuality"],
    edges: ["projection-routes-intent", "canon-issues-job-order", "grounding-captures-projection"],
  },
  actors: [
    { id: "projection-pawn", type: "pawn", label: "Projection Pawn" },
    { id: "intake-pawn", type: "pawn", label: "Intake Pawn" },
    { id: "grounding-pawn", type: "pawn", label: "Grounding Pawn" },
    { id: "canon-pawn", type: "pawn", label: "Canon Issue Pawn" },
    { id: "project-agent", type: "agent", label: "Scoped Project Agent" },
  ],
  packets: [
    { id: "signal", type: "projection-signal", label: "Fresh project update signal" },
    { id: "candidate", type: "intent-candidate", label: "Project update candidate" },
    { id: "receipt", type: "grounding-receipt", label: "Grounding evidence receipt" },
    { id: "job-order", type: "job-order", label: "Bounded project update Job Order" },
    { id: "outcome", type: "disposition", label: "Disposed project update outcome" },
  ],
  steps: [
    {
      id: "observe-signal",
      kind: "projection-signal",
      actorId: "projection-pawn",
      packetId: "signal",
      atlas: { nodes: ["projection"], edges: ["projection-routes-intent"] },
      panels: {
        taskboard: { surface: "canon", state: "No Job Order issued", ownerGate: "Canon issue required" },
        grounding: { surface: "grounding", receipts: [], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "stage-intent",
      kind: "intent-candidate",
      actorId: "intake-pawn",
      packetId: "candidate",
      atlas: { nodes: ["intent"], edges: ["projection-routes-intent"] },
      panels: {
        taskboard: { surface: "canon", state: "Candidate only", ownerGate: "Grounding and Canon issue required" },
        grounding: { surface: "grounding", receipts: [], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "ground-candidate",
      kind: "grounding",
      actorId: "grounding-pawn",
      packetId: "receipt",
      atlas: { nodes: ["grounding"], edges: [] },
      panels: {
        taskboard: { surface: "canon", state: "Candidate awaiting Canon", ownerGate: "Canon issue required" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified"], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "issue-job-order",
      kind: "canon-issue",
      actorId: "canon-pawn",
      packetId: "job-order",
      jobOrder: { id: "JO-project-update", scope: "One generic local project update", canonRef: "Canon Taskboard entry" },
      atlas: { nodes: ["canon-taskboard"], edges: ["canon-issues-job-order"] },
      panels: {
        taskboard: { surface: "canon", state: "Issued", ownerGate: "Scoped to JO-project-update", jobOrder: "JO-project-update" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified"], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "perform-bounded-work",
      kind: "actuality",
      actorId: "project-agent",
      packetId: "job-order",
      jobOrderId: "JO-project-update",
      atlas: { nodes: ["actuality"], edges: [] },
      panels: {
        taskboard: { surface: "canon", state: "In progress", ownerGate: "JO-project-update remains bounded", jobOrder: "JO-project-update" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified"], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "record-evidence",
      kind: "grounding-receipt",
      actorId: "grounding-pawn",
      packetId: "receipt",
      atlas: { nodes: ["grounding"], edges: [] },
      panels: {
        taskboard: { surface: "canon", state: "Awaiting disposition", ownerGate: "Disposition required", jobOrder: "JO-project-update" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified", "Bounded work receipt recorded"], disposition: null },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "dispose-outcome",
      kind: "intent-disposition",
      actorId: "intake-pawn",
      packetId: "outcome",
      atlas: { nodes: ["intent"], edges: [] },
      panels: {
        taskboard: { surface: "canon", state: "Closed", ownerGate: "Disposition recorded", jobOrder: "JO-project-update" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified", "Bounded work receipt recorded"], disposition: "Completed; no follow-on candidate required" },
        projection: { surface: "projection", source: { identity: "project-update-feed", at: "2026-08-04T12:00:00.000Z" }, captureAt: "2026-08-04T12:00:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
    {
      id: "capture-projection",
      kind: "projection-capture",
      actorId: "projection-pawn",
      packetId: "outcome",
      atlas: { nodes: ["projection"], edges: ["grounding-captures-projection"] },
      panels: {
        taskboard: { surface: "canon", state: "Closed", ownerGate: "Disposition recorded", jobOrder: "JO-project-update" },
        grounding: { surface: "grounding", receipts: ["Scope and evidence route verified", "Bounded work receipt recorded"], disposition: "Completed; no follow-on candidate required" },
        projection: { surface: "projection", source: { identity: "project-update-outcome", at: "2026-08-04T12:08:00.000Z" }, captureAt: "2026-08-04T12:08:00.000Z", freshness: "fresh", writer: "Projection Pawn" },
      },
    },
  ],
});

if (typeof globalThis !== "undefined") {
  globalThis.FoundrySchematicRuntime = Object.freeze({
    PROJECT_UPDATE_ROUTE,
    RuntimeValidationError,
    createSimulationRuntime,
    validateRoute,
    validateRoutes,
  });
}
