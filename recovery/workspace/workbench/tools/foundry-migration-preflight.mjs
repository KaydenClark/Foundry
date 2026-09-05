#!/usr/bin/env node
// HISTORICAL/RETIRED S-007 TK-008 migration fixture.
//
// This file preserves the topology and checks used to prove the completed
// S-007 migration. It is not a description of current Foundry topology and
// must not be used to plan another move. Current Canon is owned by S-034 and
// S-035: Halls are Foundry product source, Projects/<Module> are producer
// checkouts, and Foundry/Modules contains installed products.
//
// This tool is the executable half of the Foundry migration preflight/rollback
// contract (specs/S-007-servitor-foundry-architecture/TK-008-preflight-and-rollback-contract.md).
// It PERFORMS NO MIGRATION and NEVER MUTATES repositories, worktrees, symlinks,
// or launchd state. Its only write is the optional preflight rollback snapshot.
//
// Commands:
//   inventory   [--root P] [--json]                 Live inventory of the five
//                                                   Foundry-core repos, the
//                                                   instance repo, worktrees,
//                                                   launchd bindings, aliases.
//   preflight   [--root P] [--json] [--allow-dirty] Go/no-go gate before any
//               [--out DIR] [--no-snapshot]         physical move. Writes a
//                                                   rollback snapshot (refs +
//                                                   plist copies) on success
//                                                   unless --no-snapshot.
//   layout      --phase current|target|final        Pure filesystem topology
//               [--root P] [--json]                 check. "target" must fail
//                                                   against the old topology
//                                                   for the expected reasons.
//   stale-paths [--root P] [--json] [--phase pre|post] [--repo ID]
//                                                   Scan live consumers for
//                                                   old-path references. Phase
//                                                   "pre" (default) reports the
//                                                   worklist and exits 0;
//                                                   "post" fails on any hit.

import { execFileSync } from "node:child_process";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync,
  readlinkSync, statSync, writeFileSync
} from "node:fs";
import { homedir } from "node:os";

export function checkWorktreeGitdirPointer(worktreePath, retiredPaths = []) {
  const gitFile = join(worktreePath, ".git");
  const body = readFileSync(gitFile, "utf8").trim();
  const pointer = body.startsWith("gitdir: ") ? body.slice(8) : "";
  if (!pointer) return { ok: false, reason: "missing-gitdir-pointer" };
  return { ok: !retiredPaths.some((path) => pointer.includes(path)), pointer };
}
import { isAbsolute, join, relative } from "node:path";

