import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  loadJson,
  validateDependencyGraph,
  validateTransportContract,
  validateTransportFixture
} from "../scripts/transport-contract-lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const contractsRoot = path.join(root, "contracts");

function loadFixtures() {
  const contract = loadJson(path.join(contractsRoot, "pip-retrieval-transport.openapi.json"));
  const fixture = loadJson(path.join(contractsRoot, "pip-retrieval-transport.fixture.json"));
  const graph = loadJson(path.join(contractsRoot, "pip-retrieval-dependency-graph.json"));
  return { contract, fixture, graph };
}

test("committed PIP transport contract declares clientBearerAuth and the required responses", () => {
  const { contract } = loadFixtures();
  assert.deepEqual(validateTransportContract(contract), { version: "1.0.0", path: "/pip/retrieve" });
});

test("transport contract missing clientBearerAuth is rejected", () => {
  const { contract } = loadFixtures();
  const broken = structuredClone(contract);
  broken.paths["/pip/retrieve"].post.security = [{ someOtherAuth: [] }];
  assert.throws(() => validateTransportContract(broken), /clientBearerAuth/);
});

test("transport contract without an explicit unknown freshness status is rejected", () => {
  const { contract } = loadFixtures();
  const broken = structuredClone(contract);
  broken.components.schemas.Freshness.properties.status.enum = ["fresh", "stale"];
  assert.throws(() => validateTransportContract(broken), /unknown/);
});

test("committed fixture covers every required state and never fabricates results on a failure path", () => {
  const { contract, fixture } = loadFixtures();
  const summary = validateTransportFixture(fixture, contract);
  assert.deepEqual(new Set(summary.states), new Set([
    "success_fresh",
    "success_unknown_freshness",
    "unauthorized_client",
    "invalid_request",
    "adapter_disabled",
    "upstream_unreachable"
  ]));
});

test("fixture missing a required state is rejected", () => {
  const { contract, fixture } = loadFixtures();
  const broken = structuredClone(fixture);
  broken.cases = broken.cases.filter((entry) => entry.state !== "adapter_disabled");
  assert.throws(() => validateTransportFixture(broken, contract), /adapter_disabled/);
});

test("fixture case that leaks an upstream-credential-shaped field is rejected", () => {
  const { contract, fixture } = loadFixtures();
  const broken = structuredClone(fixture);
  const successCase = broken.cases.find((entry) => entry.state === "success_fresh");
  successCase.request.serviceRoleKey = "should-never-appear";
  assert.throws(() => validateTransportFixture(broken, contract), /backend-credential-shaped/);
});

test("fixture case that fabricates results on a fail-closed state is rejected", () => {
  const { contract, fixture } = loadFixtures();
  const broken = structuredClone(fixture);
  const disabledCase = broken.cases.find((entry) => entry.state === "adapter_disabled");
  disabledCase.response.results = [{ content: "should not exist" }];
  assert.throws(() => validateTransportFixture(broken, contract), /fail closed/);
});

test("committed dependency graph is acyclic and every edge resolves to a declared node", () => {
  const { graph } = loadFixtures();
  const summary = validateDependencyGraph(graph);
  assert.equal(summary.nodeCount, graph.nodes.length);
  assert.equal(summary.edgeCount, graph.edges.length);
});

test("dependency graph with a dangling edge is rejected", () => {
  const { graph } = loadFixtures();
  const broken = structuredClone(graph);
  broken.edges.push({ from: "pip:S-001:TK-001", to: "pip:S-999:TK-999", type: "depends-on" });
  assert.throws(() => validateDependencyGraph(broken), /unknown node/);
});

test("dependency graph with a cycle is rejected", () => {
  const { graph } = loadFixtures();
  const broken = structuredClone(graph);
  broken.edges.push({ from: "pip:S-001:TK-001", to: "pip:S-001:TK-003", type: "depends-on" });
  assert.throws(() => validateDependencyGraph(broken), /cycle/);
});
