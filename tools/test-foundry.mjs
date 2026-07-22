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

function createSourceRepository(root, component) {
  const source = join(root, component.id.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"));
  mkdirSync(source, { recursive: true });
  git(source, ["init", "--initial-branch", component.ref]);
  writeFileSync(join(source, "COMPONENT.txt"), `${component.id}\n`, "utf8");
  if (component.id === "F-001") {
    mkdirSync(join(source, "tools", "socket-registry"), { recursive: true });
    writeFileSync(
      join(source, "tools", "socket-contract.mjs"),
      "if (!['validate', 'check-binding'].includes(process.argv[2])) process.exit(2); console.log('ok - fixture socket registry');\n",
      "utf8",
    );
    writeFileSync(
      join(source, "tools", "socket-registry", "registry.json"),
      JSON.stringify({ schemaVersion: "1.0", sockets: { "K-001": { socket: "recall" } } }, null, 2) + "\n",
      "utf8",
    );
  }
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
      return ![".git", "Sockets", "Modules", ".worktrees"].includes(first);
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

function walkFiles(root, ignored = new Set([".git", "Sockets", "Modules", ".worktrees"])) {
  const files = [];
  for (const name of readdirSync(root)) {
    if (ignored.has(name)) continue;
    const absolute = join(root, name);
    if (statSync(absolute).isDirectory()) files.push(...walkFiles(absolute, ignored));
    else files.push(absolute);
  }
  return files;
}

async function main() {
  const manifest = loadManifest(join(repositoryRoot, "manifest", "foundry.json"));
  assert.deepEqual(validateManifest(manifest), [], "production manifest is valid");
  assert.equal(manifest.components.length, 7, "all seven component repositories are declared");

  const duplicate = structuredClone(manifest);
  duplicate.components[1].id = duplicate.components[0].id;
  assert.match(validateManifest(duplicate).join("\n"), /duplicate component id/);

  const traversal = structuredClone(manifest);
  traversal.components[0].destination = "../outside";
  assert.match(validateManifest(traversal).join("\n"), /safe relative path/);

  const absolute = structuredClone(manifest);
  absolute.components[0].destination = resolve(tmpdir(), "outside");
  assert.match(validateManifest(absolute).join("\n"), /safe relative path/);

  const credentialRemote = structuredClone(manifest);
  credentialRemote.components[0].remote = "https://user:token@example.invalid/repository.git";
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

    const sourceOverrides = Object.fromEntries(
      manifest.components.map((component) => [
        component.id,
        createSourceRepository(sourcesRoot, component),
      ]),
    );

    const receipt = await adoptFoundry({
      harnessRoot,
      instanceRoot,
      instanceName: "Cold Fixture",
      manifest,
      sourceOverrides,
    });

    assert.equal(receipt.components.length, 7);
    assert.ok(receipt.components.every((component) => /^[0-9a-f]{40}$/.test(component.commit)));
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

    for (const component of manifest.components) {
      const destination = join(harnessRoot, component.destination);
      assert.ok(existsSync(join(destination, ".git")), `${component.id} is an independent clone`);
      assert.equal(git(destination, ["branch", "--show-current"]).stdout.trim(), component.ref);
      assert.equal(git(destination, ["remote", "get-url", "origin"]).stdout.trim(), sourceOverrides[component.id]);
    }

    assert.equal(git(harnessRoot, ["status", "--porcelain", "--untracked-files=all"]).stdout, "");
    assert.equal(git(harnessRoot, ["ls-files", "--stage"]).stdout.includes("160000"), false);
    assert.equal(
      git(harnessRoot, ["check-ignore", "-q", "Sockets/Forge/.git/HEAD"], { allowFailure: true }).status,
      0,
      "installed Socket repositories are ignored",
    );
    assert.equal(
      git(harnessRoot, ["check-ignore", "-q", ".worktrees/example/.git"], { allowFailure: true }).status,
      0,
      "registered worktree area is ignored",
    );

    const diagnosis = await doctorFoundry({ harnessRoot, instanceRoot, manifest });
    assert.equal(diagnosis.ok, true, diagnosis.errors.join("\n"));
    assert.match(diagnosis.contractValidation, /fixture socket registry/);

    const secondReceipt = await adoptFoundry({
      harnessRoot,
      instanceRoot,
      instanceName: "Cold Fixture",
      manifest,
      sourceOverrides,
    });
    assert.ok(secondReceipt.components.every((component) => component.action === "reused"));

    const slack = manifest.components.find((component) => component.id === "M-002");
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

  const forbiddenPath = `${sep}Users${sep}${"kay" + "den"}`;
  const secretPattern = new RegExp(
    `(?:${["g", "h", "p", "_"].join("")}|${["github", "pat", "_"].join("_")}|` +
      `${["s", "k", "-"].join("")}[A-Za-z0-9]|hooks\\.slack\\.com/services/[^\\s\"'])`,
  );
  for (const file of walkFiles(repositoryRoot)) {
    const content = readFileSync(file, "utf8");
    assert.equal(content.includes(forbiddenPath), false, `${relative(repositoryRoot, file)} is portable`);
    assert.equal(secretPattern.test(content), false, `${relative(repositoryRoot, file)} contains no secret-shaped value`);
  }

  console.log("ok - portable Foundry manifest, adoption, boundary, and doctor contracts passed");
}

await main();
