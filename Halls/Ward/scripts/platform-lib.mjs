import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIRED_REQUEST_FIELDS = ["query", "match_count", "match_threshold", "filter_vault"];
const REQUIRED_RESPONSES = ["200", "400", "401", "405", "500"];
const REQUIRED_RESPONSE_FIELDS = ["query", "count", "results"];
const CHECK_NAMES = ["repositories", "contract", "openbrain", "cic"];
const ALLOWED_STATUSES = new Set(["healthy", "degraded", "failed", "skipped", "unknown"]);

export function loadPlatform(manifestPath, env = process.env) {
  const root = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported platform manifest schema.");
  const repositories = Object.fromEntries(Object.entries(manifest.repositories).map(([name, repository]) => [
    name,
    {
      ...repository,
      path: path.resolve(root, env[repository.pathEnv] || repository.path)
    }
  ]));
  return { ...manifest, root, repositories, health: { ...manifest.health, report: path.resolve(root, manifest.health.report) } };
}

export function validateQueryWikiContract(contract) {
  if (contract?.openapi !== "3.1.0" || !contract?.info?.version) throw new Error("OpenBrain contract metadata is invalid.");
  const route = contract.paths?.["/query-wiki"]?.post;
  if (!route) throw new Error("OpenBrain contract is missing POST /query-wiki.");
  const properties = route.requestBody?.content?.["application/json"]?.schema?.properties || {};
  for (const field of REQUIRED_REQUEST_FIELDS) {
    if (!(field in properties)) throw new Error(`OpenBrain contract is missing request field ${field}.`);
  }
  for (const status of REQUIRED_RESPONSES) {
    if (!route.responses?.[status]) throw new Error(`OpenBrain contract is missing response ${status}.`);
  }
  const responseFields = route.responses["200"]?.content?.["application/json"]?.schema?.required || [];
  for (const field of REQUIRED_RESPONSE_FIELDS) {
    if (!responseFields.includes(field)) throw new Error(`OpenBrain contract is missing response field ${field}.`);
  }
  return { version: contract.info.version, path: "/query-wiki" };
}

export async function verifyCicConsumer({ cicRepoPath, fetchImpl }) {
  if (!cicRepoPath) throw new Error("CIC repository path is required.");
  const modulePath = path.join(cicRepoPath, "server/openbrainClient.js");
  const { queryOpenBrain } = await import(pathToFileURL(modulePath));
  return queryOpenBrain({
    queryWikiUrl: "https://openbrain.invalid/query-wiki",
    queryWikiAccessToken: "platform-test-token",
    openBrainMatchCount: 8,
    openBrainMatchThreshold: 0.2
  }, "platform", { fetchImpl });
}

function normalizeRemote(remote) {
  return String(remote || "").replace(/\.git$/, "").toLowerCase();
}

export function inspectRepositories(platform) {
  const details = [];
  for (const [name, repository] of Object.entries(platform.repositories)) {
    if (!fs.existsSync(repository.path)) throw new Error(`${name} repository is missing at ${repository.path}.`);
    for (const file of repository.controlFiles) {
      if (!fs.existsSync(path.join(repository.path, file))) throw new Error(`${name} is missing ${file}.`);
    }
    const result = spawnSync("git", ["-C", repository.path, "config", "--get", "remote.origin.url"], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`${name} origin remote could not be read.`);
    if (normalizeRemote(result.stdout.trim()) !== normalizeRemote(repository.remote)) {
      throw new Error(`${name} origin does not match the platform manifest.`);
    }
    details.push(`${name}: ${repository.releaseBranch}/${repository.stagingBranch}`);
  }
  return details;
}

function safeDetail(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

export function writeHealthReport(reportPath, report) {
  const checks = Object.fromEntries(CHECK_NAMES.filter((name) => report.checks?.[name]).map((name) => {
    const check = report.checks[name];
    return [name, {
      status: ALLOWED_STATUSES.has(check.status) ? check.status : "unknown",
      detail: safeDetail(check.detail)
    }];
  }));
  const output = {
    schemaVersion: 1,
    checkedAt: new Date(report.checkedAt).toISOString(),
    mode: report.mode === "live" ? "live" : "portable",
    overall: ALLOWED_STATUSES.has(report.overall) ? report.overall : "unknown",
    checks
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${reportPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, reportPath);
  fs.chmodSync(reportPath, 0o600);
  return output;
}

export function readContract(platform) {
  const contractPath = path.join(platform.repositories.openbrain.path, platform.repositories.openbrain.contract);
  let source;
  let sourceLabel = contractPath;
  if (fs.existsSync(contractPath)) {
    source = fs.readFileSync(contractPath, "utf8");
  } else {
    const repository = platform.repositories.openbrain;
    const result = spawnSync(
      "git",
      ["-C", repository.path, "show", `origin/${repository.stagingBranch}:${repository.contract}`],
      { encoding: "utf8" }
    );
    if (result.status !== 0) throw new Error(`OpenBrain contract is missing from the checkout and origin/${repository.stagingBranch}.`);
    source = result.stdout;
    sourceLabel = `origin/${repository.stagingBranch}:${repository.contract}`;
  }
  const contract = JSON.parse(source);
  return { contract, contractPath: sourceLabel, summary: validateQueryWikiContract(contract) };
}
