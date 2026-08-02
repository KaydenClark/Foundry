#!/usr/bin/env node

import { runAuditRequest } from "../src/index.mjs";

function readArguments(argv) {
  let projectPath;
  let fetchProvenance;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      if (json) throw new Error("--json may only be provided once.");
      json = true;
    } else if (argument === "--project") {
      if (projectPath !== undefined) throw new Error("--project may only be provided once.");
      projectPath = argv[++index];
    } else if (argument === "--fetch-provenance-json") {
      if (fetchProvenance !== undefined) {
        throw new Error("--fetch-provenance-json may only be provided once.");
      }
      const source = argv[++index];
      if (!source || source.length > 8_192) {
        throw new Error("--fetch-provenance-json must contain at most 8192 characters.");
      }
      try {
        fetchProvenance = JSON.parse(source);
      } catch {
        throw new Error("--fetch-provenance-json must be valid JSON.");
      }
    } else {
      throw new Error(`Unknown argument: ${argument ?? "<missing>"}`);
    }
  }

  if (!projectPath || projectPath.startsWith("--")) {
    throw new Error(
      "Usage: audit-engine --project <path> [--fetch-provenance-json <json>] [--json]",
    );
  }

  return {
    projectPath,
    fetchProvenance,
    json,
  };
}

try {
  const { projectPath, fetchProvenance, json } = readArguments(process.argv.slice(2));
  const result = await runAuditRequest({ projectPath, fetchProvenance });

  process.stdout.write(`${json ? JSON.stringify(result.report, null, 2) : result.message}\n`);
  process.exitCode =
    result.report.status === "healthy" ? 0 : result.report.status === "attention" ? 1 : 2;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
