#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE_FOLDERS = new Set(["the owner", "Projects", "Machine"]);
const ROOT_NOTES = new Set([
  "MEMORY.md",
  "AGENTS.md",
  "CLAUDE.md",
  "SCHEMA.md",
  "CHANGELOG.md",
]);
const REQUIRED_PROPERTIES = [
  "type",
  "status",
  "sensitivity",
  "authority",
  "source_paths",
  "last_verified",
];
const PROPERTY_ENUMS = {
  type: new Set(["memory", "person", "project", "machine", "source-map", "meta"]),
  status: new Set(["active", "partial", "stale", "archived"]),
  sensitivity: new Set(["normal", "private", "restricted"]),
  authority: new Set(["canonical", "curated", "derived", "historical"]),
};
const BUNDLE_NAMES = [
  "HOW_TO_WORK_WITH_KAYDEN.md",
  "MEMORY.md",
  "PROFILE_AND_VALUES.md",
  "PROJECTS_AND_SYSTEMS.md",
  "SOURCES_FRESHNESS_AND_PRIVACY.md",
];
const CLOUD_PROVIDERS = new Set(["chatgpt", "claude"]);
const CLOUD_PROJECT_NAMES = new Map([
  ["chatgpt", "WORKSPACE"],
  ["claude", "WORKSPACE Wiki Memory"],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function parseFrontmatter(content) {
  if (!content.startsWith("---\n")) return { data: {}, body: content };
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: content };

  const raw = content.slice(4, end);
  const data = {};
  let currentKey = null;
  for (const line of raw.split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(listMatch[1].trim());
      continue;
    }
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    currentKey = fieldMatch[1];
    data[currentKey] = fieldMatch[2].trim() || [];
  }

  return { data, body: content.slice(end + 5) };
}

async function walkMarkdown(root) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === ".obsidian" || entry.name === ".local") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
    }
  }
  await walk(root);
  return files.sort();
}

function activeNote(relative) {
  const parts = normalizePath(relative).split("/");
  return ROOT_NOTES.has(parts[0]) || ACTIVE_FOLDERS.has(parts[0]);
}

function extractWikiLinks(content) {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) =>
    match[1].split("|")[0].split("#")[0].trim(),
  );
}

function linkResolves(link, sourceRelative, exactNotes, basenameNotes, vaultRoot) {
  if (!link) return true;
  const withoutExtension = link.replace(/\.md$/i, "");
  const sourceDirectory = path.posix.dirname(normalizePath(sourceRelative));
  const relativeCandidate = path.posix.normalize(
    path.posix.join(sourceDirectory, withoutExtension),
  );
  if (exactNotes.has(withoutExtension) || exactNotes.has(relativeCandidate)) return true;
  const basename = path.posix.basename(withoutExtension);
  if (basenameNotes.get(basename)?.length === 1) return true;
  // One-vault model (S-008): the wiki sits inside the deployment vault, so a
  // link may target a vault-root-relative file outside the wiki (specs, room
  // brains). Accept exact vault-root paths only; basename fallback stays
  // wiki-scoped.
  if (vaultRoot && !withoutExtension.startsWith("..")) {
    return existsSync(path.join(vaultRoot, `${withoutExtension}.md`));
  }
  return false;
}

