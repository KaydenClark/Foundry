#!/usr/bin/env node

export * from "../../Foundry/tools/captain-core.mjs";

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const corePath = fileURLToPath(new URL("../../Foundry/tools/captain-core.mjs", import.meta.url));
const instanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (!args.includes("--instance-root")) args.push("--instance-root", instanceRoot);
  const result = spawnSync(process.execPath, [corePath, ...args], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
