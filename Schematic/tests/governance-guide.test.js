import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRun } from "../src/domain/engine.js";
import {
  AUTHORITY_ORDER,
  GOVERNANCE_GUIDE,
  resolveGovernancePlane,
  selectGovernancePlane,
  validateGovernanceGuide,
} from "../src/domain/governanceGuide.js";
import { feedbackAuditScenario } from "../src/domain/scenario.js";

test("the Governance guide declares the exact most-to-least protected Authority Order", () => {
  assert.deepEqual(validateGovernanceGuide(GOVERNANCE_GUIDE), []);
  assert.deepEqual(AUTHORITY_ORDER, ["actuality", "canon", "grounding", "enduring-context", "intent", "projection"]);
  assert.deepEqual(GOVERNANCE_GUIDE.map((plane) => plane.id), AUTHORITY_ORDER);
  assert.equal(resolveGovernancePlane("actuality").protection, "MOST PROTECTED");
  assert.equal(resolveGovernancePlane("projection").protection, "LEAST PROTECTED");
});

test("each Plane explains purpose, inputs, outputs, protection, and transition", () => {
  for (const plane of GOVERNANCE_GUIDE) {
    for (const field of ["purpose", "inputs", "outputs", "protection", "transition"]) assert.ok(plane[field], `${plane.id} missing ${field}`);
  }
});

test("Projection routes but cannot authorize while Actuality requires the Canon-backed order", () => {
  assert.match(resolveGovernancePlane("projection").protectionDetail, /route/i);
  assert.match(resolveGovernancePlane("projection").protectionDetail, /cannot authorize/i);
  assert.match(resolveGovernancePlane("actuality").protectionDetail, /Canon-backed Job Order/i);
});

test("floor selection is explanatory state and leaves Run and trace unchanged", () => {
  const run = createRun(feedbackAuditScenario, 1);
  const before = structuredClone(run);
  const selected = selectGovernancePlane("projection", "grounding");

  assert.equal(selected, "grounding");
  assert.deepEqual(run, before);
  assert.throws(() => selectGovernancePlane(selected, "basement"), /Unknown Governance Plane/);
});

test("Governance composes the complete stack and selected repeated top-down plan", () => {
  const page = readFileSync(new URL("../src/pages/GovernancePage.jsx", import.meta.url), "utf8");
  const topology = readFileSync(new URL("../src/view/atlasTopology.js", import.meta.url), "utf8");
  assert.match(page, /<FactoryStack compact \/>/);
  assert.match(page, /<GovernanceFloorPlan/);
  assert.match(page, /factory-floor metaphor/i);
  assert.match(page, /Gatehouse checks the Job Order and Clearance/i);
  assert.match(topology, /FOUNDRY_PROJECTION/);
});
