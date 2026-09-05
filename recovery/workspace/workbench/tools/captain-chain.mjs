#!/usr/bin/env node

export * from "../../Foundry/tools/captain-chain.mjs";

import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const corePath = fileURLToPath(new URL("../../Foundry/tools/captain-chain.mjs", import.meta.url));
const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const commonGitDir = execFileSync(
  "git",
  ["-C", checkoutRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
  { encoding: "utf8" },
).trim();
const instanceRoot = dirname(commonGitDir);
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const env = { ...process.env, FOUNDRY_INSTANCE_ROOT: instanceRoot };
  const result = spawnSync(process.execPath, [corePath, ...process.argv.slice(2)], { env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
