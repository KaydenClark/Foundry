#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkProjects,
  generateProjectsIndex,
  readProjectsRegistry,
  validateProjectsRegistry,
} from "../../Projects/tools/projects.mjs";

const sourceWikiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const noteKeys = ["schemaVersion", "kind", "status", "sensitivity", "authority", "sources"];
const noteKinds = new Set(["root-memory", "project-index", "project-pointer", "project-memory"]);
const sensitivities = new Set(["normal", "private", "restricted"]);
const authorities = new Set(["canonical", "derived"]);

function normalizePath(value) {
  return value.split("\\").join("/");
}

function instanceRelative(root, from, to) {
  const rel = relative(from, to);
  if (isAbsolute(rel)) throw new Error("memory link cannot cross filesystem roots");
  const normalized = normalizePath(rel);
  const target = resolve(from, rel);
  const rootRel = relative(root, target);
  if (rootRel.startsWith("..") || isAbsolute(rootRel)) {
    throw new Error("memory link must stay inside the instance root");
  }
  return normalized || ".";
}

function atomicWrite(file, body) {
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, body, "utf8");
  renameSync(temporary, file);
}

function writeIfMissing(file, body) {
  if (!existsSync(file)) atomicWrite(file, body);
}

function render(template, values) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  const unresolved = output.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (unresolved) throw new Error(`unresolved Wiki template tokens: ${unresolved.join(", ")}`);
  return output;
}

function parseScalar(raw, label) {
  const value = raw.trim();
  if (value.startsWith('"') || value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string") throw new Error("not a string");
      return parsed;
    } catch {
      throw new Error(`${label} has malformed quoted frontmatter`);
    }
  }
  return value;
}

function parseFrontmatter(body, label) {
  if (!body.startsWith("---\n")) throw new Error(`${label} is missing frontmatter`);
  const end = body.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${label} has unterminated frontmatter`);
  const data = Object.create(null);
  let current = null;
  for (const line of body.slice(4, end).split("\n")) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && current) {
      if (!Array.isArray(data[current])) {
        throw new Error(`${label} has a list item beneath a scalar field`);
      }
      data[current].push(parseScalar(item[1], label));
      continue;
    }
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!field) throw new Error(`${label} has malformed frontmatter`);
    current = field[1];
    if (Object.hasOwn(data, current)) {
      throw new Error(`${label} has duplicate frontmatter field: ${current}`);
    }
    const raw = field[2].trim();
    if (!raw) {
      data[current] = [];
      continue;
    }
    data[current] = parseScalar(raw, label);
  }
  return data;
}

function isWithin(root, target) {
  const rel = relative(root, target);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

function managedDirectory(root, directory, label, { create = false } = {}) {
  const expected = resolve(realpathSync(root), relative(root, directory));
  if (!existsSync(directory)) {
    if (!create) throw new Error(`${label} is missing`);
    mkdirSync(directory, { recursive: true });
  }
  if (realpathSync(directory) !== expected) {
    throw new Error(`${label} must not resolve outside its instance location`);
  }
}

function validateNote(body, label, expectedKind, root) {
  const data = parseFrontmatter(body, label);
  if (Object.keys(data).sort().join("\n") !== [...noteKeys].sort().join("\n")) {
    throw new Error(`${label} has an invalid frontmatter shape`);
  }
  if (
    data.schemaVersion !== "1.0"
    || data.kind !== expectedKind
    || !noteKinds.has(data.kind)
    || data.status !== "active"
    || !sensitivities.has(data.sensitivity)
    || !authorities.has(data.authority)
    || !Array.isArray(data.sources)
    || !data.sources.length
    || data.sources.some((source) =>
      !source
      || isAbsolute(source)
      || source.includes("\\")
      || source !== posix.normalize(source)
      || source.split("/").includes(".."))
  ) {
    throw new Error(`${label} violates the managed memory schema`);
  }
  const realRoot = realpathSync(root);
  for (const source of data.sources) {
    const absolute = resolve(root, source);
    if (!existsSync(absolute)) throw new Error(`unresolved memory source in ${label}: ${source}`);
    if (!isWithin(realRoot, realpathSync(absolute))) {
      throw new Error(`memory source resolves outside instance root: ${source}`);
    }
  }
}

function markdownLinks(body) {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim().split("#")[0])
    .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
}

function validateLinks(root, file, body) {
  const realRoot = realpathSync(root);
  for (const target of markdownLinks(body)) {
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      throw new Error(`invalid encoded memory link in ${relative(root, file)}: ${target}`);
    }
    const absolute = resolve(dirname(file), decoded);
    const rel = relative(root, absolute);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`link leaves instance root: ${target}`);
    if (!existsSync(absolute)) throw new Error(`unresolved memory link in ${relative(root, file)}: ${target}`);
    if (!isWithin(realRoot, realpathSync(absolute))) {
      throw new Error(`memory link resolves outside instance root: ${target}`);
    }
  }
}

function escapeCell(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeMarkdownText(value) {
  return String(value)
    .replaceAll("\n", " ")
    .replace(/([\\`*_[\]<>])/g, "\\$1");
}

function encodeLink(value) {
  return normalizePath(value)
    .split("/")
    .map((segment) => segment === "." || segment === ".." ? segment : encodeURIComponent(segment))
    .join("/");
}

