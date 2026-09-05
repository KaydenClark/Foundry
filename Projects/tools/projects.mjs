#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const templatePath = join(toolRoot, "Projects", "templates", "projects.json");
const reservedProjectNames = new Set(["schema", "templates", "tools"]);

function exactKeys(value, keys, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).sort().join("\n") !== [...keys].sort().join("\n")
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function registryPath(root) {
  return join(root, "Projects", "projects.json");
}

function indexPath(root) {
  return join(root, "Projects", "INDEX.md");
}

function isInside(base, target) {
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function validateProjectPath(root, projectPath, id) {
  const normalized = nonEmpty(projectPath, `${id}.path`);
  if (
    normalized !== posix.normalize(normalized)
    || !normalized.startsWith("Projects/")
    || normalized.includes("\\")
    || normalized.split("/").includes("..")
  ) {
    throw new Error(`${id}.path must be a normalized relative path under Projects/`);
  }
  const firstSegment = normalized.slice("Projects/".length).split("/")[0];
  if (!firstSegment || reservedProjectNames.has(firstSegment.toLowerCase())) {
    throw new Error(`${id}.path uses a reserved Projects capability path`);
  }
  const projectsRoot = resolve(root, "Projects");
  const absolute = resolve(root, normalized);
  if (!isInside(projectsRoot, absolute)) {
    throw new Error(`${id}.path must stay inside the instance Projects root`);
  }
  if (!existsSync(absolute) || !lstatSync(absolute).isDirectory()) {
    throw new Error(`${id}.path must name an existing project directory`);
  }
  const realProjectsRoot = realpathSync(projectsRoot);
  if (realProjectsRoot !== join(realpathSync(root), "Projects")) {
    throw new Error("the instance Projects root must not resolve outside the instance");
  }
  const realProjectPath = realpathSync(absolute);
  if (!isInside(realProjectsRoot, realProjectPath)) {
    throw new Error(`${id}.path resolves outside the instance Projects root`);
  }
  if (!existsSync(join(realProjectPath, "AGENTS.md"))) {
    throw new Error(`${id}.path must contain AGENTS.md ownership controls`);
  }
  return normalized;
}

export function validateProjectsRegistry(root, registry) {
  root = resolve(root);
  exactKeys(registry, ["schemaVersion", "projects"], "Projects registry");
  if (registry.schemaVersion !== "1.0" || !Array.isArray(registry.projects)) {
    throw new Error("Projects registry must use schemaVersion 1.0 with a projects array");
  }
  const seenIds = new Set();
  const seenPaths = new Set();
  const projects = registry.projects.map((project, index) => {
    exactKeys(project, ["id", "name", "owner", "path"], `projects[${index}]`);
    const id = nonEmpty(project.id, `projects[${index}].id`);
    if (!/^P-\d{3}$/.test(id)) throw new Error(`${id} must be a stable P-### identifier`);
    if (seenIds.has(id)) throw new Error(`duplicate project id: ${id}`);
    const path = validateProjectPath(root, project.path, id);
    if (seenPaths.has(path)) throw new Error(`duplicate project path: ${path}`);
    seenIds.add(id);
    seenPaths.add(path);
    return {
      id,
      name: nonEmpty(project.name, `${id}.name`),
      owner: nonEmpty(project.owner, `${id}.owner`),
      path,
    };
  });
  return projects.sort((a, b) => a.id.localeCompare(b.id));
}

export function readProjectsRegistry(root) {
  const file = registryPath(resolve(root));
  if (!existsSync(file)) throw new Error(`Projects registry is missing: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function buildProjectsIndex(root, registry = readProjectsRegistry(root)) {
  const projects = validateProjectsRegistry(root, registry);
  return [
    "# Project Routing Index",
    "",
    "> Generated; do not hand-edit. Run `node Projects/tools/projects.mjs generate --root .`.",
    "",
    "This index contains only projects explicitly enrolled in `Projects/projects.json`.",
    "The registry owns identity, ownership, and source paths; directory discovery is",
    "not an enrollment mechanism.",
    "",
    "## Enrolled Projects",
    "",
    "| Project ID | Project | Owner | Source |",
    "|---|---|---|---|",
    ...projects.map((project) => {
      const href = project.path.slice("Projects/".length).split("/").map(encodeURIComponent).join("/");
      return `| ${project.id} | [${escapeCell(project.name)}](${href}/) | ${escapeCell(project.owner)} | \`${escapeCell(project.path)}\` |`;
    }),
    "",
  ].join("\n");
}