export async function auditVault(root) {
  const files = await walkMarkdown(root);
  const records = [];
  const exactNotes = new Set();
  const basenameNotes = new Map();

  for (const absolute of files) {
    const relative = normalizePath(path.relative(root, absolute));
    const notePath = relative.replace(/\.md$/i, "");
    exactNotes.add(notePath);
    const basename = path.posix.basename(notePath);
    const matches = basenameNotes.get(basename) || [];
    matches.push(notePath);
    basenameNotes.set(basename, matches);
    records.push({
      absolute,
      relative,
      content: await readFile(absolute, "utf8"),
    });
  }

  const errors = [];
  for (const rootNote of ROOT_NOTES) {
    if (!records.some((record) => record.relative === rootNote)) {
      errors.push(`missing root control: ${rootNote}`);
    }
  }
  let activeNestedFiles = 0;
  for (const record of records) {
    if (!activeNote(record.relative)) continue;
    const parts = record.relative.split("/");
    if (ACTIVE_FOLDERS.has(parts[0]) && parts.length > 2) {
      activeNestedFiles += 1;
      errors.push(`nested active note: ${record.relative}`);
    }

    const { data } = parseFrontmatter(record.content);
    for (const property of REQUIRED_PROPERTIES) {
      const value = data[property];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
        errors.push(`missing ${property}: ${record.relative}`);
      }
    }
    for (const [property, allowed] of Object.entries(PROPERTY_ENUMS)) {
      const value = data[property];
      if (value !== undefined && !allowed.has(value)) {
        errors.push(`invalid ${property} in ${record.relative}: ${value}`);
      }
    }
    if (data.source_paths !== undefined && !Array.isArray(data.source_paths)) {
      errors.push(`invalid source_paths in ${record.relative}: expected list`);
    }
    if (
      data.last_verified !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(data.last_verified)
    ) {
      errors.push(`invalid last_verified in ${record.relative}: ${data.last_verified}`);
    }

    for (const link of extractWikiLinks(record.content)) {
      if (!linkResolves(link, record.relative, exactNotes, basenameNotes, path.dirname(root))) {
        errors.push(`unresolved wikilink in ${record.relative}: ${link}`);
      }
    }
  }

  const memory = records.find((record) => record.relative === "MEMORY.md");
  if (!memory) {
    errors.push("missing root MEMORY.md");
  } else if (memory.content.split("\n").length > 200) {
    errors.push("MEMORY.md exceeds 200 lines");
  }

  return {
    activeNestedFiles,
    errors,
    markdownFiles: files.length,
  };
}

async function readNormalNote(root, relative) {
  const content = await readFile(path.join(root, relative), "utf8");
  const { data } = parseFrontmatter(content);
  if (data.sensitivity && data.sensitivity !== "normal") return "";
  return content;
}

async function collectNormalNotes(root, folder) {
  const directory = path.join(root, folder);
  const entries = await readdir(directory, { withFileTypes: true });
  const sections = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const content = await readNormalNote(root, path.join(folder, entry.name));
    if (content) sections.push(`\n\n<!-- source: ${folder}/${entry.name} -->\n\n${content}`);
  }
  return sections.join("");
}

async function restrictedTargets(root) {
  const exact = new Set();
  const basenames = new Set();
  for (const absolute of await walkMarkdown(root)) {
    const content = await readFile(absolute, "utf8");
    const { data } = parseFrontmatter(content);
    if (!data.sensitivity || data.sensitivity === "normal") continue;
    const relative = normalizePath(path.relative(root, absolute)).replace(/\.md$/i, "");
    exact.add(relative);
    basenames.add(path.posix.basename(relative));
  }
  return { exact, basenames };
}

function sanitizeCloudContent(content, restricted) {
  return content.replace(/\[\[([^\]]+)\]\]/g, (match, rawLink) => {
    const [targetWithHeading, alias] = rawLink.split("|");
    const target = targetWithHeading.split("#")[0].replace(/\.md$/i, "").trim();
    const basename = path.posix.basename(target);
    if (!restricted.exact.has(target) && !restricted.basenames.has(basename)) {
      return match;
    }
    const label = alias?.trim() || basename;
    return `${label} (restricted local note; excluded from this cloud snapshot)`;
  });
}

