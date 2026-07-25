import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  inspectRepositories,
  loadPlatform,
  readContract,
  verifyCicConsumer,
  writeHealthReport
} from "./platform-lib.mjs";

const live = process.argv.includes("--live");
const platform = loadPlatform(path.resolve(import.meta.dirname, "../platform.json"));
const checks = {};

try {
  checks.repositories = { status: "healthy", detail: inspectRepositories(platform).join("; ") };
} catch (error) {
  checks.repositories = { status: "failed", detail: error.message };
}

try {
  const { summary } = readContract(platform);
  const requests = [];
  const consumer = await verifyCicConsumer({
    cicRepoPath: platform.repositories.cic.path,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ query: "platform", count: 0, results: [] }), { status: 200 });
    }
  });
  const body = JSON.parse(requests[0].options.body);
  if (consumer.status !== "empty" || body.query !== "platform" || body.match_count !== 8 || body.match_threshold !== 0.2) {
    throw new Error("CIC emitted an incompatible query-wiki request.");
  }
  checks.contract = { status: "healthy", detail: `OpenBrain ${summary.version} and CIC consumer are compatible.` };
} catch (error) {
  checks.contract = { status: "failed", detail: error.message };
}

try {
  const result = spawnSync("npm", ["run", "status:codex", "--", "--json"], {
    cwd: platform.repositories.openbrain.path,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  const output = `${result.stdout || ""} ${result.stderr || ""}`.trim();
  checks.openbrain = result.status === 0
    ? { status: "healthy", detail: "Scheduled OpenBrain ingestion reports fresh." }
    : { status: "degraded", detail: output.includes("unknown") ? "OpenBrain freshness is not recorded on this computer." : "OpenBrain ingestion is stale or unhealthy." };

  if (live && process.env.QUERY_WIKI_URL && process.env.QUERY_WIKI_ACCESS_TOKEN) {
    const response = await fetch(process.env.QUERY_WIKI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.QUERY_WIKI_ACCESS_TOKEN}` },
      body: JSON.stringify({ query: "Personal Intelligence Platform health check", match_count: 1, match_threshold: 0.2, filter_vault: null })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.results)) throw new Error(`Live query-wiki returned HTTP ${response.status}.`);
    checks.openbrain = { status: "healthy", detail: `Freshness and authenticated retrieval passed with ${payload.results.length} result envelope.` };
  } else if (live) {
    checks.openbrain.detail += " Live retrieval skipped because credentials were not supplied.";
  }
} catch (error) {
  checks.openbrain = { status: live ? "failed" : "degraded", detail: error.message };
}

let temporaryDirectory;
let server;
try {
  if (live && process.env.CIC_BASE_URL) {
    const response = await fetch(`${process.env.CIC_BASE_URL.replace(/\/$/, "")}/api/state`);
    const body = await response.json();
    if (!response.ok || !body.dashboard || !Array.isArray(body.tasks)) throw new Error(`Live CIC returned HTTP ${response.status}.`);
    checks.cic = { status: "healthy", detail: "Configured CIC API is reachable." };
  } else {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "platform-cic-"));
    const { createApp } = await import(pathToFileURL(path.join(platform.repositories.cic.path, "server/app.js")));
    const app = createApp({
      dbPath: path.join(temporaryDirectory, "cic.sqlite"),
      dataFeedPath: path.join(platform.repositories.cic.path, "data.example.js"),
      platformHealthReport: "",
      passcodeHash: "",
      port: 0,
      spotifyAccessToken: "",
      spotifyRefreshToken: "",
      spotifyClientId: "",
      spotifyClientSecret: "",
      gmailRefreshCommand: ""
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
    const body = await response.json();
    if (!response.ok || !body.dashboard || !Array.isArray(body.tasks)) throw new Error("Isolated CIC smoke returned an invalid state envelope.");
    checks.cic = { status: "healthy", detail: "Isolated credential-free CIC API smoke passed." };
    app.locals.db.close?.();
  }
} catch (error) {
  checks.cic = { status: "failed", detail: error.message };
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

const statuses = Object.values(checks).map((check) => check.status);
const overall = statuses.includes("failed") ? "failed" : statuses.some((status) => status === "degraded" || status === "unknown") ? "degraded" : "healthy";
const report = writeHealthReport(platform.health.report, {
  checkedAt: new Date().toISOString(),
  mode: live ? "live" : "portable",
  overall,
  checks
});

console.log(`Personal Intelligence Platform health: ${report.overall} (${report.mode})`);
for (const [name, check] of Object.entries(report.checks)) console.log(`- ${name}: ${check.status} — ${check.detail}`);
console.log(`Report: ${platform.health.report}`);
if (overall === "failed") process.exitCode = 1;
