import path from "node:path";
import { inspectRepositories, loadPlatform, readContract } from "./platform-lib.mjs";
import { loadJson, validateDependencyGraph, validateTransportContract, validateTransportFixture } from "./transport-contract-lib.mjs";

try {
  const platform = loadPlatform(path.resolve(import.meta.dirname, "../platform.json"));
  const repositories = inspectRepositories(platform);
  const { summary } = readContract(platform);
  console.log("Personal Intelligence Platform doctor: healthy");
  for (const detail of repositories) console.log(`- ${detail}`);
  console.log(`- query-wiki contract ${summary.version}`);

  const contractsRoot = path.resolve(import.meta.dirname, "../contracts");
  const transportContract = loadJson(path.join(contractsRoot, "pip-retrieval-transport.openapi.json"));
  const transportSummary = validateTransportContract(transportContract);
  const transportFixture = loadJson(path.join(contractsRoot, "pip-retrieval-transport.fixture.json"));
  const fixtureSummary = validateTransportFixture(transportFixture, transportContract);
  const dependencyGraph = loadJson(path.join(contractsRoot, "pip-retrieval-dependency-graph.json"));
  const graphSummary = validateDependencyGraph(dependencyGraph);
  console.log(`- PIP retrieval transport contract ${transportSummary.path} v${transportContract.info.version}`);
  console.log(`- PIP retrieval transport fixture covers ${fixtureSummary.states.length} states`);
  console.log(`- PIP retrieval dependency graph: ${graphSummary.nodeCount} nodes, ${graphSummary.edgeCount} edges`);
} catch (error) {
  console.error(`Personal Intelligence Platform doctor: failed — ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
