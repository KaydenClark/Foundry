#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lanePath } from "./workspace-paths.mjs";

// The canonical WORKSPACE root is a fixed absolute path, not the invoking
// script's own directory. A registered git worktree (e.g.
// `.worktrees/<name>`) checks out this same script at a different physical
// location, but the Wiki registry it reads always records canonical absolute
// paths under `/ABSOLUTE/WORKSPACE/...`. Deriving the root from
// `import.meta.url` would silently resolve to the worktree path instead and
// cause every real registry row to fail its prefix match. This mirrors the
// established fixed-canonical-root convention already used by
// `tools/vault-links.mjs`, `tools/foundry-migration-preflight.mjs`,
// `tools/id-registry.mjs`; Foundry Captain engines instead receive their
// instance root through thin root adapters.
// `--root PATH` overrides it for isolated testing.
export const CANONICAL_ROOT = "/ABSOLUTE/WORKSPACE";
const defaultRoot = CANONICAL_ROOT;
const requiredControls = [
  "AGENTS.md",
  "BLUEPRINT.md",
  "CLAUDE.md",
  "README.md",
  "RUNBOOK.md",
  "TASKBOARD.md",
];
const systemComponents = new Set(["Audit Engine"]);

function parseRegistry(root) {
  const registryPath = join(lanePath(root, "wiki"), "Machine", "Project Source Registry.md");
  const body = readFileSync(registryPath, "utf8");
  const sectionHeading = /^## Projects[ \t]*$/m.exec(body);
  const registryHeading = /^# Project Source Registry[ \t]*$/m.exec(body);
  if (!sectionHeading && !registryHeading) throw new Error("Project registry is missing its Projects section.");
  const heading = sectionHeading || registryHeading;
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^## [^\n]+/m);
  const projectSection = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
  const entries = [];
  const seenIds = new Set();

  for (const line of projectSection.split("\n")) {
    if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells[0] === "Project ID") continue;
    if (cells.length !== 4) throw new Error(`Malformed project registry row: ${line.trim()}`);
    const [id, name, pathCell, context] = cells;
    if (!/^P-\d{3}$/.test(id)) throw new Error(`Invalid project ID: ${id || "(missing)"}`);
    if (seenIds.has(id)) throw new Error(`Duplicate project ID: ${id}`);
    const projectPath = pathCell.match(/^`([^`]+)`$/)?.[1];
    if (!name || !projectPath || !context) throw new Error(`Malformed project registry row for ${id}.`);
    seenIds.add(id);
    entries.push({ id, name, path: projectPath, context });
  }

  if (!entries.length) throw new Error("Project registry contains no canonical projects.");
  return entries;
}

function parseFoundryModules(root) {
  const registryPath = join(lanePath(root, "wiki"), "Machine", "Project Source Registry.md");
  const body = readFileSync(registryPath, "utf8");
  const heading = /^### Foundry Modules[ \t]*$/m.exec(body);
  if (!heading) return [];
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^#{1,3} [^\n]+/m);
  const section = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
  const entries = [];
  const seenIds = new Set();

  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells[0] === "ID") continue;
    if (cells.length !== 4) throw new Error(`Malformed Foundry module row: ${line.trim()}`);
    const [id, name, pathCell, status] = cells;
    if (!/^M-\d{3}$/.test(id)) throw new Error(`Invalid Foundry module ID: ${id || "(missing)"}`);
    if (seenIds.has(id)) throw new Error(`Duplicate Foundry module ID: ${id}`);
    const modulePath = pathCell.match(/^`([^`]+)`$/)?.[1];
    if (!name || !modulePath || !status) throw new Error(`Malformed Foundry module row for ${id}.`);
    seenIds.add(id);
    entries.push({ id, name, path: modulePath, context: "Root BLUEPRINT.md" });
  }

  return entries;
}

