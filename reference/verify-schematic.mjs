#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { validateRoutes } from './schematic-runtime.mjs';
import { FOUNDRY_SCHEMATIC_WORKFLOWS, validateWorkflowLibrary } from './schematic-workflows.mjs';

const here = new URL('.', import.meta.url);
const atlasSource = await readFile(new URL('./schematic-atlas-data.js', here), 'utf8');
const atlasContext = vm.createContext({ globalThis: {} });
vm.runInContext(atlasSource, atlasContext, { filename: 'schematic-atlas-data.js' });
const atlas = atlasContext.globalThis.FoundrySchematicAtlasData;
const html = await readFile(new URL('./foundry-schematic.html', here), 'utf8');
const readme = await readFile(new URL('./README.md', here), 'utf8');

const failures = [];
function check(label, condition) { if (!condition) failures.push(label); }

const atlasResult = atlas.validate();
check('Atlas registry is structurally complete', atlasResult.valid);
check('Workflow library is valid', validateWorkflowLibrary(FOUNDRY_SCHEMATIC_WORKFLOWS).length === 0);
const routeResult = validateRoutes(FOUNDRY_SCHEMATIC_WORKFLOWS.routes, { components: { nodes: atlas.registry.nodes, relationships: atlas.registry.relationships } });
check('Every workflow resolves against the shared Atlas seam', routeResult.ok);
check('Exactly seven baseline routes exist', FOUNDRY_SCHEMATIC_WORKFLOWS.routes.length === 7);
for (const route of FOUNDRY_SCHEMATIC_WORKFLOWS.routes) check(`Route is local-only: ${route.id}`, route.steps.at(-1).kind === 'projection-capture');

for (const required of ['Foundry Schematic', 'Run Player', 'local simulation', 'six governance planes', 'Job Order inspector', 'Transport controls', 'Simulation only', 'Blueprint Atlas', 'Simulation Floor', 'id="workflow"', 'id="play"', 'id="reset"', 'id="reduced-motion"', 'Canon Taskboard', 'Grounding Journal', 'Projection', 'aria-live']) {
  check(`Playable diorama contains ${required}`, html.includes(required));
}
check('Playable diorama does not use the rejected FND–LIVE label', !html.includes('FND–LIVE'));
check('Static artifact has no unguarded network mechanism', !/\b(?:fetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket|new\s+EventSource)\b/.test(html));
check('Static artifact installs a pre-load request boundary', html.includes('FoundrySchematicBoundary'));
check('Static artifact has no private host path', !/\/Users\/|[A-Za-z]:\\/.test(html));
check('Static artifact has no credential-shaped content', !/\b(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]/i.test(html));
for (const route of FOUNDRY_SCHEMATIC_WORKFLOWS.routes) check(`README names ${route.title}`, readme.includes(route.title));
for (const required of ['foundry-schematic.html', 'local', 'simulation', 'play', 'reset']) check(`README documents ${required}`, readme.toLowerCase().includes(required.toLowerCase()));

async function browserProof() {
  const root = fileURLToPath(here);
  const chrome = process.env.FOUNDRY_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  check('Headless Chrome is available for rendered proof', existsSync(chrome));
  if (!existsSync(chrome)) return;
  const server = createServer(async (request, response) => {
    const name = request.url?.split('?')[0] === '/foundry-schematic.html' ? 'foundry-schematic.html' : request.url?.split('?')[0] === '/schematic-atlas-data.js' ? 'schematic-atlas-data.js' : request.url?.split('?')[0] === '/schematic-runtime.mjs' ? 'schematic-runtime.mjs' : request.url?.split('?')[0] === '/schematic-workflows.mjs' ? 'schematic-workflows.mjs' : null;
    if (!name) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': name.endsWith('.html') ? 'text/html' : name.endsWith('.js') ? 'text/javascript' : 'text/javascript' });
    response.end(await readFile(new URL(`./${name}`, here)));
  });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    failures.push(`Rendered browser proof could not start localhost: ${error.message}`);
    server.close();
    return;
  }
  const port = server.address().port;
  const render = (suffix, windowSize = '1440,900') => new Promise((resolve, reject) => {
    const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--window-size=${windowSize}`, '--dump-dom', `http://127.0.0.1:${port}/foundry-schematic.html${suffix}`]);
    let output = ''; let error = '';
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve({ output, error }) : reject(new Error(`Chrome exited ${code}: ${error}`)));
  });
  try {
    const atlasView = await render('');
    check('Rendered Atlas contains the building map', atlasView.output.includes('The Foundry building map'));
    for (const route of FOUNDRY_SCHEMATIC_WORKFLOWS.routes) {
      const view = await render(`?verify-route=${encodeURIComponent(route.id)}`);
      check(`Rendered route reaches completion: ${route.id}`, view.output.includes(`data-verification="${route.id}:complete"`) && view.output.includes('Pawn captures the named outcome in Projection'));
      check(`Rendered route has no browser error: ${route.id}`, !/\b(?:TypeError|ReferenceError|SyntaxError)\b/.test(view.error));
    }
    for (const [profile, windowSize] of [['desktop', '1440,900'], ['mobile', '390,844']]) {
      const view = await render(`?verify-controls=${profile}`, windowSize);
      check(`Rendered ${profile} controls are interactive and accessible`, view.output.includes(`data-verification-controls="${profile}:passed"`));
      check(`Rendered ${profile} view made no request`, view.output.includes('data-boundary-requests="0"'));
      check(`Rendered ${profile} view has no browser error`, !/\b(?:TypeError|ReferenceError|SyntaxError)\b/.test(view.error));
    }
  } catch (error) { failures.push(`Rendered browser proof failed: ${error.message}`); } finally { server.close(); }
}

await browserProof();

if (failures.length) {
  console.error('Foundry Schematic quality gate failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Foundry Schematic quality gate passed: ${atlas.registry.nodes.length} Atlas rooms, ${atlas.registry.relationships.length} crossings, ${FOUNDRY_SCHEMATIC_WORKFLOWS.routes.length} replayable routes.`);
