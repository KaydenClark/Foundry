#!/usr/bin/env node
import { cpSync, existsSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TEST_ENDPOINT = "http://127.0.0.1:5173/";
export const PRODUCTION_ENDPOINT = "http://foundry.example:5173/";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REQUIRED_COMMANDS = [
  ["npm", ["test"]],
  ["npm", ["run", "test:quality"]],
  ["npm", ["run", "test:safety"]],
  ["npm", ["run", "build"]],
];

function isInside(candidate, parent) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (!pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && pathFromParent !== ".." && !isAbsolute(pathFromParent));
}

function requireDirectory(path, description) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${description} must be an existing directory: ${path}`);
  }
}

export function validateReleaseConfig(config, { projectRoot = PROJECT_ROOT } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Release config must be a JSON object.");
  }
  if (config.schemaVersion !== 1) throw new Error("Release config schemaVersion must be 1.");
  if (typeof config.deploymentHome !== "string" || !isAbsolute(config.deploymentHome)) {
    throw new Error("Release config deploymentHome must be an absolute instance-private path.");
  }

  const source = resolve(projectRoot);
  const deploymentHome = resolve(config.deploymentHome);
  if (isInside(deploymentHome, source) || isInside(source, deploymentHome)) {
    throw new Error("Release deploymentHome must not overlap the source worktree.");
  }
  requireDirectory(deploymentHome, "Release deploymentHome");

  const productionUrl = config.productionUrl ?? PRODUCTION_ENDPOINT;
  if (productionUrl === TEST_ENDPOINT) {
    throw new Error("Release config must not use the test endpoint as production.");
  }
  if (productionUrl !== PRODUCTION_ENDPOINT) {
    throw new Error(`Release config productionUrl must be ${PRODUCTION_ENDPOINT}.`);
  }

  return { schemaVersion: 1, deploymentHome, productionUrl };
}

export function readReleaseConfig(configPath, options = {}) {
  if (!configPath || !isAbsolute(configPath)) {
    throw new Error("Pass an absolute path to an instance-private release config with --config.");
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read release config ${configPath}: ${error.message}`);
  }
  return validateReleaseConfig(config, options);
}

function runCheckedCommand(command, args, { cwd }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw new Error(`${command} ${args.join(" ")} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}.`);
}

function runGitCommand(args, { cwd }) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Release source must be a readable Git worktree: ${result.error?.message ?? result.stderr.trim()}.`);
  }
  return result.stdout.trim();
}

export function assertPublishedSource(projectRoot, { gitCommand = runGitCommand } = {}) {
  const command = (args) => gitCommand(args, { cwd: projectRoot });
  if (command(["status", "--porcelain", "--untracked-files=all"])) {
    throw new Error("Release source is dirty; commit and push the verified change before releasing it.");
  }
  const branch = command(["branch", "--show-current"]);
  if (!branch) throw new Error("Release source must be on a named feature branch.");
  const head = command(["rev-parse", "HEAD"]);
  const remote = command(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
  const remoteHead = remote.split(/\s+/)[0];
  if (!remoteHead || remoteHead !== head) {
    throw new Error("Release source commit is not pushed to its same-name origin branch.");
  }
}

export async function probeProductionDocument(productionUrl) {
  const response = await fetch(productionUrl, { redirect: "error" });
  return { status: response.status, body: await response.text(), url: productionUrl };
}

function assertProductionDocument(probe, productionUrl) {
  if (!probe || probe.status !== 200) {
    throw new Error(`Production endpoint ${productionUrl} returned HTTP ${probe?.status ?? "no response"}.`);
  }
  if (!/<title>Foundry Schematic<\/title>/i.test(probe.body ?? "")) {
    throw new Error(`Production endpoint ${productionUrl} did not serve the Foundry Schematic document.`);
  }
}

function removeDirectoryIfPresent(path) {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

function installArtifact({ sourceDist, deploymentHome }) {
  const liveDist = join(deploymentHome, "dist");
  const identifier = `.schematic-release-${process.pid}-${randomUUID()}`;
  const stagedDist = join(deploymentHome, `${identifier}-next`);
  const backupDist = join(deploymentHome, `${identifier}-previous`);
  let backupCreated = false;
  let nextInstalled = false;

  try {
    cpSync(sourceDist, stagedDist, { recursive: true, errorOnExist: true, force: false });
    if (existsSync(liveDist)) {
      renameSync(liveDist, backupDist);
      backupCreated = true;
    }
    renameSync(stagedDist, liveDist);
    nextInstalled = true;
    return {
      liveDist,
      rollback() {
        if (!nextInstalled) return;
        removeDirectoryIfPresent(liveDist);
        if (backupCreated) renameSync(backupDist, liveDist);
        nextInstalled = false;
      },
      finalize() {
        if (backupCreated) removeDirectoryIfPresent(backupDist);
      },
    };
  } catch (error) {
    removeDirectoryIfPresent(stagedDist);
    if (backupCreated && !existsSync(liveDist) && existsSync(backupDist)) renameSync(backupDist, liveDist);
    throw error;
  }
}

export async function releaseSchematic({
  projectRoot = PROJECT_ROOT,
  config,
  assertSourceReady = assertPublishedSource,
  runCommand = runCheckedCommand,
  probeProduction = probeProductionDocument,
} = {}) {
  const source = resolve(projectRoot);
  const { deploymentHome, productionUrl } = validateReleaseConfig(config, { projectRoot: source });
  assertSourceReady(source);
  for (const [command, args] of REQUIRED_COMMANDS) runCommand(command, args, { cwd: source });

  const sourceDist = join(source, "dist");
  requireDirectory(sourceDist, "Built source dist");
  const installation = installArtifact({ sourceDist, deploymentHome });
  try {
    assertProductionDocument(await probeProduction(productionUrl), productionUrl);
    installation.finalize();
  } catch (error) {
    installation.rollback();
    throw error;
  }

  return { deploymentHome, productionUrl, installedArtifact: installation.liveDist };
}

function parseCliArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--config") {
    throw new Error("Usage: npm run release -- --config /absolute/path/schematic-release.json");
  }
  return { configPath: argv[1] };
}

async function main() {
  const { configPath } = parseCliArgs(process.argv.slice(2));
  const config = readReleaseConfig(configPath);
  const result = await releaseSchematic({ config });
  console.log(JSON.stringify(result, null, 2));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Release blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