function writeAtomic(file, body) {
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, body, "utf8");
  renameSync(temporary, file);
}

function writeRegistry(root, registry) {
  writeAtomic(registryPath(root), `${JSON.stringify(registry, null, 2)}\n`);
}

export function generateProjectsIndex(root) {
  root = resolve(root);
  const output = indexPath(root);
  writeAtomic(output, buildProjectsIndex(root));
  return output;
}

export function initializeProjects(root) {
  root = resolve(root);
  mkdirSync(join(root, "Projects"), { recursive: true });
  if (!existsSync(registryPath(root))) {
    const template = JSON.parse(readFileSync(templatePath, "utf8"));
    validateProjectsRegistry(root, template);
    writeRegistry(root, template);
  }
  validateProjectsRegistry(root, readProjectsRegistry(root));
  generateProjectsIndex(root);
  return registryPath(root);
}

export function enrollProject(root, project) {
  root = resolve(root);
  if (!existsSync(registryPath(root))) initializeProjects(root);
  const registry = readProjectsRegistry(root);
  validateProjectsRegistry(root, registry);
  const next = { ...registry, projects: [...registry.projects, project] };
  const projects = validateProjectsRegistry(root, next);
  writeRegistry(root, { schemaVersion: "1.0", projects });
  generateProjectsIndex(root);
  return project.id;
}

export function checkProjects(root) {
  root = resolve(root);
  const expected = buildProjectsIndex(root);
  const output = indexPath(root);
  if (!existsSync(output) || readFileSync(output, "utf8") !== expected) {
    throw new Error(`generated Projects index is stale: ${relative(root, output)}`);
  }
  return true;
}

function flag(args, name, { required = false } = {}) {
  const matches = args.reduce((found, value, index) => value === name ? [...found, index] : found, []);
  if (matches.length > 1) throw new Error(`${name} may be supplied only once`);
  const value = matches.length ? args[matches[0] + 1] : null;
  if (matches.length && (!value || value.startsWith("--"))) throw new Error(`${name} requires a value`);
  if (required && !value) throw new Error(`${name} is required`);
  return value;
}

function validateOptions(args, allowed) {
  for (let index = 1; index < args.length; index += 2) {
    const option = args[index];
    if (typeof option !== "string" || !option.startsWith("--") || !allowed.has(option)) {
      throw new Error(`unexpected option: ${option ?? "(missing)"}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  }
}

function main(args) {
  const command = args[0];
  const allowedByCommand = new Map([
    ["init", new Set(["--root"])],
    ["enroll", new Set(["--root", "--id", "--name", "--owner", "--project"])],
    ["generate", new Set(["--root"])],
    ["check", new Set(["--root"])],
  ]);
  if (!allowedByCommand.has(command)) {
    throw new Error("usage: projects.mjs init|enroll|generate|check [--root PATH]");
  }
  validateOptions(args, allowedByCommand.get(command));
  const root = resolve(flag(args, "--root", { required: true }));
  if (command === "init") {
    initializeProjects(root);
    console.log("ok - initialized Projects registry and index");
    return;
  }
  if (command === "enroll") {
    const id = flag(args, "--id", { required: true });
    enrollProject(root, {
      id,
      name: flag(args, "--name", { required: true }),
      owner: flag(args, "--owner", { required: true }),
      path: flag(args, "--project", { required: true }),
    });
    console.log(`ok - enrolled ${id}`);
    return;
  }
  if (command === "generate") {
    generateProjectsIndex(root);
    console.log("ok - generated Projects/INDEX.md");
    return;
  }
  if (command === "check") {
    checkProjects(root);
    console.log("ok - Projects registry and index are current");
    return;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
