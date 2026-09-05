#!/usr/bin/env node

export * from "../../Foundry/tools/captain-git-preflight.mjs";

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const corePath = fileURLToPath(new URL("../../Foundry/tools/captain-git-preflight.mjs", import.meta.url));
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = spawnSync(process.execPath, [corePath, ...process.argv.slice(2)], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
