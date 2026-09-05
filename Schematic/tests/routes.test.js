import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { governancePlanes } from "../src/domain/scenario.js";
import { normalizePath, routes } from "../src/router.js";

const root = new URL("..", import.meta.url);
const source = (relativePath) => readFileSync(new URL(relativePath, root), "utf8");
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)]
));
const supersessionEntries = (spec) => spec
  .slice(spec.indexOf("## Supersession"))
  .split(/\n(?=- )/)
  .filter((entry) => entry.startsWith("- "))
  .map((entry) => entry.replace(/\n\s+/g, " ").trim());

test("primary navigation exposes the exact seven owner-locked views", () => {
  assert.deepEqual(
    routes.map(({ path, label }) => ({ path, label })),
    [
      { path: "/", label: "The Foundry" },
      { path: "/workflow", label: "Workflow" },
      { path: "/halls", label: "Halls" },
      { path: "/sockets", label: "Sockets" },
      { path: "/modules", label: "Modules" },
      { path: "/workbench", label: "Workbench" },
      { path: "/governance", label: "Governance" },
    ],
  );
});

test("retired workflow routes resolve to the singular Workflow view", () => {
  assert.equal(normalizePath("/workflows"), "/workflow");
  assert.equal(normalizePath("/run"), "/workflow");
  assert.equal(normalizePath("/history"), "/workflow");
  assert.equal(normalizePath("/workflow/"), "/workflow");
});

test("unknown routes fail closed to The Foundry", () => {
  assert.equal(normalizePath("/not-a-view"), "/");
});

test("the campus opening and retained six-floor views have reciprocal scoped lifecycle ownership", () => {
  const app = source("src/App.jsx");
  const foundryPage = source("src/pages/FoundryPage.jsx");
  const workflowPage = source("src/pages/WorkflowPage.jsx");
  const runPlayer = source("src/pages/RunPlayer.jsx");
  const workflowFloorPlan = source("src/components/WorkflowFloorPlan.jsx");
  const governancePage = source("src/pages/GovernancePage.jsx");
  const factoryStack = source("src/components/FactoryStack.jsx");
  const atlasSpec = source("specs/S-002-rotatable-stacked-foundry-atlas/SPEC.md");
  const remediationSpec = source("specs/S-013-final-audit-remediation/SPEC.md");

  assert.equal(routes[0].path, "/");
  assert.match(app, /^\s*"\/": FoundryPage,$/m);
  assert.match(foundryPage, /<CampusAtlas\s*\/>/);

  assert.equal(governancePlanes.length, 6);
  assert.match(workflowPage, /<RunPlayer\s*\/>/);
  assert.match(runPlayer, /<WorkflowFloorPlan[^>]*focusedStepIndex=\{focus\.index\}[^>]*\/>/);
  assert.doesNotMatch(workflowPage, /structuralOverview/);
  assert.doesNotMatch(runPlayer, /FactoryStack/);
  assert.match(workflowFloorPlan, /HALLS/);
  assert.match(workflowFloorPlan, /MODULES/);
  assert.match(workflowFloorPlan, /SOCKETS/);
  assert.match(governancePage, /<FactoryStack compact\s*\/>/);
  assert.match(governancePage, /<GovernanceFloorPlan plane=\{selectedPlane\}\s*\/>/);
  assert.match(factoryStack, /governancePlanes\.map\(\(plane, index\) =>/);

  assert.match(atlasSpec, /^\*\*Status:\*\* complete$/m);
  assert.deepEqual(
    supersessionEntries(atlasSpec).filter((entry) => entry.startsWith("- Superseded by:")),
    ["- Superseded by: S-013/TK-003 only for the obsolete opening-view clauses; the six-floor Atlas behavior and proof remain current for Workflow and Governance."],
  );
  assert.deepEqual(
    supersessionEntries(remediationSpec).filter((entry) => entry.startsWith("- Supersedes:")),
    ["- Supersedes: only S-002's historical claim that the six-floor stack is the application opening view; S-002's Atlas behavior and proof remain current for Workflow and Governance."],
  );
});

test("Governance is the only routed source that mounts FactoryStack", () => {
  const srcRoot = new URL("../src/", import.meta.url);
  const consumers = sourceFiles(srcRoot.pathname)
    .filter((file) => /\.(?:js|jsx)$/.test(file) && !file.endsWith("/components/FactoryStack.jsx"))
    .filter((file) => readFileSync(file, "utf8").includes("FactoryStack"))
    .map((file) => relative(srcRoot.pathname, file));

  assert.deepEqual(consumers, ["pages/GovernancePage.jsx"]);
});
