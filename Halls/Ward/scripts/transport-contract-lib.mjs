import fs from "node:fs";

const REQUIRED_REQUEST_FIELDS = ["clientId", "query"];
const REQUIRED_RESPONSES = ["200", "400", "401", "403", "502", "500"];
const REQUIRED_SUCCESS_FIELDS = ["query", "count", "results", "transport"];
const REQUIRED_FIXTURE_STATES = [
  "success_fresh",
  "success_unknown_freshness",
  "unauthorized_client",
  "invalid_request",
  "adapter_disabled",
  "upstream_unreachable"
];
const FAIL_CLOSED_STATES = ["unauthorized_client", "invalid_request", "adapter_disabled", "upstream_unreachable"];
const FRESHNESS_STATUSES = new Set(["fresh", "stale", "unknown"]);
const FORBIDDEN_CREDENTIAL_KEYS = [
  "serviceRoleKey",
  "service_role_key",
  "openBrainToken",
  "openbrainToken",
  "queryWikiAccessToken",
  "query_wiki_access_token",
  "supabaseKey",
  "supabase_key",
  "bearerToken",
  "apiKey",
  "api_key"
];

export function loadJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

export function validateTransportContract(contract) {
  if (contract?.openapi !== "3.1.0" || !contract?.info?.version) {
    throw new Error("PIP transport contract metadata is invalid.");
  }
  const route = contract.paths?.["/pip/retrieve"]?.post;
  if (!route) throw new Error("PIP transport contract is missing POST /pip/retrieve.");
  if (!route.security?.some((entry) => "clientBearerAuth" in entry)) {
    throw new Error("PIP transport contract must require clientBearerAuth.");
  }
  const properties = route.requestBody?.content?.["application/json"]?.schema?.properties || {};
  for (const field of REQUIRED_REQUEST_FIELDS) {
    if (!(field in properties)) throw new Error(`PIP transport contract is missing request field ${field}.`);
  }
  for (const status of REQUIRED_RESPONSES) {
    if (!route.responses?.[status]) throw new Error(`PIP transport contract is missing response ${status}.`);
  }
  const successSchema = route.responses["200"]?.content?.["application/json"]?.schema || {};
  const successFields = successSchema.required || [];
  for (const field of REQUIRED_SUCCESS_FIELDS) {
    if (!successFields.includes(field)) throw new Error(`PIP transport contract success response is missing field ${field}.`);
  }
  const freshnessStatuses = contract.components?.schemas?.Freshness?.properties?.status?.enum || [];
  if (!freshnessStatuses.includes("unknown")) {
    throw new Error("PIP transport contract must allow an explicit 'unknown' freshness status.");
  }
  return { version: contract.info.version, path: "/pip/retrieve" };
}

function scanForForbiddenCredentials(value, path = "$") {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_CREDENTIAL_KEYS.includes(key)) return `${path}.${key}`;
      const hit = scanForForbiddenCredentials(nested, `${path}.${key}`);
      if (hit) return hit;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const hit = scanForForbiddenCredentials(value[index], `${path}[${index}]`);
      if (hit) return hit;
    }
    return null;
  }
  return null;
}

export function validateTransportFixture(fixture, contract) {
  validateTransportContract(contract);
  if (fixture?.schemaVersion !== 1) throw new Error("PIP transport fixture has an unsupported schema version.");
  const cases = fixture?.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("PIP transport fixture must provide a non-empty cases array.");

  const seenStates = new Set();
  for (const testCase of cases) {
    if (!testCase.state) throw new Error("Fixture case is missing a state name.");
    if (seenStates.has(testCase.state)) throw new Error(`Fixture case state ${testCase.state} is duplicated.`);
    seenStates.add(testCase.state);

    if (!REQUIRED_RESPONSES.includes(String(testCase.httpStatus))) {
      throw new Error(`Fixture case ${testCase.state} uses an httpStatus outside the contract's declared responses.`);
    }

    const credentialHit = scanForForbiddenCredentials(testCase.request) || scanForForbiddenCredentials(testCase.response);
    if (credentialHit) {
      throw new Error(`Fixture case ${testCase.state} exposes a backend-credential-shaped field at ${credentialHit}.`);
    }

    if (testCase.state.startsWith("success")) {
      if (testCase.httpStatus !== 200) throw new Error(`Fixture case ${testCase.state} must use HTTP 200.`);
      for (const field of REQUIRED_SUCCESS_FIELDS) {
        if (!(field in (testCase.response || {}))) {
          throw new Error(`Fixture case ${testCase.state} response is missing field ${field}.`);
        }
      }
      for (const result of testCase.response.results || []) {
        const status = result?.provenance?.freshness?.status;
        if (!FRESHNESS_STATUSES.has(status)) {
          throw new Error(`Fixture case ${testCase.state} has a result with an invalid freshness status.`);
        }
      }
    }

    if (FAIL_CLOSED_STATES.includes(testCase.state)) {
      const results = testCase.response?.results;
      if (results !== undefined && Array.isArray(results) && results.length > 0) {
        throw new Error(`Fixture case ${testCase.state} must fail closed with no fabricated results.`);
      }
      if (!testCase.response?.error) throw new Error(`Fixture case ${testCase.state} must report an error code.`);
    }
  }

  for (const requiredState of REQUIRED_FIXTURE_STATES) {
    if (!seenStates.has(requiredState)) throw new Error(`PIP transport fixture is missing required state ${requiredState}.`);
  }

  return { path: "/pip/retrieve", states: [...seenStates] };
}

const NODE_ID_PATTERN = /^[a-z][a-z0-9-]*:S-\d{3}(:TK-\d{3})?$/;

export function validateDependencyGraph(graph) {
  if (graph?.schemaVersion !== 1) throw new Error("Dependency graph has an unsupported schema version.");
  const nodes = graph?.nodes;
  const edges = graph?.edges;
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error("Dependency graph must declare at least one node.");
  if (!Array.isArray(edges)) throw new Error("Dependency graph must declare an edges array.");

  const ids = new Set();
  for (const node of nodes) {
    if (!node?.id || !NODE_ID_PATTERN.test(node.id)) throw new Error(`Dependency graph node id is malformed: ${node?.id}`);
    if (ids.has(node.id)) throw new Error(`Dependency graph has a duplicate node id: ${node.id}`);
    if (!node.status) throw new Error(`Dependency graph node ${node.id} is missing a status.`);
    ids.add(node.id);
  }

  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new Error(`Dependency graph edge references an unknown node: ${edge.from} -> ${edge.to}`);
    }
    if (edge.from === edge.to) throw new Error(`Dependency graph edge is a self-loop: ${edge.from}`);
    adjacency.get(edge.from).push(edge.to);
  }

  const state = new Map();
  const detectCycle = (id) => {
    if (state.get(id) === "done") return false;
    if (state.get(id) === "visiting") return true;
    state.set(id, "visiting");
    for (const next of adjacency.get(id)) {
      if (detectCycle(next)) return true;
    }
    state.set(id, "done");
    return false;
  };
  for (const id of ids) {
    if (detectCycle(id)) throw new Error(`Dependency graph contains a cycle reachable from ${id}.`);
  }

  return { nodeCount: nodes.length, edgeCount: edges.length };
}
