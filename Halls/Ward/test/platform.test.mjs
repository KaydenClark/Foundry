import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadPlatform,
  validateQueryWikiContract,
  verifyCicConsumer,
  writeHealthReport
} from "../scripts/platform-lib.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("platform manifest resolves both configured repositories", () => {
  const platform = loadPlatform(path.join(root, "platform.json"), {
    OPENBRAIN_REPO_PATH: "/tmp/openbrain",
    CIC_REPO_PATH: "/tmp/cic"
  });
  assert.equal(platform.repositories.openbrain.path, "/tmp/openbrain");
  assert.equal(platform.repositories.cic.path, "/tmp/cic");
  assert.equal(platform.repositories.openbrain.stagingBranch, "integration");
  assert.equal(platform.repositories.cic.stagingBranch, "Integration");
});

test("platform manifest defaults to the GPT_OS Foundry repositories", () => {
  const platform = loadPlatform(path.join(root, "platform.json"), {});
  assert.equal(
    platform.repositories.openbrain.path,
    path.resolve(root, "../../Modules/OpenBrain")
  );
  assert.equal(
    platform.repositories.cic.path,
    path.resolve(root, "../../Modules/Command Information Center")
  );
});

test("authoritative OpenBrain contract exposes the CIC request and response envelope", () => {
  const contract = {
    openapi: "3.1.0",
    info: { version: "1.0.0" },
    paths: {
      "/query-wiki": {
        post: {
          security: [{ bearerAuth: [] }],
          requestBody: { content: { "application/json": { schema: {
            required: ["query"],
            properties: {
              query: {}, match_count: {}, match_threshold: {}, filter_vault: {}
            }
          } } } },
          responses: { "200": { content: { "application/json": { schema: {
            required: ["query", "count", "results"]
          } } } }, "400": {}, "401": {}, "405": {}, "500": {} }
        }
      }
    }
  };
  assert.deepEqual(validateQueryWikiContract(contract), { version: "1.0.0", path: "/query-wiki" });
});

test("CIC consumer emits the authoritative query-wiki request shape", async () => {
  const requests = [];
  const platform = loadPlatform(path.join(root, "platform.json"));
  const result = await verifyCicConsumer({
    cicRepoPath: platform.repositories.cic.path,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ query: "platform", count: 0, results: [] }), { status: 200 });
    }
  });
  assert.equal(result.status, "empty");
  const body = JSON.parse(requests[0].options.body);
  assert.deepEqual(body, {
    query: "platform",
    match_count: 8,
    match_threshold: 0.2,
    filter_vault: null
  });
  assert.equal(requests[0].options.headers.Authorization, "Bearer platform-test-token");
});

test("health reports are atomic, private, and omit unapproved fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "platform-report-"));
  const reportPath = path.join(dir, "platform-health.json");
  writeHealthReport(reportPath, {
    checkedAt: "2026-07-12T18:00:00.000Z",
    mode: "portable",
    overall: "healthy",
    checks: { contract: { status: "healthy", detail: "Compatible" } },
    secret: "do not persist"
  });
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.secret, undefined);
  assert.equal(fs.statSync(reportPath).mode & 0o777, 0o600);
});