function parseActivePortfolio(root, registryEntries) {
  const registryPath = join(lanePath(root, "wiki"), "Machine", "Project Source Registry.md");
  const body = readFileSync(registryPath, "utf8");
  const heading = /^## Active Portfolio[ \t]*$/m.exec(body);
  if (!heading) throw new Error("Project registry is missing its Active Portfolio section.");
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^## [^\n]+/m);
  const section = nextHeading >= 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
  const projectsById = new Map(registryEntries.map((entry) => [entry.id, entry]));
  const entries = [];
  const seenLanes = new Set();

  for (const line of section.split("\n")) {
    if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    if (cells[0] === "Lane") continue;
    if (cells.length !== 5) throw new Error(`Malformed active portfolio row: ${line.trim()}`);
    const [lane, owner, pathCell, repositories, notes] = cells;
    const sourcePath = pathCell.match(/^`([^`]+)`$/)?.[1];
    if (!lane || !owner || !sourcePath || !repositories || !notes) {
      throw new Error(`Malformed active portfolio row for ${lane || "(missing lane)"}.`);
    }
    if (seenLanes.has(lane)) throw new Error(`Duplicate active portfolio lane: ${lane}`);
    if (owner !== "system function") {
      const project = projectsById.get(owner);
      if (!project) throw new Error(`Unknown active portfolio owner: ${owner}`);
      if (project.path !== sourcePath) {
        throw new Error(`Active portfolio path does not match registry for ${owner}.`);
      }
    }
    if (!/`[^`]+\/[^`]+`/.test(repositories)) {
      throw new Error(`Active portfolio repositories are malformed for ${lane}.`);
    }
    seenLanes.add(lane);
    entries.push({ lane, owner, path: sourcePath, repositories, notes });
  }

  if (!entries.length) throw new Error("Active Portfolio contains no enrolled lanes.");
  return entries;
}

function originUrl(projectPath) {
  const configPath = join(projectPath, ".git", "config");
  if (!existsSync(configPath)) return "missing remote";
  const body = readFileSync(configPath, "utf8");
  const section = body.match(/\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/);
  const url = section?.[1].match(/^\s*url\s*=\s*(.+)$/m)?.[1]?.trim();
  if (!url) return "missing origin";
  return url.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function classifyDirectChildren(root, registeredPaths) {
  const projectsDir = join(root, "Projects");
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== ".git")
    .map((entry) => {
      const path = join(projectsDir, entry.name);
      if (registeredPaths.has(path)) return null;
      const gitPath = join(path, ".git");
      let reason = "not in canonical registry; no top-level repository";
      if (existsSync(gitPath)) {
        reason = lstatSync(gitPath).isFile()
          ? "registered worktree or linked checkout; not canonical"
          : "repository is not enrolled in the canonical registry";
      }
      return { name: entry.name, path, reason };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function workspaceRelativePath(entryPath, root, canonicalRoot) {
  for (const base of [root, canonicalRoot]) {
    const candidate = relative(base, entryPath);
    if (candidate && !candidate.startsWith("..") && !isAbsolute(candidate)) return candidate;
  }
  return null;
}

function validationPath(entryPath, workspacePath, root, canonicalRoot) {
  if (!workspacePath || root === canonicalRoot || entryPath.startsWith(`${root}/`)) return entryPath;
  if (workspacePath.startsWith("Foundry/Modules/") || workspacePath.startsWith("Projects/")) {
    return entryPath;
  }
  return join(root, workspacePath);
}

export function buildProjectIndex(root = defaultRoot, { canonicalRoot = CANONICAL_ROOT } = {}) {
  const registryEntries = [...parseRegistry(root), ...parseFoundryModules(root)];
  const activePortfolio = parseActivePortfolio(root, registryEntries);
  const canonical = [];
  const foundry = [];
  const findings = [];

  for (const entry of registryEntries) {
    const workspacePath = workspaceRelativePath(entry.path, root, canonicalRoot);
    const isProject = workspacePath?.startsWith("Projects/");
    const isFoundry = workspacePath?.startsWith("Foundry/");
    if (!isProject && !isFoundry) continue;
    if (isProject && systemComponents.has(entry.name)) {
      findings.push({
        name: entry.name,
        path: entry.path,
        reason: "WORKSPACE system component awaiting top-level promotion",
      });
      continue;
    }

    const checkedPath = validationPath(entry.path, workspacePath, root, canonicalRoot);
    const missing = requiredControls.filter((file) => !existsSync(join(checkedPath, file)));
    const repository = existsSync(join(checkedPath, ".git"));
    const pathExists = existsSync(checkedPath);
    const target = isFoundry ? foundry : canonical;
    target.push({
      ...entry,
      remote: repository ? originUrl(checkedPath) : "missing repository",
      controls: missing.length === 0 ? "current surface present" : `missing ${missing.join(", ")}`,
    });
    if (!pathExists || !repository || missing.length > 0) {
      findings.push({
        name: entry.name,
        path: entry.path,
        reason: !pathExists
          ? "canonical path missing"
          : !repository
            ? "canonical path is not a repository"
            : `control surface incomplete: ${missing.join(", ")}`,
      });
    }
  }

  const registeredPaths = new Set(registryEntries.map((entry) => {
    const workspacePath = workspaceRelativePath(entry.path, root, canonicalRoot);
    // classifyDirectChildren enumerates the evaluated root. Normalize registry
    // paths into that same namespace even when Canon records canonical absolute
    // paths and generation runs from a registered worktree.
    return workspacePath ? join(root, workspacePath) : entry.path;
  }));
  findings.push(...classifyDirectChildren(root, registeredPaths));
  canonical.sort((a, b) => a.name.localeCompare(b.name));
  foundry.sort((a, b) => a.name.localeCompare(b.name));
  findings.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    "# Project Routing Index",
    "",
    "> Generated; do not hand-edit. Run `node tools/project-index.mjs` from the WORKSPACE root.",
    "",
    "This is a routing surface for Foundry components and canonical project repositories.",
    "It intentionally contains no branches, ticket state, priorities, proof, or runtime",
    "health. Read the nearest controls after entering a canonical source path.",
    "",
    "Source: `Wiki/Machine/Project Source Registry.md`, validated against the live",
    "workspace. The curated registry owns enrollment; this file is its generated view.",
    "",
    "## Active Portfolio Enrollment",
    "",
    "This stable enrollment records the Workbench-only lane plus dormant recovery",
    "sources declared by the owner. It never implies runtime or live ticket state.",
    "",
    "| Lane | Registry owner | Canonical source | GitHub repositories | Notes |",
    "|---|---|---|---|---|",
    ...activePortfolio.map((entry) =>
      `| ${escapeCell(entry.lane)} | ${escapeCell(entry.owner)} | \`${escapeCell(entry.path)}\` | ${entry.repositories} | ${escapeCell(entry.notes)} |`,
    ),
    "",
    "## Foundry Components",
    "",
    "These preserved Foundry sources keep their permanent canonical IDs for recovery.",
    "Source presence does not imply an installed component or active Foundry runtime.",
    "",
    "| ID | Component | Canonical source | Remote | Controls | Stable context |",
    "|---|---|---|---|---|---|",
    ...foundry.map((entry) =>
      `| ${escapeCell(entry.id)} | ${escapeCell(entry.name)} | \`${escapeCell(entry.path)}\` | ${escapeCell(entry.remote)} | ${escapeCell(entry.controls)} | ${entry.context} |`,
    ),
    "",
    "## Canonical Project Repositories",
    "",
    "| Project ID | Project | Canonical source | Remote | Controls | Stable context |",
    "|---|---|---|---|---|---|",
    ...canonical.map((entry) =>
      `| ${escapeCell(entry.id)} | ${escapeCell(entry.name)} | \`${escapeCell(entry.path)}\` | ${escapeCell(entry.remote)} | ${escapeCell(entry.controls)} | ${entry.context} |`,
    ),
    "",
    "## Non-Canonical Or Noncompliant Entries",
    "",
    "These findings are routing warnings. Flag them for the owner; do not move or delete a",
    "canonical root automatically.",
    "",
    "| Entry | Path | Finding |",
    "|---|---|---|",
    ...findings.map((entry) =>
      `| ${escapeCell(entry.name)} | \`${escapeCell(entry.path)}\` | ${escapeCell(entry.reason)} |`,
    ),
    "",
  ];

  return lines.join("\n");
}

export function writeProjectIndex(root = defaultRoot) {
  const outputPath = join(root, "Projects", "INDEX.md");
  writeFileSync(outputPath, buildProjectIndex(root), "utf8");
  return outputPath;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const check = process.argv.includes("--check");
  const rootFlagIndex = process.argv.indexOf("--root");
  const root = rootFlagIndex !== -1 && process.argv[rootFlagIndex + 1]
    ? resolve(process.argv[rootFlagIndex + 1])
    : defaultRoot;
  const outputPath = join(root, "Projects", "INDEX.md");
  const expected = buildProjectIndex(root);
  if (check) {
    if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== expected) {
      console.error(`not ok - generated project index is stale: ${relative(root, outputPath)}`);
      process.exitCode = 1;
    } else {
      console.log("ok - generated project index is current");
    }
  } else {
    writeProjectIndex(root);
    console.log(`ok - wrote ${relative(root, outputPath)}`);
  }
}