export async function buildCloudBundle(root, output, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourcePaths = [
    "MEMORY.md",
    "SCHEMA.md",
    "the owner/How to Work With the owner.md",
    "the owner/Profile and Values.md",
  ];
  const sourceContents = [];
  for (const relative of sourcePaths) {
    sourceContents.push([relative, await readFile(path.join(root, relative), "utf8")]);
  }
  const projects = await collectNormalNotes(root, "Projects");
  const machine = await collectNormalNotes(root, "Machine");
  const restricted = await restrictedTargets(root);
  sourceContents.push(["Projects/*.md", projects], ["Machine/*.md", machine]);

  const sourceManifestSha256 = sha256(
    sourceContents
      .map(([relative, content]) => `${relative}:${sha256(content)}`)
      .sort()
      .join("\n"),
  );
  const header = `<!-- generated-at: ${generatedAt} -->\n<!-- source-manifest-sha256: ${sourceManifestSha256} -->\n<!-- generated from the canonical local Wiki; do not edit this snapshot -->\n\n`;
  const outputs = new Map([
    ["MEMORY.md", await readFile(path.join(root, "MEMORY.md"), "utf8")],
    [
      "HOW_TO_WORK_WITH_KAYDEN.md",
      await readNormalNote(root, "the owner/How to Work With the owner.md"),
    ],
    [
      "PROFILE_AND_VALUES.md",
      await readNormalNote(root, "the owner/Profile and Values.md"),
    ],
    ["PROJECTS_AND_SYSTEMS.md", `# Projects and Systems${projects}${machine}`],
    [
      "SOURCES_FRESHNESS_AND_PRIVACY.md",
      await readFile(path.join(root, "SCHEMA.md"), "utf8"),
    ],
  ]);

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const files = [];
  for (const name of BUNDLE_NAMES) {
    const sanitized = sanitizeCloudContent(outputs.get(name), restricted);
    const content = `${header}${sanitized.trim()}\n`;
    await writeFile(path.join(output, name), content);
    files.push({ name, sha256: sha256(content) });
  }
  return { files, generatedAt, sourceManifestSha256 };
}

export async function loadCloudProjectTargets(registryPath) {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (registry.schema_version !== 1) {
    throw new Error("cloud project registry requires schema_version 1");
  }
  if (!Array.isArray(registry.targets)) {
    throw new Error("cloud project registry targets must be a list");
  }

  const seen = new Set();
  for (const target of registry.targets) {
    if (!CLOUD_PROVIDERS.has(target.provider)) {
      throw new Error(`unsupported cloud project provider: ${target.provider}`);
    }
    if (seen.has(target.provider)) {
      throw new Error(`duplicate cloud project target: ${target.provider}`);
    }
    seen.add(target.provider);
    const expectedName = CLOUD_PROJECT_NAMES.get(target.provider);
    if (target.project_name !== expectedName) {
      throw new Error(`${target.provider} project_name must be ${expectedName}`);
    }
    if (target.refresh_mode !== "update_existing" || target.allow_create !== false) {
      throw new Error(`${target.provider} must update the existing project`);
    }
    if (!target.project_id || !target.project_url) {
      throw new Error(`${target.provider} requires project_id and project_url`);
    }
  }
  for (const provider of CLOUD_PROVIDERS) {
    if (!seen.has(provider)) throw new Error(`missing cloud project target: ${provider}`);
  }
  return registry;
}

async function main() {
  const [command, rootArg, outputArg] = process.argv.slice(2);
  if (!command) {
    console.error("Usage: wiki-memory.mjs <audit|bundle|targets> [vault|registry] [output]");
    process.exitCode = 2;
    return;
  }
  if (command === "targets") {
    const defaultRegistry = fileURLToPath(
      new URL("./wiki-cloud-projects.json", import.meta.url),
    );
    const result = await loadCloudProjectTargets(
      rootArg ? path.resolve(rootArg) : defaultRegistry,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!rootArg) throw new Error(`${command} requires a vault path`);
  const root = path.resolve(rootArg);
  if (command === "audit") {
    const result = await auditVault(root);
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (command === "bundle") {
    if (!outputArg) throw new Error("bundle requires an output directory");
    const result = await buildCloudBundle(root, path.resolve(outputArg));
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