function buildWikiProjectIndex(projects) {
  return [
    "---",
    "schemaVersion: \"1.0\"",
    "kind: project-index",
    "status: active",
    "sensitivity: normal",
    "authority: derived",
    "sources:",
    "  - Projects/projects.json",
    "---",
    "",
    "# Project Memory Index",
    "",
    "This generated index contains only explicitly enrolled project memory pointers.",
    "",
    "| Project ID | Project | Owner |",
    "|---|---|---|",
    ...projects.map((project) =>
      `| ${project.id} | [${escapeMarkdownText(escapeCell(project.name))}](${project.id}.md) | ${escapeCell(project.owner)} |`),
    "",
  ].join("\n");
}

function managedNotes(root, projects) {
  return [
    { file: join(root, "Wiki", "MEMORY.md"), kind: "root-memory" },
    { file: join(root, "Wiki", "Projects", "INDEX.md"), kind: "project-index" },
    ...projects.flatMap((project) => [
      { file: join(root, "Wiki", "Projects", `${project.id}.md`), kind: "project-pointer" },
      { file: join(root, project.path, "MEMORY.md"), kind: "project-memory" },
    ]),
  ];
}

export function initializeWiki(root) {
  root = resolve(root);
  const registry = readProjectsRegistry(root);
  const projects = validateProjectsRegistry(root, registry);
  generateProjectsIndex(root);
  const wikiRoot = join(root, "Wiki");
  const wikiProjects = join(wikiRoot, "Projects");
  managedDirectory(root, wikiRoot, "Wiki root", { create: true });
  managedDirectory(root, wikiProjects, "Wiki project directory", { create: true });
  for (const name of ["MEMORY.md", "README.md", "SCHEMA.md"]) {
    writeIfMissing(join(wikiRoot, name), readFileSync(join(sourceWikiRoot, name), "utf8"));
  }
  const memoryTemplate = readFileSync(join(sourceWikiRoot, "templates", "project-memory.md"), "utf8");
  const pointerTemplate = readFileSync(join(sourceWikiRoot, "templates", "project-pointer.md"), "utf8");
  for (const project of projects) {
    const projectRoot = join(root, project.path);
    const memoryFile = join(projectRoot, "MEMORY.md");
    const pointerFile = join(wikiProjects, `${project.id}.md`);
    const values = {
      PROJECT_ID: project.id,
      PROJECT_NAME: escapeMarkdownText(project.name),
      PROJECT_OWNER: escapeMarkdownText(project.owner),
      PROJECT_SOURCE: JSON.stringify(`${project.path}/AGENTS.md`),
      AGENTS_LINK: "AGENTS.md",
      WIKI_POINTER_LINK: encodeLink(instanceRelative(root, projectRoot, pointerFile)),
      PROJECT_MEMORY_LINK: encodeLink(instanceRelative(root, wikiProjects, memoryFile)),
      PROJECT_AGENTS_LINK: encodeLink(instanceRelative(root, wikiProjects, join(projectRoot, "AGENTS.md"))),
    };
    writeIfMissing(memoryFile, render(memoryTemplate, values));
    writeIfMissing(pointerFile, render(pointerTemplate, values));
  }
  atomicWrite(join(wikiProjects, "INDEX.md"), buildWikiProjectIndex(projects));
  checkWiki(root);
  return projects.length;
}

export function checkWiki(root) {
  root = resolve(root);
  const projects = validateProjectsRegistry(root, readProjectsRegistry(root));
  checkProjects(root);
  const wikiProjects = join(root, "Wiki", "Projects");
  managedDirectory(root, join(root, "Wiki"), "Wiki root");
  managedDirectory(root, wikiProjects, "Wiki project directory");
  const expectedFiles = new Set(["INDEX.md", ...projects.map((project) => `${project.id}.md`)]);
  const actualFiles = new Set(readdirSync(wikiProjects, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name));
  if ([...expectedFiles].sort().join("\n") !== [...actualFiles].sort().join("\n")) {
    throw new Error("Wiki project pointers do not match the exact Projects registry");
  }
  const expectedIndex = buildWikiProjectIndex(projects);
  if (readFileSync(join(wikiProjects, "INDEX.md"), "utf8") !== expectedIndex) {
    throw new Error("Wiki project memory index is stale");
  }
  for (const note of managedNotes(root, projects)) {
    if (!existsSync(note.file)) throw new Error(`managed memory note is missing: ${relative(root, note.file)}`);
    if (!isWithin(realpathSync(root), realpathSync(note.file))) {
      throw new Error(`managed memory note resolves outside instance root: ${relative(root, note.file)}`);
    }
    const body = readFileSync(note.file, "utf8");
    validateNote(body, relative(root, note.file), note.kind, root);
    validateLinks(root, note.file, body);
  }
  return true;
}

function flag(args, name) {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length > 1) throw new Error(`${name} may be supplied only once`);
  const value = indexes.length ? args[indexes[0] + 1] : null;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

function main(args) {
  if (!new Set(["init", "check"]).has(args[0])) throw new Error("usage: wiki.mjs init|check --root PATH");
  if (args.length !== 3 || args[1] !== "--root") throw new Error("only --root PATH is accepted");
  const root = resolve(flag(args, "--root"));
  if (args[0] === "init") {
    console.log(`ok - initialized Wiki memory for ${initializeWiki(root)} projects`);
  } else {
    checkWiki(root);
    console.log("ok - Wiki schema, routing, and project indexes are current");
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
