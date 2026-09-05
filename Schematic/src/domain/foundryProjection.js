const ARCHITECTURAL_ID = /^[A-Z0-9]{4}$/;
const PUBLIC_HOME_ID = /^[a-z0-9-]+$/;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const hall = (id, name, details) => ({ id, name, status: "NATIVE HALL", homeId: "factory-primary", ...details });

export const FOUNDRY_PROJECTION = deepFreeze({
  schemaVersion: 1,
  artifact: "foundry-public-projection",
  liveInventory: false,
  homes: [
    { id: "factory-primary", label: "Primary Factory" },
    { id: "factory-secondary", label: "Second Factory" },
  ],
  halls: [
    hall("2K7P", "Intake", { summary: "Creates candidate Job Orders deterministically.", responsibility: "Create candidates only.", inputs: ["requested outcome"], outputs: ["candidate Job Order"], boundary: "It does not create Specs, tasks, routes, or authority.", map: ["Candidate desk", "Intake ledger", "Handoff point"] }),
    hall("8L4T", "Validation", { mode: "read-only", summary: "Returns read-only passage findings to Orchestration.", responsibility: "Inspect one receipt and report findings.", inputs: ["Gatehouse receipt"], outputs: ["read-only finding"], boundary: "It does not route, delegate, or write Canon/Actuality.", forbidden: ["route", "delegate", "write-canon", "write-actuality"], map: ["Receipt review", "Finding desk", "Return channel"] }),
    hall("6V1N", "Gatehouse", { mode: "passage-infrastructure", summary: "Records mandatory protected passages and their receipts.", responsibility: "Scan declared passage inputs and append one receipt.", inputs: ["Job Order", "Clearance", "declared scope"], outputs: ["append-only receipt", "recorded or blocked scan"], boundary: "Infrastructure only; it does not choose routes, validate, authorize, or write Canon/Grounding.", forbidden: ["route", "validate", "authorize", "write-canon", "write-grounding"], map: ["Scan wall", "Receipt rail", "Crossing gate"] }),
    hall("3W9H", "Orchestration", { summary: "Creates Specs/tasks and selects only needed passages.", responsibility: "Decompose, delegate, route, and receive findings.", inputs: ["candidate Job Order", "Validation finding"], outputs: ["workflow handoff", "selected optional passages"], boundary: "It routes work but does not make Gatehouse perform that decision.", map: ["Planning board", "Route table", "Handoff desk"] }),
    hall("5B2Y", "Design", { summary: "Supplies optional design passage expertise.", responsibility: "Contribute only when Orchestration selects it.", inputs: ["declared request"], outputs: ["design contribution"], boundary: "Optional; it is not a mandatory passage.", map: ["Design table", "Review wall", "Return path"] }),
    hall("1R6F", "Knowledge", { summary: "Supplies optional public knowledge/context through declared Sockets.", responsibility: "Provide declared context without a reach-around.", inputs: ["Recall Socket request"], outputs: ["public explanatory context"], boundary: "Optional; it does not expose private instance data.", map: ["Recall desk", "Context shelf", "Socket port"] }),
    hall("7C4J", "Scheduling", { summary: "Executes selected schedule rules.", responsibility: "Apply schedule rules when explicitly selected.", inputs: ["scheduled workflow handoff"], outputs: ["schedule result"], boundary: "Optional; it does not route or assign work.", map: ["Schedule board", "Rule clock", "Return path"] }),
    hall("7M2Q", "Forge", { summary: "Produces the Foundry product.", responsibility: "Implement Foundry-producer work.", inputs: ["foundry-producer handoff"], outputs: ["producer change"], boundary: "It is not the implementation Hall for products/projects.", map: ["Producer bench", "Test line", "Release evidence"] }),
    hall("9P8A", "Production", { summary: "Produces products and projects.", responsibility: "Implement product/project work.", inputs: ["product or project handoff"], outputs: ["implementation change"], boundary: "It is distinct from Forge's Foundry-producer work.", map: ["Project bench", "Build line", "Review handoff"] }),
    hall("4X8C", "Assay", { mode: "read-only", summary: "Independently audits completed work.", responsibility: "Judge completed evidence without repairing it.", inputs: ["completed result", "acceptance evidence"], outputs: ["Assay verdict"], boundary: "Read-only; it does not repair or integrate.", forbidden: ["repair", "integrate", "write-actuality"], map: ["Audit bench", "Evidence table", "Verdict rail"] }),
    hall("6G3S", "Ward", { summary: "Performs one bounded repair or integrates an audited pass.", responsibility: "Repair once in scope, then integrate audited passing work.", inputs: ["Assay verdict"], outputs: ["repair, return, or integration outcome"], boundary: "At most one repair; integration to main remains owner-only.", map: ["Triage desk", "Repair bay", "Integration gate"] }),
    hall("9D3R", "Gauge", { mode: "observe-only", summary: "Observes Gatehouse receipts and derives activity signals.", responsibility: "Feed activity concepts and target actionable notification.", inputs: ["Gatehouse receipt"], outputs: ["activity signal"], boundary: "It never writes Canon or Grounding.", forbidden: ["write-canon", "write-grounding"], map: ["Signal wall", "Activity gauge", "Notification rail"] }),
    { ...hall("2N5E", "Shipping", { summary: "Packages a declared producer into a reproducible deployable product.", responsibility: "Package only declared producer output.", inputs: ["declared producer", "artifact"], outputs: ["reproducible package"], boundary: "Provisional name; not a generic component-release router.", map: ["Package line", "Artifact dock", "Release boundary"] }), status: "PROVISIONAL HALL" },
  ],
  modules: [
    { id: "4Q7B", name: "OpenBrain", status: "ILLUSTRATIVE MODULE", implementsSocketIds: ["5R1K"], fit: "Public explanatory recall through a typed boundary.", installation: "Replaceable supporting product outside the native Factory.", binding: "Example only; an adopting instance owns binding." },
    { id: "8F2L", name: "Command Information Center", status: "ILLUSTRATIVE MODULE", implementsSocketIds: ["6A9G"], fit: "Receives public activity concepts.", installation: "Replaceable supporting product outside the native Factory.", binding: "Example only; no live control plane is present." },
    { id: "3D6V", name: "Servitor Slack", status: "ILLUSTRATIVE MODULE", implementsSocketIds: ["6A9G"], fit: "Receives actionable notification concepts.", installation: "Replaceable supporting product outside the native Factory.", binding: "Example only; no provider connection is present." },
    { id: "1T9C", name: "Servitor Discord", status: "ILLUSTRATIVE MODULE", implementsSocketIds: ["6A9G"], fit: "Receives actionable notification concepts.", installation: "Replaceable supporting product outside the native Factory.", binding: "Example only; no provider connection is present." },
  ],
  sockets: [
    { id: "5R1K", name: "Recall", status: "PUBLIC CONTRACT", homeHallId: "1R6F", moduleIds: ["4Q7B"], contract: "recall.query → value + source + freshness", summary: "A typed public explanatory recall boundary.", boundary: "Consumers use the Socket; direct Module data access is a reach-around." },
    { id: "3P7X", name: "Passage Receipt", status: "PUBLIC CONTRACT", homeHallId: "6V1N", moduleIds: [], contract: "passage.receipt → append-only receipt", summary: "One Gatehouse receipt per protected passage.", boundary: "Gatehouse records infrastructure evidence and does not route or authorize." },
    { id: "8V2F", name: "Passage Finding", status: "PUBLIC CONTRACT", homeHallId: "8L4T", moduleIds: [], contract: "passage.finding → read-only finding", summary: "Validation returns a finding to Orchestration.", boundary: "Validation cannot use this Socket to change Canon or Actuality." },
    { id: "6A9G", name: "Activity Signal", status: "PUBLIC CONTRACT", homeHallId: "9D3R", moduleIds: ["8F2L", "3D6V", "1T9C"], contract: "activity.signal → observable notification concept", summary: "Gauge derives observation from a receipt.", boundary: "Gauge cannot write Canon or Grounding through this Socket." },
    { id: "4O7R", name: "Workflow Handoff", status: "PUBLIC CONTRACT", homeHallId: "3W9H", moduleIds: [], contract: "workflow.handoff → declared implementation/audit/integration route", summary: "Orchestration selects only needed passages.", boundary: "Forge/Production routing, Assay, Ward, and Shipping remain modeled concepts." },
  ],
});