export const FOUNDRY_MIGRATION_MANIFEST = {
  status: "historical-retired",
  supersededBy: "S-034/S-035",
  root: "/ABSOLUTE/WORKSPACE",
  worktreeRoot: "Foundry/.worktrees",
  launchAgentsDir: join(homedir(), "Library", "LaunchAgents"),
  // The five canonical Foundry-core repositories (Sockets + Modules families).
  // The WORKSPACE instance repo is tier 3 and does not move; it is inventoried
  // separately below.
  repos: [
    {
      id: "forge",
      name: "The Forge (LLM Workbench)",
      family: "Sockets",
      currentPath: "Forge",
      targetPath: "Foundry/Sockets/Forge",
      remote: "https://github.com/example/LLM_Workbench.git",
      worktreeSlug: "forge",
      legacyContainers: ["Workbench Factory-worktrees"],
      movedBy: "TK-010"
    },
    {
      id: "audit-engine",
      name: "Audit Engine",
      family: "Sockets",
      currentPath: "Audit Engine",
      targetPath: "Foundry/Sockets/Audit Engine",
      remote: "https://github.com/example/Audit-Engine.git",
      worktreeSlug: "audit-engine",
      legacyContainers: ["Audit Engine-worktrees"],
      movedBy: "TK-010"
    },
    {
      id: "pip",
      name: "Personal Intelligence Platform",
      family: "Sockets",
      currentPath: "Projects/Personal Intelligence Platform",
      targetPath: "Foundry/Sockets/Personal Intelligence Platform",
      remote: "https://github.com/example/personal-intelligence-platform.git",
      worktreeSlug: "personal-intelligence-platform",
      legacyContainers: [],
      movedBy: "TK-010"
    },
    {
      id: "openbrain",
      name: "OpenBrain",
      family: "Modules",
      currentPath: "Foundry/OpenBrain",
      targetPath: "Foundry/Modules/OpenBrain",
      remote: "https://github.com/example/OpenBrain.git",
      worktreeSlug: "openbrain",
      legacyContainers: [],
      movedBy: "TK-011"
    },
    {
      id: "cic",
      name: "Command Information Center",
      family: "Modules",
      currentPath: "Foundry/Command Information Center",
      targetPath: "Foundry/Modules/Command Information Center",
      remote: "https://github.com/example/command-information-center.git",
      worktreeSlug: "cic",
      legacyContainers: ["Foundry/CIC-worktrees"],
      // TK-011: untracked runtime/diary state that must survive the move.
      preserveUntracked: ["SPEC_DIARY.md", "MEMORY.md"],
      movedBy: "TK-011"
    }
  ],
  instance: {
    id: "gptos-instance",
    name: "WORKSPACE instance (thin mirror)",
    path: ".",
    remote: "https://github.com/example/workspace.git"
  },
  // Compatibility aliases. Allowed (if resolving) through phase "target";
  // all must be retired for phase "final" (TK-012). After TK-010 the old
  // repo currentPaths themselves may exist as symlink aliases into Foundry/.
  aliases: [
    { link: "Workbench Factory", retiredBy: "TK-012" },
    { link: "workbench templates", retiredBy: "TK-012" }
  ],
  // launchd jobs whose plists embed absolute paths bound to moving repos.
  launchdLabels: ["com.kayden.cic", "com.kayden.openbrain.codex-sync"],
  // Old-path patterns per repo for the stale-live-path scan. Patterns are
  // written so the NEW canonical paths (Foundry/Sockets/..., Foundry/Modules/...)
  // never match. Plain-prose mentions ("the Forge") are deliberately not
  // matched; only path-shaped references are.
  stalePathPatterns: [
    { repoId: "forge", pattern: "/ABSOLUTE/WORKSPACE/Forge(?![\\w-])" },
    { repoId: "forge", pattern: "(?<!Sockets/)(?<![\\w/-])Forge/" },
    { repoId: "forge", pattern: "Workbench Factory-worktrees" },
    { repoId: "audit-engine", pattern: "WORKSPACE/Audit Engine(?![\\w-])" },
    { repoId: "audit-engine", pattern: "Audit Engine-worktrees" },
    { repoId: "pip", pattern: "(?<!\\[\\[)Projects/Personal Intelligence Platform" },
    { repoId: "openbrain", pattern: "Foundry/OpenBrain" },
    { repoId: "cic", pattern: "Foundry/Command Information Center" },
    { repoId: "cic", pattern: "Foundry/CIC-worktrees" }
  ],
  // Consumers scanned for stale live paths. Relative to root unless absolute.
  // specs/ is append-only evidence and is exempt by design; Wiki/Archive/ is
  // history. Per-repo internals are covered by the owning repo's runbook at
  // migration time (they move with the repo).
  consumers: [
    "AGENTS.md", "BLUEPRINT.md", "CLAUDE.md", "LEXICON.md", "README.md",
    "RUNBOOK.md", "TASKBOARD.md", "WORKBENCH_FEEDBACK.md", "HARNESS_FEEDBACK.md",
    "Roles", "tools", "Scheduled", "Projects/INDEX.md",
    "Wiki/MEMORY.md", "Wiki/AGENTS.md", "Wiki/SCHEMA.md", "Wiki/Machine", "Wiki/Projects"
  ],
  consumerExtensions: [".md", ".mjs", ".js", ".json", ".sh", ".plist", ".yaml", ".yml", ".txt"],
  consumerExcludes: ["node_modules", ".git", "logs", ".obsidian"]
};

const M = FOUNDRY_MIGRATION_MANIFEST;

