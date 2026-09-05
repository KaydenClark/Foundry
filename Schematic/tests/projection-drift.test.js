import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAMPUS } from "../src/domain/campus.js";
import { FOUNDRY_PROJECTION } from "../src/domain/foundryProjection.js";
import { PROJECTION_SIGNATURE, deriveProjectionSignature } from "../src/domain/projectionSignature.js";
import { REFERENCE_REGISTRY } from "../src/domain/referenceRegistry.js";
import { ATLAS_FLOOR_TOPOLOGY } from "../src/view/atlasTopology.js";

const root = new URL("..", import.meta.url);
const source = (relativePath) => readFileSync(new URL(relativePath, root), "utf8");

test("the checked-in Projection signature fixes the declared future-model renderer contract", () => {
  assert.equal(PROJECTION_SIGNATURE, "S017-PROJECTION-c48efa25");
  assert.equal(deriveProjectionSignature(FOUNDRY_PROJECTION), PROJECTION_SIGNATURE);
  assert.notEqual(
    deriveProjectionSignature({ ...FOUNDRY_PROJECTION, halls: FOUNDRY_PROJECTION.halls.slice(0, -1) }),
    PROJECTION_SIGNATURE,
  );
});

test("every projected Hall surface consumes the same future-model fixture rather than a retired local list", () => {
  const expected = FOUNDRY_PROJECTION.halls.map(({ id, name }) => ({ id, name }));
  assert.deepEqual(CAMPUS.halls.map(({ id, name }) => ({ id, name })), expected);
  assert.deepEqual(REFERENCE_REGISTRY.collections.hall.map(({ id, name }) => ({ id, name })), expected);
  assert.deepEqual(
    ATLAS_FLOOR_TOPOLOGY.rooms.filter((room) => room.hallId).map(({ hallId, label }) => ({ id: hallId, name: label[0] + label.slice(1).toLowerCase() })),
    expected,
  );
});

test("source composition keeps the Workflow category plan and FactoryStack governance-only", () => {
  const factoryStack = source("src/components/FactoryStack.jsx");
  const workflowPlan = source("src/components/WorkflowFloorPlan.jsx");
  const workflowPage = source("src/pages/WorkflowPage.jsx");
  const governancePage = source("src/pages/GovernancePage.jsx");

  assert.match(workflowPlan, /const ZONES/);
  assert.doesNotMatch(workflowPlan, /FactoryStack/);
  assert.doesNotMatch(workflowPage, /FactoryStack/);
  assert.match(governancePage, /<FactoryStack compact\s*\/>/);
  assert.match(factoryStack, /roomIcons\[room\.id\] \?\? Factory/);
});

test("Schematic controls anchor the fully built future Foundry and reject present-state framing", () => {
  const blueprint = source("BLUEPRINT.md");
  const futureControls = ["AGENTS.md", "BLUEPRINT.md", "LEXICON.md", "README.md", "RUNBOOK.md"]
    .map(source)
    .join("\n");

  assert.match(blueprint, /The Schematic is the visualization of what the Foundry is going to be once it is fully built\./);
  assert.match(blueprint, /The stable model is the relationship grammar; component names, counts, and layouts are versioned scenario data\./);
  assert.match(blueprint, /Foundry owns and composes Halls and Modules/i);
  assert.match(blueprint, /A Hall owns its capability boundary and Socket contracts/i);
  assert.match(blueprint, /A Module is a replaceable product that implements one or more Sockets/i);
  assert.match(blueprint, /Foundry → Factory → Workshop → Workbench/);
  assert.match(blueprint, /producer[‑-\s]to[‑-\s]product relationship/i);
  assert.match(futureControls, /future-Foundry simulator/i);
  assert.match(futureControls, /Foundry tab[\s\S]{0,160}?spatial[\s\S]{0,160}?Workflow[\s\S]{0,160}?simulat/i);
  assert.match(futureControls, /does not model the current implementation|Current implementation[\s\S]{0,100}?never define/i);
  assert.doesNotMatch(futureControls, /The Schematic models the current implementation|visuali[sz]es current Actuality|rollout progress defines the Schematic/i);
  assert.doesNotMatch(futureControls, /four canonical Halls|canonical four-Hall|outside the canonical four-Hall plan/i);
  assert.match(futureControls, /owner-settled[\s\S]{0,80}?future[-\s]*model/i);
  assert.doesNotMatch(futureControls, /must contain exactly thirteen|fixed thirteen-Hall|permanent count of thirteen/i);
  assert.doesNotMatch(futureControls, /default target fixture names|currently declared roster has thirteen/i);
  assert.match(futureControls, /category-only/i);

  assert.doesNotMatch(source("src/pages/ReferencePages.jsx"), /Four spaces own four kinds of work/i);
  assert.doesNotMatch(source("specs/S-017-thirteen-hall-projection-conformance/SPEC.md"), /Schematic still hard-codes|Workflow still mounts/i);
  assert.match(source("index.html"), /<link rel="icon" href="\/favicon\.svg"/);
});