function has(values, value) {
  return Array.isArray(values) && values.includes(value);
}

export function validateFoundryProjection(projection) {
  if (!projection || typeof projection !== "object") return ["Foundry Projection is required."];
  const errors = [];
  const homes = new Set();
  for (const home of projection.homes ?? []) {
    if (!PUBLIC_HOME_ID.test(home?.id ?? "")) errors.push(`Projection home '${home?.id ?? ""}' must be a public architectural identifier.`);
    homes.add(home?.id);
  }

  const records = ["halls", "modules", "sockets"].flatMap((kind) => projection[kind] ?? []);
  const ids = new Set();
  for (const record of records) {
    if (!ARCHITECTURAL_ID.test(record?.id ?? "")) errors.push(`${record?.name ?? "Projection record"} must use a four-character opaque identity.`);
    if (ids.has(record?.id)) errors.push(`Projection identity ${record.id} must not be reused.`);
    ids.add(record?.id);
  }
  if ((projection.halls ?? []).length === 0) errors.push("The future-model Projection must declare at least one Hall.");
  const hallNames = (projection.halls ?? []).map(({ name }) => name).filter(Boolean);
  if (hallNames.length !== (projection.halls ?? []).length) errors.push("Every projected Hall must have a name.");
  if (new Set(hallNames).size !== hallNames.length) errors.push("Projected Hall names must not be reused.");
  if ((projection.modules ?? []).length !== 4) errors.push("Projection must contain exactly four Modules.");
  if ((projection.sockets ?? []).length !== 5) errors.push("Projection must contain exactly five Sockets.");

  const hallsById = new Map((projection.halls ?? []).map((record) => [record.id, record]));
  const modulesById = new Map((projection.modules ?? []).map((record) => [record.id, record]));
  const socketsById = new Map((projection.sockets ?? []).map((record) => [record.id, record]));
  for (const hallRecord of projection.halls ?? []) {
    if (!homes.has(hallRecord.homeId)) errors.push(`Hall ${hallRecord.name} must reference a declared public home.`);
  }
  for (const socket of projection.sockets ?? []) {
    if (!hallsById.has(socket.homeHallId)) errors.push(`Socket ${socket.name} points to missing Hall ${socket.homeHallId}.`);
    for (const moduleId of socket.moduleIds ?? []) {
      const module = modulesById.get(moduleId);
      if (!module) errors.push(`Socket ${socket.name} points to missing Module ${moduleId}.`);
      else if (!has(module.implementsSocketIds, socket.id)) errors.push(`Socket ${socket.name} and Module ${module.name} must declare the same binding.`);
    }
  }
  for (const module of projection.modules ?? []) {
    for (const socketId of module.implementsSocketIds ?? []) {
      const socket = socketsById.get(socketId);
      if (!socket) errors.push(`Module ${module.name} points to missing Socket ${socketId}.`);
      else if (!has(socket.moduleIds, module.id)) errors.push(`Socket ${socket.name} and Module ${module.name} must declare the same binding.`);
    }
  }

  const byName = new Map((projection.halls ?? []).map((record) => [record.name, record]));
  const gatehouse = byName.get("Gatehouse");
  if (gatehouse?.mode !== "passage-infrastructure" || !["route", "validate", "authorize", "write-canon", "write-grounding"].every((value) => has(gatehouse?.forbidden, value))) {
    errors.push("Gatehouse must remain passage infrastructure without routing, validation, authorization, Canon, or Grounding authority.");
  }
  const validation = byName.get("Validation");
  if (validation?.mode !== "read-only" || !["route", "delegate", "write-canon", "write-actuality"].every((value) => has(validation?.forbidden, value))) {
    errors.push("Validation must remain read-only and return findings without workflow or write authority.");
  }
  const gauge = byName.get("Gauge");
  if (gauge?.mode !== "observe-only" || !["write-canon", "write-grounding"].every((value) => has(gauge?.forbidden, value))) {
    errors.push("Gauge must remain observe-only and cannot write Canon or Grounding.");
  }
  const shipping = byName.get("Shipping");
  if (shipping?.status !== "PROVISIONAL HALL") errors.push("Shipping must remain provisional.");
  return errors;
}
