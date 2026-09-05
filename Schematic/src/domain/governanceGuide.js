import { governancePlanes } from "./scenario.js";

export const AUTHORITY_ORDER = Object.freeze([
  "actuality",
  "canon",
  "grounding",
  "enduring-context",
  "intent",
  "projection",
]);

const DETAILS = Object.freeze({
  actuality: Object.freeze({
    purpose: "The live filesystem, source, runtime, and verified operating state.",
    inputs: ["Canon-backed Job Order", "bounded worker", "declared write scope"],
    outputs: ["changed operating state", "Grounding receipt", "required proof"],
    protection: "MOST PROTECTED",
    protectionDetail: "No actor changes Actuality without a Canon-backed Job Order naming the write scope; the result is checked in as Grounding.",
    transition: "Terminal floor. Gatehouse admits only a cleared Job Order whose Clearance includes the requested write band.",
  }),
  canon: Object.freeze({
    purpose: "Approved durable operating truth, controls, specifications, and active-work authority.",
    inputs: ["settled decisions", "accepted Grounding", "owner commands"],
    outputs: ["control documents", "specifications", "scoped Job Orders"],
    protection: "HIGH PROTECTION",
    protectionDetail: "Canon may authorize bounded work through a Job Order; no lower-protection Plane silently overrides it.",
    transition: "Gatehouse checks that the requested grant is within Clearance before issuing or returning a Job Order.",
  }),
  grounding: Object.freeze({
    purpose: "Verified observations, findings, receipts, research, reports, and non-binding design evidence.",
    inputs: ["tests", "audits", "sources", "work receipts"],
    outputs: ["verified evidence", "findings", "acceptance or repair signal"],
    protection: "CONTROLLED EVIDENCE",
    protectionDetail: "Grounding supports and tests Canon but never becomes authority merely by existing.",
    transition: "Gatehouse checks placement and evidence provenance before the elevator carries the order toward Canon or Actuality.",
  }),
  "enduring-context": Object.freeze({
    purpose: "Durable structure and meaning: the Wiki/brain, stable vocabulary, project shape, and rationale.",
    inputs: ["retained lessons", "stable context", "approved vocabulary"],
    outputs: ["bounded meaning", "memory routes", "durable constraints"],
    protection: "DURABLE CONTEXT",
    protectionDetail: "Enduring Context informs and constrains work but cannot by itself authorize an Actuality change.",
    transition: "Gatehouse checks that retained context belongs to the Job Order and does not copy live task state into memory.",
  }),
  intent: Object.freeze({
    purpose: "Pending actionable outcomes: owner requests, locked decisions, and deterministic actions awaiting disposition.",
    inputs: ["requested outcome", "constraints", "owner direction"],
    outputs: ["triaged candidate", "explicit disposition", "proposed Job Order"],
    protection: "PENDING DIRECTION",
    protectionDetail: "Intent names what is wanted; it is not itself an imperative command surface or permission to write.",
    transition: "Gatehouse checks scope and routes the candidate through context and Grounding before Canon may issue a grant.",
  }),
  projection: Object.freeze({
    purpose: "A freshness-bearing one-way interpretive view used to see and route the other Planes.",
    inputs: ["boundary captures", "source pointers", "freshness metadata"],
    outputs: ["read model", "route candidate", "staleness signal"],
    protection: "LEAST PROTECTED",
    protectionDetail: "Projection may route and display freshness, but it cannot authorize work or reinterpret its inputs.",
    transition: "The elevator begins only after Gatehouse checks the travelling Job Order and Clearance; a projection read is not a launch grant.",
  }),
});

const planesById = new Map(governancePlanes.map((plane) => [plane.id, plane]));

export const GOVERNANCE_GUIDE = Object.freeze(AUTHORITY_ORDER.map((id, index) => Object.freeze({
  ...planesById.get(id),
  ...DETAILS[id],
  authorityRank: index + 1,
})));

export function resolveGovernancePlane(id) {
  const plane = GOVERNANCE_GUIDE.find((candidate) => candidate.id === id);
  if (!plane) throw new RangeError(`Unknown Governance Plane: ${id}`);
  return plane;
}

export function selectGovernancePlane(currentId, nextId) {
  resolveGovernancePlane(currentId);
  resolveGovernancePlane(nextId);
  return nextId;
}

export function validateGovernanceGuide(guide) {
  if (!Array.isArray(guide)) return ["Governance guide must be an array."];
  const errors = [];
  const actualOrder = guide.map((plane) => plane.id);
  if (actualOrder.join("|") !== AUTHORITY_ORDER.join("|")) errors.push("Governance guide does not match the Authority Order.");
  for (const plane of guide) {
    for (const field of ["purpose", "inputs", "outputs", "protection", "protectionDetail", "transition"]) {
      if (!plane[field] || (Array.isArray(plane[field]) && plane[field].length === 0)) errors.push(`Governance Plane ${plane.id} is missing ${field}.`);
    }
  }
  return errors;
}
