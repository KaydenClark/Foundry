#!/usr/bin/env node

import { resolve } from "node:path";

import { reviewFoundryArtifact } from "../src/foundry-artifact.mjs";

function parse(args) {
  const allowed = new Set(["producer-repo", "artifact", "approval", "json"]);
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option?.startsWith("--")) throw new Error(`unexpected argument: ${option ?? "end of input"}`);
    const name = option.slice(2);
    if (!allowed.has(name)) throw new Error(`unexpected option: ${option}`);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate option: ${option}`);
    if (name === "json") {
      options[name] = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    options[name] = value;
  }
  for (const required of ["producer-repo", "artifact", "approval"]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  const approval = reviewFoundryArtifact({
    producerRepo: resolve(options["producer-repo"]),
    artifactRoot: resolve(options.artifact),
    approvalPath: resolve(options.approval),
  });
  console.log(options.json
    ? JSON.stringify(approval, null, 2)
    : `ok - Assay approved ${approval.treeDigest} from ${approval.producerSha} at ${resolve(options.approval)}`);
} catch (error) {
  console.error(`error - ${error.message}`);
  process.exitCode = 1;
}
