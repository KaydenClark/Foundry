#!/usr/bin/env node

export * from "../../Foundry/tools/captain-automation.mjs";

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const corePath = fileURLToPath(new URL("../../Foundry/tools/captain-automation.mjs", import.meta.url));
const instanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.env.FOUNDRY_CAPTAIN_BINDINGS ??= join(
  instanceRoot,
  "Scheduled/Captain/workflow-bindings.json",
);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = spawnSync(process.execPath, [corePath, ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
