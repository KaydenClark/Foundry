import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  adoptFoundry,
  doctorFoundry,
  loadManifest,
  validateManifest,
} from "./foundry.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function git(cwd, args, options = {}) {
  return run("git", args, { ...options, cwd });
}

// Only installed Modules are cloned by the manifest, so only they need a
// fixture source repository. Native Halls (F-001/F-002/P-012/G-001) travel
// with the harness fixture copy itself — see copyHarnessFixture.
function createSourceRepository(root, component) {
  const source = join(root, component.id.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"));
  mkdirSync(source, { recursive: true });
  git(source, ["init", "--initial-branch", component.ref]);
  writeFileSync(join(source, "COMPONENT.txt"), `${component.id}\n`, "utf8");
  git(source, ["add", "."]);
  git(source, [
    "-c",
    "user.name=Foundry Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    `fixture ${component.id}`,
  ]);
  return source;
}

function copyHarnessFixture(destination) {
  cpSync(repositoryRoot, destination, {
    recursive: true,
    filter(source) {
      const rel = relative(repositoryRoot, source);
      if (!rel) return true;
      const first = rel.split(sep)[0];
      return ![".git", "Modules", ".worktrees"].includes(first);
    },
  });
  git(destination, ["init", "--initial-branch", "codex/test"]);
  git(destination, ["add", "."]);
  git(destination, [
    "-c",
    "user.name=Foundry Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture harness",
  ]);
}

function walkFiles(root, ignored = new Set([".git", "Modules", ".worktrees"])) {
  const files = [];
  for (const name of readdirSync(root)) {
    if (ignored.has(name)) continue;
    const absolute = join(root, name);
    if (statSync(absolute).isDirectory()) files.push(...walkFiles(absolute, ignored));
    else files.push(absolute);
  }
  return files;
}

function installedComponent(manifest, id) {
  const component = manifest.components.find((entry) => entry.id === id);
  assert.ok(component, `fixture expects installed-module component ${id}`);
  return component;
}

async function main() {
  const manifest = loadManifest(join(repositoryRoot, "manifest", "foundry.json"));
  assert.deepEqual(validateManifest(manifest), [], "production manifest is valid");
  assert.equal(manifest.components.length, 8, "four native Halls plus four installed Modules are declared");

  const nativeComponents = manifest.components.filter((component) => component.tier === "native-hall");
  const installedComponents = manifest.components.filter((component) => component.tier === "installed-module");
  assert.equal(nativeComponents.length, 4, "the Forge, the Assay, the Ward, and the Gatehouse are native Halls");
  assert.equal(installedComponents.length, 4, "OpenBrain, CIC, Slack, and Discord remain installed Modules");

  // TK-003 red/green: a native Hall validates with no remote; an installed
  // Module fails without one. Both directions, per S-024 Testing Seams.
  assert.ok(
    nativeComponents.every((component) => !("remote" in component)),
    "native Halls in the production manifest carry no remote",
  );
  const missingModuleRemote = structuredClone(manifest);
  delete installedComponent(missingModuleRemote, "P-010").remote;
  assert.match(
    validateManifest(missingModuleRemote).join("\n"),
    /remote must be a non-empty string/,
    "an installed Module missing remote fails validation",
  );
  const nativeWithRemote = structuredClone(manifest);
  nativeWithRemote.components.find((component) => component.id === "F-001").remote =
    "https://github.com/example/example.git";
  assert.match(
    validateManifest(nativeWithRemote).join("\n"),
    /native Hall components must not declare a remote/,
    "a native Hall declaring a remote fails validation",
  );
  const installedWithPath = structuredClone(manifest);
  installedComponent(installedWithPath, "P-010").path = "somewhere";
  assert.match(
    validateManifest(installedWithPath).join("\n"),
    /installed Module components must not declare a path/,
    "an installed Module declaring a native-Hall path fails validation",
  );
  const nativeMissingPath = structuredClone(manifest);
  delete nativeMissingPath.components.find((component) => component.id === "G-001").path;
  assert.match(
    validateManifest(nativeMissingPath).join("\n"),
    /path must be a safe relative path/,
    "a native Hall missing path fails validation",
  );

  const duplicate = structuredClone(manifest);
  duplicate.components[1].id = duplicate.components[0].id;
  assert.match(validateManifest(duplicate).join("\n"), /duplicate component id/);

  const traversal = structuredClone(manifest);
  installedComponent(traversal, "P-010").destination = "../outside";
  assert.match(validateManifest(traversal).join("\n"), /safe relative path/);

  const absolute = structuredClone(manifest);
  installedComponent(absolute, "P-010").destination = resolve(tmpdir(), "outside");
  assert.match(validateManifest(absolute).join("\n"), /safe relative path/);

  const credentialRemote = structuredClone(manifest);
  installedComponent(credentialRemote, "P-010").remote = "https://user:token@example.invalid/repository.git";
  assert.match(validateManifest(credentialRemote).join("\n"), /must not contain credentials/);

  const leakedBinding = structuredClone(manifest);
  leakedBinding.components[0].binding = { socketId: "K-001" };
  assert.match(validateManifest(leakedBinding).join("\n"), /instance binding data/);

  const scratch = mkdtempSync(join(tmpdir(), "foundry-harness-test-"));
  try {
    const instanceRoot = join(scratch, "instance");
    const harnessRoot = join(instanceRoot, "Foundry");
    const sourcesRoot = join(scratch, "sources");
    mkdirSync(instanceRoot, { recursive: true });
    mkdirSync(sourcesRoot, { recursive: true });
    copyHarnessFixture(harnessRoot);

    const instanceAlias = join(scratch, "instance-alias");
    symlinkSync(instanceRoot, instanceAlias, "dir");
    const harnessAlias = join(scratch, "harness-alias");
    symlinkSync(harnessRoot, harnessAlias, "dir");
    const aliasedCli = run("node", [join(harnessAlias, "tools", "foundry.mjs"), "validate-manifest"]);
    assert.match(aliasedCli.stdout, /Foundry manifest valid/, "CLI runs through a symlinked parent path");

    const sourceOverrides = Object.fromEntries(
      installedComponents.map((component) => [component.id, createSourceRepository(sourcesRoot, component)]),
    );

    const firstInstalled = installedComponents[0];
    const lastInstalled = installedComponents.at(-1);

    const markerFile = join(instanceRoot, ".foundry", "instance.json");
    mkdirSync(dirname(markerFile), { recursive: true });
    writeFileSync(
      markerFile,
      `${JSON.stringify({ schemaVersion: "1.0", harnessRoot: "Other Foundry" })}\n`,
      "utf8",
    );
    await assert.rejects(
      () =>
        adoptFoundry({
          harnessRoot,
          instanceRoot: instanceAlias,
          instanceName: "Cold Fixture",
          manifest,
          sourceOverrides,
        }),
      /instance marker points at/,
    );
    assert.equal(
      existsSync(join(harnessRoot, firstInstalled.destination)),
      false,
      "instance-state failures are detected before the first Module clone",
    );
    rmSync(markerFile);
    rmSync(join(instanceRoot, ".foundry"), { recursive: true, force: true });

    const escapedState = join(scratch, "escaped-state");
    mkdirSync(escapedState);
    symlinkSync(escapedState, join(instanceRoot, ".foundry"), "dir");
    await assert.rejects(
      () =>
        adoptFoundry({
          harnessRoot,
          instanceRoot: instanceAlias,
          instanceName: "Cold Fixture",
          manifest,
          sourceOverrides,
        }),
      /symbolic link/,
    );
    assert.equal(readdirSync(escapedState).length, 0, "instance state cannot escape through a symlink");
    assert.equal(existsSync(join(harnessRoot, firstInstalled.destination)), false);
    rmSync(join(instanceRoot, ".foundry"));
    rmSync(escapedState, { recursive: true });

    const escapedComponents = join(scratch, "escaped-components");
    mkdirSync(escapedComponents);
    symlinkSync(escapedComponents, join(harnessRoot, "Modules"), "dir");
    await assert.rejects(
      () =>
        adoptFoundry({
          harnessRoot,
          instanceRoot: instanceAlias,
          instanceName: "Cold Fixture",
          manifest,
          sourceOverrides,
        }),
      /symbolic link/,
    );
    assert.equal(readdirSync(escapedComponents).length, 0, "components cannot escape through a symlink");
    assert.equal(existsSync(join(harnessRoot, firstInstalled.destination)), false);
    rmSync(join(harnessRoot, "Modules"));
    rmSync(escapedComponents, { recursive: true });

    const badDestination = join(harnessRoot, lastInstalled.destination);
    mkdirSync(badDestination, { recursive: true });
    writeFileSync(join(badDestination, ".git"), "gitdir: missing\n", "utf8");
    await assert.rejects(
      () =>
        adoptFoundry({
          harnessRoot,
          instanceRoot: instanceAlias,
          instanceName: "Cold Fixture",
          manifest,
          sourceOverrides,
        }),
      /independent Git repository/,
    );
    assert.equal(
      existsSync(join(harnessRoot, firstInstalled.destination)),
      false,
      "component mismatches are detected before the first Module clone",
    );
    rmSync(join(harnessRoot, "Modules"), { recursive: true, force: true });

    const receipt = await adoptFoundry({
      harnessRoot,
      instanceRoot: instanceAlias,
      instanceName: "Cold Fixture",
      manifest,
      sourceOverrides,
    });

    assert.equal(receipt.components.length, 8, "receipt records all four native Halls and four installed Modules");
    const receiptNative = receipt.components.filter((component) => component.tier === "native-hall");
    const receiptInstalled = receipt.components.filter((component) => component.tier === "installed-module");
    assert.equal(receiptNative.length, 4);
    assert.ok(receiptNative.every((component) => component.action === "native" && component.path));
    assert.equal(receiptInstalled.length, 4);
    assert.ok(receiptInstalled.every((component) => /^[0-9a-f]{40}$/.test(component.commit)));
    assert.equal(receipt.manifest.schemaVersion, "1.0");
    assert.ok(existsSync(join(instanceRoot, "Wiki", "MEMORY.md")));
    assert.ok(existsSync(join(instanceRoot, ".foundry", "bindings.json")));
    assert.ok(existsSync(join(instanceRoot, ".foundry", "workflows.json")));
    assert.ok(existsSync(join(instanceRoot, ".foundry", "instance.json")));
    assert.ok(existsSync(join(instanceRoot, ".local", "foundry", "adoption-receipt.json")));

    const memory = readFileSync(join(instanceRoot, "Wiki", "MEMORY.md"), "utf8");
    assert.match(memory, /Cold Fixture Memory/);
    assert.doesNotMatch(
      memory,
      /(?<!\[)\[[A-Z][A-Z0-9_ -]+\](?!\])/,
      "adopted Wiki has no placeholders",
    );

    const bindings = JSON.parse(readFileSync(join(instanceRoot, ".foundry", "bindings.json"), "utf8"));
    assert.equal(bindings.instanceRoot, ".");
    assert.equal(bindings.harnessRoot, "Foundry");
    assert.ok(bindings.bindings.every((binding) => !binding.path?.startsWith(sep)));
    assert.equal(bindings.bindings.find((binding) => binding.socketId === "K-001").status, "active");
    assert.equal(bindings.bindings.find((binding) => binding.socketId === "K-002").status, "pending-contract");

    const workflows = JSON.parse(readFileSync(join(instanceRoot, ".foundry", "workflows.json"), "utf8"));
    assert.equal(workflows.workflows[0].enabled, false);
    assert.equal(workflows.workflows[0].policy, "Foundry/scheduler/AFK_POLICY.md");

    for (const component of installedComponents) {
      const destination = join(harnessRoot, component.destination);
      assert.ok(statSync(join(destination, ".git")).isDirectory(), `${component.id} is an independent clone`);
      assert.equal(git(destination, ["branch", "--show-current"]).stdout.trim(), component.ref);
      assert.equal(git(destination, ["remote", "get-url", "origin"]).stdout.trim(), sourceOverrides[component.id]);
    }
    for (const component of nativeComponents) {
      const location = join(harnessRoot, component.path);
      assert.ok(statSync(location).isDirectory(), `${component.id} native Hall is a tracked directory`);
      assert.equal(
        existsSync(join(location, ".git")),
        false,
        `${component.id} is not an independent clone; it is part of the harness Git root`,
      );
    }

    assert.equal(git(harnessRoot, ["status", "--porcelain", "--untracked-files=all"]).stdout, "");
    assert.equal(git(harnessRoot, ["ls-files", "--stage"]).stdout.includes("160000"), false);
    assert.equal(
      git(harnessRoot, ["check-ignore", "-q", `${firstInstalled.destination}/.git/HEAD`], { allowFailure: true })
        .status,
      0,
      "installed Module repositories are ignored",
    );
    assert.equal(
      git(harnessRoot, ["check-ignore", "-q", "forge/AGENTS.md"], { allowFailure: true }).status,
      1,
      "native Hall content is tracked, not ignored",
    );
    assert.equal(
      git(harnessRoot, ["check-ignore", "-q", ".worktrees/example/.git"], { allowFailure: true }).status,
      0,
      "registered worktree area is ignored",
    );

    const diagnosis = await doctorFoundry({ harnessRoot, instanceRoot, manifest });
    assert.equal(diagnosis.ok, true, diagnosis.errors.join("\n"));
    assert.match(diagnosis.contractValidation, /socket contract registry/);

    const healthyMarker = JSON.parse(readFileSync(markerFile, "utf8"));
    writeFileSync(markerFile, `${JSON.stringify({ ...healthyMarker, manifestDigest: "0".repeat(64) })}\n`);
    const staleMarkerDiagnosis = await doctorFoundry({ harnessRoot, instanceRoot, manifest });
    assert.match(staleMarkerDiagnosis.errors.join("\n"), /manifestDigest does not match/);
    writeFileSync(markerFile, `${JSON.stringify(healthyMarker, null, 2)}\n`);

    const secondReceipt = await adoptFoundry({
      harnessRoot,
      instanceRoot,
      instanceName: "Cold Fixture",
      manifest,
      sourceOverrides,
    });
    assert.ok(
      secondReceipt.components
        .filter((component) => component.tier === "installed-module")
        .every((component) => component.action === "reused"),
      "a second adopt reuses every installed Module clone",
    );
    assert.ok(
      secondReceipt.components
        .filter((component) => component.tier === "native-hall")
        .every((component) => component.action === "native"),
      "native Halls are always reported native, never cloned or reused",
    );

    const openBrain = installedComponent(manifest, "P-010");
    git(join(harnessRoot, openBrain.destination), [
      "-c",
      "user.name=Foundry Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "unreceipted drift",
    ]);
    const driftDiagnosis = await doctorFoundry({ harnessRoot, instanceRoot, manifest });
    assert.match(driftDiagnosis.errors.join("\n"), /P-010: installed commit does not match adoption receipt/);

    const slack = installedComponent(manifest, "M-002");
    git(join(harnessRoot, slack.destination), ["remote", "set-url", "origin", sourceOverrides["M-001"]]);
    await assert.rejects(
      () =>
        adoptFoundry({
          harnessRoot,
          instanceRoot,
          instanceName: "Cold Fixture",
          manifest,
          sourceOverrides,
        }),
      /origin mismatch/,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // A native Hall missing its required control docs fails the harness-only
  // doctor gate — proven in an isolated fixture with no instance root, so
  // detectInstanceRoot cannot mask the check by finding an unrelated instance.
  const isolatedScratch = mkdtempSync(join(tmpdir(), "foundry-native-hall-test-"));
  try {
    const isolatedHarness = join(isolatedScratch, "Foundry");
    copyHarnessFixture(isolatedHarness);
    rmSync(join(isolatedHarness, "audit-engine", "CLAUDE.md"));
    const incompleteDiagnosis = await doctorFoundry({ harnessRoot: isolatedHarness, manifest });
    assert.equal(incompleteDiagnosis.ok, false);
    assert.match(
      incompleteDiagnosis.errors.join("\n"),
      /F-002 native Hall at audit-engine is missing control docs: CLAUDE\.md/,
    );
  } finally {
    rmSync(isolatedScratch, { recursive: true, force: true });
  }

  const forbiddenPath = `${sep}Users${sep}${"kay" + "den"}`;
  const secretPattern = new RegExp(
    `(?:${["g", "h", "p", "_"].join("")}|${["github", "pat", "_"].join("_")}|` +
      `\\b${["s", "k", "-"].join("")}[A-Za-z0-9]|hooks\\.slack\\.com/services/[^\\s\"'])`,
  );
  for (const file of walkFiles(repositoryRoot)) {
    const content = readFileSync(file, "utf8");
    assert.equal(content.includes(forbiddenPath), false, `${relative(repositoryRoot, file)} is portable`);
    assert.equal(secretPattern.test(content), false, `${relative(repositoryRoot, file)} contains no secret-shaped value`);
  }

  console.log("ok - portable Foundry manifest, adoption, boundary, and doctor contracts passed");
}

await main();