function git(repoDir, args) {
  return execFileSync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tryGit(repoDir, args) {
  try {
    return git(repoDir, args);
  } catch {
    return null;
  }
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function isRealDir(p) {
  try {
    return !lstatSync(p).isSymbolicLink() && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isGitCheckout(p) {
  return existsSync(join(p, ".git"));
}

function dirEntries(p) {
  try {
    return readdirSync(p).filter((n) => n !== ".DS_Store");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// layout: pure filesystem topology check. No git, no launchd, no mutation.
// Phases:
//   current — the documented pre-migration topology (guards drift until go).
//   target  — the approved post-migration topology; compatibility aliases and
//             symlinked old paths are allowed. MUST fail today.
//   final   — target plus every compatibility alias retired (TK-012).
export function checkLayout(rootDir, phase) {
  if (!["current", "target", "final"].includes(phase)) {
    throw new Error(`unknown layout phase: ${phase}`);
  }
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });

  for (const repo of M.repos) {
    const current = join(rootDir, repo.currentPath);
    const target = join(rootDir, repo.targetPath);
    if (phase === "current") {
      const alreadyMovedByEarlierTicket = repo.movedBy === "TK-010"
        && isRealDir(target)
        && isGitCheckout(target)
        && !isRealDir(current);
      if (!alreadyMovedByEarlierTicket && (!isRealDir(current) || !isGitCheckout(current))) {
        fail(`current-checkout-missing:${repo.id}`, `${repo.currentPath} is not a real git checkout`);
      }
      if (!alreadyMovedByEarlierTicket && existsSync(target)) {
        fail(`target-path-premature:${repo.id}`, `${repo.targetPath} already exists before the migration`);
      }
    } else {
      if (!isRealDir(target) || !isGitCheckout(target)) {
        fail(`target-checkout-missing:${repo.id}`, `${repo.targetPath} is not a real git checkout`);
      }
      if (isRealDir(current)) {
        fail(`current-path-still-real:${repo.id}`, `${repo.currentPath} is still a real directory (must be gone or a symlink alias)`);
      }
      if (phase === "final" && isSymlink(current)) {
        fail(`alias-still-present:${repo.currentPath}`, `${repo.currentPath} compatibility symlink not retired`);
      }
      for (const container of repo.legacyContainers) {
        const entries = dirEntries(join(rootDir, container));
        if (entries && entries.length > 0) {
          fail(`legacy-container-not-empty:${container}`, `${container} still holds: ${entries.join(", ")}`);
        }
      }
    }
  }

  const wtRoot = join(rootDir, M.worktreeRoot);
  if (phase === "current") {
    const socketsAlreadyMoved = M.repos
      .filter((repo) => repo.movedBy === "TK-010")
      .every((repo) => isRealDir(join(rootDir, repo.targetPath)) && isGitCheckout(join(rootDir, repo.targetPath)));
    if (existsSync(wtRoot) && !socketsAlreadyMoved) {
      fail("worktree-root-premature", `${M.worktreeRoot} already exists before the migration`);
    }
  } else if (!isRealDir(wtRoot)) {
    fail("worktree-root-missing", `${M.worktreeRoot} does not exist`);
  }

  for (const alias of M.aliases) {
    const p = join(rootDir, alias.link);
    if (phase === "final") {
      if (existsSync(p) || isSymlink(p)) {
        fail(`alias-still-present:${alias.link}`, `${alias.link} not retired (${alias.retiredBy})`);
      }
    } else if (isSymlink(p)) {
      // Alias may exist in current/target phases, but must resolve if present.
      try {
        statSync(p);
      } catch {
        fail(`alias-dangling:${alias.link}`, `${alias.link} is a dangling symlink`);
      }
    }
  }

  return { phase, root: rootDir, ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// stale-paths: scan the named consumers for old-path references.
export function scanStalePaths(rootDir, { launchAgentsDir, repoIds } = {}) {
  const selectedRepoIds = repoIds ? new Set(repoIds) : null;
  const patterns = M.stalePathPatterns.map((p) => ({
    repoId: p.repoId,
    regex: new RegExp(p.pattern)
  }));
  const files = [];

  const collect = (p) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      const base = p.split("/").pop();
      if (M.consumerExcludes.includes(base)) return;
      for (const entry of dirEntries(p) ?? []) collect(join(p, entry));
    } else if (M.consumerExtensions.some((ext) => p.endsWith(ext))) {
      files.push(p);
    }
  };

  for (const consumer of M.consumers) {
    collect(isAbsolute(consumer) ? consumer : join(rootDir, consumer));
  }
  const agentsDir = launchAgentsDir ?? M.launchAgentsDir;
  for (const entry of dirEntries(agentsDir) ?? []) {
    if (entry.startsWith("com.kayden.") && entry.endsWith(".plist")) files.push(join(agentsDir, entry));
  }

  const hits = [];
  for (const file of files) {
    // The scanner must not flag its own pattern/manifest definitions or tests.
    if (file.endsWith("foundry-migration-preflight.mjs")) continue;
    if (file.endsWith("test-foundry-migration-preflight.mjs")) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    lines.forEach((line, idx) => {
      for (const { repoId, regex } of patterns) {
        if (selectedRepoIds && !selectedRepoIds.has(repoId)) continue;
        if (regex.test(line)) {
          hits.push({
            repoId,
            file: isAbsolute(file) && file.startsWith(rootDir + "/") ? relative(rootDir, file) : file,
            line: idx + 1,
            text: line.trim().slice(0, 200)
          });
        }
      }
    });
  }
  return { root: rootDir, scannedFiles: files.length, repoIds: repoIds ?? null, hits };
}

// ---------------------------------------------------------------------------
// inventory: live, read-only state of every repo, worktree, binding, alias.
function repoInventory(rootDir, repo) {
  const currentPath = join(rootDir, repo.currentPath);
  const targetPath = join(rootDir, repo.targetPath);
  // TK-011 runs after the approved TK-010 Sockets cutover. Earlier-family
  // primaries are therefore inventoried at their target rather than treated as
  // missing or as occupied future destinations.
  const path = repo.movedBy === "TK-010" && !isGitCheckout(currentPath) && isGitCheckout(targetPath)
    ? targetPath
    : currentPath;
  if (!isGitCheckout(path)) return { id: repo.id, path, exists: false };
  const branch = tryGit(path, ["branch", "--show-current"]) || "(detached)";
  const head = tryGit(path, ["rev-parse", "HEAD"]);
  const upstream = tryGit(path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const upstreamSha = upstream ? tryGit(path, ["rev-parse", "@{upstream}"]) : null;
  const counts = upstream ? tryGit(path, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]) : null;
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const status = tryGit(path, ["status", "--porcelain"]) ?? "";
  const statusLines = status ? status.split("\n") : [];
  const worktrees = [];
  const porcelain = tryGit(path, ["worktree", "list", "--porcelain"]) ?? "";
  let cur = null;
  for (const line of `${porcelain}\n`.split("\n")) {
    if (line.startsWith("worktree ")) cur = { path: line.slice(9), branch: null, sha: null, locked: false, prunable: false };
    else if (line.startsWith("HEAD ") && cur) cur.sha = line.slice(5);
    else if (line.startsWith("branch ") && cur) cur.branch = line.slice(7).replace("refs/heads/", "");
    else if (line.startsWith("locked") && cur) cur.locked = true;
    else if (line.startsWith("prunable") && cur) cur.prunable = true;
    else if (line === "" && cur) {
      worktrees.push(cur);
      cur = null;
    }
  }
  return {
    id: repo.id,
    name: repo.name,
    family: repo.family,
    path,
    targetPath,
    exists: true,
    remote: tryGit(path, ["remote", "get-url", "origin"]),
    expectedRemote: repo.remote,
    branch,
    head,
    upstream,
    upstreamSha,
    ahead,
    behind,
    dirtyCount: statusLines.filter((l) => !l.startsWith("??")).length,
    untracked: statusLines.filter((l) => l.startsWith("??")).map((l) => l.slice(3)),
    worktrees
  };
}

export function buildInventory(rootDir, { launchAgentsDir } = {}) {
  const agentsDir = launchAgentsDir ?? M.launchAgentsDir;
  const launchd = [];
  for (const label of M.launchdLabels) {
    const plist = join(agentsDir, `${label}.plist`);
    let embedded = [];
    if (existsSync(plist)) {
      const text = readFileSync(plist, "utf8");
      embedded = [...new Set(text.match(/\/Users\/kayden\/WORKSPACE[^<"]*/g) ?? [])];
    }
    launchd.push({ label, plist, exists: existsSync(plist), embeddedPaths: embedded });
  }
  const aliases = [];
  for (const alias of M.aliases) {
    const p = join(rootDir, alias.link);
    aliases.push({
      link: alias.link,
      isSymlink: isSymlink(p),
      linkTarget: isSymlink(p) ? readlinkSync(p) : null,
      resolves: existsSync(p),
      retiredBy: alias.retiredBy
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    root: rootDir,
    repos: M.repos.map((repo) => repoInventory(rootDir, repo)),
    instance: repoInventory(rootDir, { id: M.instance.id, name: M.instance.name, family: "instance", currentPath: M.instance.path, targetPath: M.instance.path, remote: M.instance.remote }),
    launchd,
    aliases
  };
}

// ---------------------------------------------------------------------------
// preflight: the go/no-go gate the future migration must pass before any move.
export function runPreflight(rootDir, { allowDirty = false, launchAgentsDir, snapshotDir, writeSnapshot = true } = {}) {
  const inv = buildInventory(rootDir, { launchAgentsDir });
  const failures = [];
  const warnings = [];
  const fail = (code, detail) => failures.push({ code, detail });
  const warn = (code, detail) => warnings.push({ code, detail });

  const rows = [...inv.repos, inv.instance];
  for (const repo of rows) {
    const manifestRepo = M.repos.find((r) => r.id === repo.id);
    if (!repo.exists) {
      fail(`repo-missing:${repo.id}`, `${repo.path} is not a git checkout`);
      continue;
    }
    if (repo.remote !== repo.expectedRemote) {
      fail(`remote-mismatch:${repo.id}`, `origin is ${repo.remote}, expected ${repo.expectedRemote}`);
    }
    if (!repo.upstream) {
      fail(`no-upstream:${repo.id}`, `${repo.branch} has no upstream; no remote recovery ref`);
    } else if (repo.ahead > 0) {
      fail(`unpushed-commits:${repo.id}`, `${repo.branch} is ahead of ${repo.upstream} by ${repo.ahead}; push before migrating`);
    }
    if (repo.dirtyCount > 0) {
      (allowDirty ? warn : fail)(`dirty-tree:${repo.id}`, `${repo.dirtyCount} modified/staged files; checkpoint before migrating`);
    }
    const preserve = manifestRepo?.preserveUntracked ?? [];
    const unexpected = repo.untracked.filter((f) => !preserve.includes(f));
    if (unexpected.length > 0) {
      (allowDirty ? warn : fail)(`untracked-files:${repo.id}`, `untracked: ${unexpected.join(", ")}`);
    }
    for (const f of preserve) {
      if (repo.untracked.includes(f)) {
        warn(`preserve-untracked:${repo.id}`, `${f} is untracked and MUST be durably preserved through the move (TK-011)`);
      }
    }
    for (const wt of repo.worktrees) {
      if (wt.path === repo.path) continue;
      if (wt.prunable) {
        fail(`worktree-prunable:${repo.id}`, `${wt.path} is prunable; clean with git worktree remove/prune first`);
        continue;
      }
      if (!existsSync(wt.path)) {
        fail(`worktree-missing:${repo.id}`, `${wt.path} is registered but absent`);
        continue;
      }
      if (wt.locked) warn(`worktree-locked:${repo.id}`, `${wt.path} is locked (likely a live agent); must be released before its repo moves`);
      if (wt.branch) {
        const counts = tryGit(wt.path, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
        if (counts === null) {
          fail(`worktree-no-upstream:${repo.id}`, `${wt.path} (${wt.branch}) has no upstream recovery ref`);
        } else {
          const ahead = Number(counts.split(/\s+/)[1]);
          if (ahead > 0) fail(`worktree-unpushed:${repo.id}`, `${wt.path} (${wt.branch}) ahead by ${ahead}; push before migrating`);
        }
      } else {
        warn(`worktree-detached:${repo.id}`, `${wt.path} is detached at ${wt.sha}; record and verify remote reachability manually`);
      }
    }
  }

  for (const job of inv.launchd) {
    if (!job.exists) {
      fail(`launchd-plist-missing:${job.label}`, `${job.plist} not found`);
      continue;
    }
    try {
      execFileSync("plutil", ["-lint", job.plist], { stdio: "ignore" });
    } catch {
      fail(`launchd-plist-invalid:${job.label}`, `${job.plist} failed plutil -lint`);
    }
    for (const p of job.embeddedPaths) {
      if (!existsSync(p)) warn(`launchd-path-dead:${job.label}`, `${p} referenced but absent (log paths may be created on demand)`);
    }
  }

  for (const alias of inv.aliases) {
    if (alias.isSymlink && !alias.resolves) fail(`alias-dangling:${alias.link}`, `${alias.link} does not resolve`);
  }

  // Pre-move guard: only this ticket's destinations must be empty. Earlier
  // ticket destinations are already canonical primaries at this point.
  for (const repo of M.repos) {
    if (repo.movedBy === "TK-010") continue;
    const target = join(rootDir, repo.targetPath);
    const entries = dirEntries(target);
    if (entries && entries.length > 0) fail(`target-not-empty:${repo.id}`, `${repo.targetPath} already exists and is not empty`);
  }

  let snapshotPath = null;
  if (writeSnapshot && failures.length === 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = snapshotDir ?? join(rootDir, ".local", "foundry-migration", stamp);
    mkdirSync(dir, { recursive: true });
    for (const job of inv.launchd) {
      if (job.exists) copyFileSync(job.plist, join(dir, `${job.label}.plist`));
    }
    snapshotPath = join(dir, "preflight-snapshot.json");
    writeFileSync(snapshotPath, `${JSON.stringify({ inventory: inv, warnings }, null, 2)}\n`);
  }

  return { root: rootDir, ok: failures.length === 0, failures, warnings, snapshotPath, inventory: inv };
}

// ---------------------------------------------------------------------------
// CLI
function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--historical") options.historical = true;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--no-snapshot") options.writeSnapshot = false;
    else if (arg === "--root") options.root = argv[++i];
    else if (arg === "--phase") options.phase = argv[++i];
    else if (arg === "--out") options.snapshotDir = argv[++i];
    else if (arg === "--repo") (options.repoIds ??= []).push(argv[++i]);
    else if (arg === "--launch-agents-dir") options.launchAgentsDir = argv[++i];
    else options._.push(arg);
  }
  return options;
}

function printFailures(kind, items) {
  for (const item of items) console.error(`${kind} ${item.code}: ${item.detail}`);
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedDirectly && !process.argv.includes("--historical")) {
  console.error("error - historical-retired S-007 migration fixture; current topology is owned by S-034/S-035. Pass --historical only to reproduce archived S-007 evidence.");
  process.exitCode = 2;
} else if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  const root = options.root ?? M.root;
  try {
    if (command === "inventory") {
      const inv = buildInventory(root, options);
      console.log(JSON.stringify(inv, null, options.json ? 2 : 2));
    } else if (command === "preflight") {
      const result = runPreflight(root, options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        printFailures("FAIL", result.failures);
        for (const w of result.warnings) console.error(`warn ${w.code}: ${w.detail}`);
        if (result.snapshotPath) console.log(`snapshot: ${result.snapshotPath}`);
        console.log(result.ok ? "ok - preflight passed" : `error - preflight failed (${result.failures.length} failures)`);
      }
      process.exitCode = result.ok ? 0 : 1;
    } else if (command === "layout") {
      const result = checkLayout(root, options.phase ?? "current");
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        printFailures("FAIL", result.failures);
        console.log(result.ok ? `ok - layout ${result.phase} passed` : `error - layout ${result.phase} failed (${result.failures.length} failures)`);
      }
      process.exitCode = result.ok ? 0 : 1;
    } else if (command === "stale-paths") {
      const phase = options.phase ?? "pre";
      const result = scanStalePaths(root, options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        for (const hit of result.hits) console.log(`${hit.file}:${hit.line} [${hit.repoId}] ${hit.text}`);
        console.log(`${result.hits.length} stale-path reference(s) across ${result.scannedFiles} scanned files`);
      }
      process.exitCode = phase === "post" && result.hits.length > 0 ? 1 : 0;
    } else {
      console.error("usage: foundry-migration-preflight.mjs --historical inventory|preflight|layout|stale-paths [--root P] [--phase current|target|final|pre|post] [--json] [--allow-dirty] [--out DIR] [--no-snapshot] [--launch-agents-dir P]");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`error - ${error.message}`);
    process.exitCode = 1;
  }
}
