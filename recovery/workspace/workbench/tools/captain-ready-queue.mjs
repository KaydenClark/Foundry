#!/usr/bin/env node

export * from "../../Foundry/tools/captain-ready-queue.mjs";

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const corePath = fileURLToPath(new URL("../../Foundry/tools/captain-ready-queue.mjs", import.meta.url));
const instanceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const canonicalRoot = dirname(execFileSync(
  "git",
  ["-C", instanceRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
  { encoding: "utf8" },
).trim());
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (!args.includes("--root")) args.push("--root", instanceRoot);
  const env = { ...process.env, FOUNDRY_CANONICAL_INSTANCE_ROOT: canonicalRoot };
  const result = spawnSync(process.execPath, [corePath, ...args], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
