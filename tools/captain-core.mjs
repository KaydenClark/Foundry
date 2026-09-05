#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateRegistry } from "./captain-automation.mjs";

const roleNames = [
  "Auditor.md",
  "Captain.md",
  "Chain Engineer.md",
  "Designer.md",
  "Planner.md",
  "Scout.md",
];
const coreToolNames = [
  "captain-automation.mjs",
  "captain-chain.mjs",
  "captain-core.mjs",
  "captain-git-preflight.mjs",
  "captain-ready-queue.mjs",
];

function assertFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
}

export function verifyCaptainCore(instanceRoot) {
  const root = resolve(instanceRoot);
  const embedded = existsSync(join(root, "Foundry", "source-root.json"));
  const foundryRoot = embedded ? join(root, "Foundry") : root;
  const rolesRoot = join(foundryRoot, "Roles");
  const actualRoles = readdirSync(rolesRoot).sort();
  if (actualRoles.join("\n") !== roleNames.join("\n")) {
    throw new Error("Foundry legacy role catalog is incomplete or contains undeclared entries");
  }
  const schedulingPolicy = join(foundryRoot, "Scheduled", "Captain", "AFK_POLICY.md");
  assertFile(schedulingPolicy, "reusable Captain scheduling policy");
  for (const name of coreToolNames) assertFile(join(foundryRoot, "tools", name), `Foundry tool ${name}`);

  const registryPath = join(root, "Scheduled", "Captain", "workflows.json");
  const bindingsPath = join(root, "Scheduled", "Captain", "workflow-bindings.json");
  assertFile(registryPath, "instance Captain workflow registry");
  assertFile(bindingsPath, "instance Captain workflow bindings");
  validateRegistry(
    JSON.parse(readFileSync(registryPath, "utf8")),
    { bindings: JSON.parse(readFileSync(bindingsPath, "utf8")) },
  );

  let rootAdapterCount = 0;
  if (embedded) {
    const toolsLane = instanceToolsLane(root);
    for (const name of coreToolNames) {
      assertFile(join(root, toolsLane, name), `root adapter ${name}`);
      rootAdapterCount += 1;
    }
  }
  return {
    ok: true,
    roleCount: actualRoles.length,
    schedulingPolicy: relative(root, schedulingPolicy),
    toolCount: coreToolNames.length,
    instanceRegistry: relative(root, registryPath),
    rootAdapterCount,
  };
}

function main(argv) {
  const rootIndex = argv.indexOf("--instance-root");
  const instanceRoot = rootIndex >= 0 ? argv[rootIndex + 1] : null;
  if (argv[0] !== "verify" || !instanceRoot) {
    throw new Error("usage: captain-core.mjs verify --instance-root PATH");
  }
  process.stdout.write(`${JSON.stringify(verifyCaptainCore(instanceRoot))}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

// An instance that declares a Workbench manifest owns where its tools lane
// sits; a pre-V3 instance keeps `tools/`. Read the declaration rather than
// importing from the instance, so the product stays free of instance modules.
function instanceToolsLane(root) {
  const manifestPath = join(root, "workbench", "manifest.json");
  if (!existsSync(manifestPath)) return "tools";
  try {
    const declared = JSON.parse(readFileSync(manifestPath, "utf8"))?.lanes?.tools;
    if (typeof declared === "string" && declared.trim()) return declared.trim().replace(/\/+$/, "");
  } catch {
    // A malformed manifest is reported by the instance's own checks; the
    // pre-V3 layout is the safe assumption here.
  }
  return "tools";
}
