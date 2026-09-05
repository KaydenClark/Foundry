import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  FOUNDRY_SCHEMATIC_WORKFLOWS,
  validateWorkflowLibrary,
} from './schematic-workflows.mjs';
import { validateRoutes } from './schematic-runtime.mjs';

const routeIds = [
  'foundry-adoption',
  'foundry-release',
  'independent-project-assay',
  'new-workshop',
  'project-update',
  'daily-captain-pass',
  'module-integration',
];

const requiredKinds = [
  'projection-signal',
  'intent-candidate',
  'grounding',
  'canon-issue',
  'actuality',
  'grounding-receipt',
  'intent-disposition',
  'projection-capture',
];

async function atlasComponents() {
  const source = await readFile(new URL('./schematic-atlas-data.js', import.meta.url), 'utf8');
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context, { filename: 'schematic-atlas-data.js' });
  const { registry } = context.globalThis.FoundrySchematicAtlasData;
  return { nodes: registry.nodes, edges: registry.relationships };
}

test('exposes exactly the seven generic Foundry workflow routes', () => {
  assert.deepEqual(
    FOUNDRY_SCHEMATIC_WORKFLOWS.routes.map((route) => route.id),
    routeIds,
  );
});

test('every route has a complete governed lifecycle and Pawn Projection capture', () => {
  for (const route of FOUNDRY_SCHEMATIC_WORKFLOWS.routes) {
    assert.deepEqual(route.steps.map((step) => step.kind), requiredKinds, route.id);
    assert.equal(route.steps.at(-1).actorId, 'pawn', route.id);
    assert.equal(route.steps.at(-1).panels.projection.capture.freshness, 'fresh', route.id);
  }
});

test('every scenario gives the diorama one bounded room path per governed step', () => {
  for (const route of FOUNDRY_SCHEMATIC_WORKFLOWS.routes) {
    const nodesByKind = Object.fromEntries(route.steps.map((step) => [step.kind, step.atlas.nodes]));
    assert.deepEqual(nodesByKind['projection-signal'], ['projection'], route.id);
    assert.deepEqual(nodesByKind['intent-candidate'], ['intent'], route.id);
    assert.ok(nodesByKind.actuality.length === 1, route.id);
    assert.ok(nodesByKind['projection-capture'].includes('projection'), route.id);
  }
});

test('route templates validate and reject prohibited authority shortcuts', () => {
  assert.deepEqual(validateWorkflowLibrary(FOUNDRY_SCHEMATIC_WORKFLOWS), []);
  assert.deepEqual(validateRoutes(FOUNDRY_SCHEMATIC_WORKFLOWS.routes), {
    ok: true,
    errors: [],
  });

  const invalid = structuredClone(FOUNDRY_SCHEMATIC_WORKFLOWS);
  invalid.routes[0].steps[3].actorId = 'agent';
  invalid.routes[0].steps[3].jobOrder = { id: 'JO-invalid', scope: '' };
  invalid.routes[0].steps.at(-1).panels.projection.capture.freshness = '';

  const errors = validateWorkflowLibrary(invalid);
  assert.ok(errors.some((error) => error.includes('Canon')));
  assert.ok(errors.some((error) => error.includes('scope')));
  assert.ok(errors.some((error) => error.includes('freshness')));
});

test('all route node and edge references validate against the shared Atlas registry', async () => {
  assert.deepEqual(
    validateRoutes(FOUNDRY_SCHEMATIC_WORKFLOWS.routes, {
      components: await atlasComponents(),
    }),
    { ok: true, errors: [] },
  );
});

test('route-specific guardrails preserve adoption, assay, release, daily, and module boundaries', () => {
  const routes = Object.fromEntries(
    FOUNDRY_SCHEMATIC_WORKFLOWS.routes.map((route) => [route.id, route]),
  );

  assert.ok(routes['foundry-adoption'].requirements.includes('instance-boundary'));
  assert.ok(routes['foundry-release'].requirements.includes('owner-only-main'));
  assert.ok(routes['independent-project-assay'].requirements.includes('read-only-assay'));
  assert.ok(routes['daily-captain-pass'].requirements.includes('capacity-disposition'));
  assert.ok(routes['module-integration'].requirements.includes('hall-housed-socket'));
  assert.ok(routes['module-integration'].requirements.includes('no-module-reach-around'));
});

test('route-specific boundary contracts reject each prohibited shortcut', () => {
  const invalid = structuredClone(FOUNDRY_SCHEMATIC_WORKFLOWS);
  const routes = Object.fromEntries(invalid.routes.map((route) => [route.id, route]));

  routes['foundry-adoption'].boundaries.instanceBoundaryRetained = false;
  routes['foundry-release'].boundaries.productIsAuthoringSource = true;
  routes['independent-project-assay'].boundaries.repairAuthority = true;
  routes['new-workshop'].boundaries.owners = ['projects', 'wiki'];
  routes['project-update'].boundaries.verificationReceiptRequired = false;
  routes['daily-captain-pass'].boundaries.laneDispositions = ['eligible'];
  routes['module-integration'].boundaries.directModuleReachAround = true;

  const errors = validateWorkflowLibrary(invalid).join('\n');
  assert.match(errors, /instanceBoundaryRetained/);
  assert.match(errors, /productIsAuthoringSource/);
  assert.match(errors, /repairAuthority/);
  assert.match(errors, /owners/);
  assert.match(errors, /verificationReceiptRequired/);
  assert.match(errors, /laneDispositions/);
  assert.match(errors, /directModuleReachAround/);
});

test('workflow data rejects deployment-specific or credential-like content', () => {
  const invalid = structuredClone(FOUNDRY_SCHEMATIC_WORKFLOWS);
  const privatePath = ['', 'Users', 'example', 'private deployment state'].join('/');
  invalid.routes[0].purpose = `Read ${privatePath} with api_key=unsafe`;

  assert.match(validateWorkflowLibrary(invalid).join('\n'), /public-safe/);
});
