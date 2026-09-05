import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateRoutes } from './schematic-runtime.mjs';
import { FOUNDRY_SCHEMATIC_WORKFLOWS } from './schematic-workflows.mjs';

const source = await readFile(new URL('./schematic-atlas-data.js', import.meta.url), 'utf8');
const context = vm.createContext({ globalThis: {} });
vm.runInContext(source, context, { filename: 'schematic-atlas-data.js' });
const atlas = context.globalThis.FoundrySchematicAtlasData;
assert.ok(atlas, 'registry is externally loadable');
const valid = atlas.validate();
assert.equal(valid.valid, true);
assert.deepEqual([...valid.errors], []);
assert.equal(atlas.registry.nodes.length, 36, 'every declared component has a renderable node');
assert.equal(atlas.registry.workflows.length, 7);
const missingCoverage = structuredClone(atlas.registry); delete missingCoverage.coverage.halls;
assert.match(atlas.validate(missingCoverage).errors.join('\n'), /missing required coverage concern: halls/);
const dangling = structuredClone(atlas.registry); dangling.relationships.push({ from: 'foundry', to: 'missing-node', type: 'contains' });
assert.match(atlas.validate(dangling).errors.join('\n'), /dangling relationship/);
const unsafe = structuredClone(atlas.registry); unsafe.nodes[0].purpose = `/${'Users'}/example/not-public`;
assert.match(atlas.validate(unsafe).errors.join('\n'), /non-public-safe value/);

const workflowCompatibility = validateRoutes(FOUNDRY_SCHEMATIC_WORKFLOWS.routes, {
  components: atlas.registry,
});
assert.equal(workflowCompatibility.ok, true, workflowCompatibility.errors.join('\n'));
console.log('atlas registry validation: passed');
