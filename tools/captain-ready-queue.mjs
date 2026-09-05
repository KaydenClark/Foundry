#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultRoot = process.env.FOUNDRY_INSTANCE_ROOT
  ? resolve(process.env.FOUNDRY_INSTANCE_ROOT)
  : null;
const defaultCanonicalRoot = process.env.FOUNDRY_CANONICAL_INSTANCE_ROOT
  ? resolve(process.env.FOUNDRY_CANONICAL_INSTANCE_ROOT)
  : null;
const freshnessWindowMs = 3 * 24 * 60 * 60 * 1000;

function requireInstanceRoot(root) {
  if (!root) throw new Error("Captain ready queue requires an explicit --root or FOUNDRY_INSTANCE_ROOT");
  return resolve(root);
}

function markdownCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function section(text, heading) {
  const match = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[ \\t]*$`, "m").exec(text);
  if (!match) return null;
  const after = text.slice(match.index + match[0].length);
  const next = /^## /m.exec(after);
  return next ? after.slice(0, next.index) : after;
}

export function parseActivePortfolio(root) {
  const registry = readFileSync(join(root, "Wiki/Machine/Project Source Registry.md"), "utf8");
  const activePortfolio = section(registry, "Active Portfolio");
  if (activePortfolio === null) throw new Error("Project registry is missing its Active Portfolio section.");
  const lanes = [];
  for (const line of activePortfolio.split("\n")) {
    if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
    const cells = markdownCells(line);
    if (cells[0] === "Lane") continue;
    if (cells.length !== 5) throw new Error(`Malformed active portfolio row: ${line.trim()}`);
    const [lane, owner, sourceCell] = cells;
    const path = sourceCell.match(/^`([^`]+)`$/)?.[1];
    if (!lane || !owner || !path) throw new Error(`Malformed active portfolio row: ${line.trim()}`);
    lanes.push({ lane, owner, path });
  }
  if (!lanes.length) throw new Error("Active Portfolio contains no enrolled lanes.");
  return lanes;
}

function git(path, args) {
  return execFileSync("git", ["-C", path, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function taskboardProvenance(path) {
  const taskboard = join(path, "TASKBOARD.md");
  if (!existsSync(taskboard)) return { freshness: "missing", sourceSha: "missing", updatedAt: "missing", finding: "TASKBOARD.md is missing" };
  try {
    const sourceSha = git(path, ["log", "-1", "--format=%H", "--", "TASKBOARD.md"]);
    const updatedAt = git(path, ["log", "-1", "--format=%cI", "--", "TASKBOARD.md"]);
    const dirty = git(path, ["status", "--porcelain", "--", "TASKBOARD.md"]);
    if (!sourceSha || !updatedAt) return { freshness: "stale", sourceSha: sourceSha || "missing", updatedAt: updatedAt || "missing", finding: "TASKBOARD.md has no committed provenance" };
    if (dirty) return { freshness: "stale", sourceSha, updatedAt, finding: "TASKBOARD.md has uncommitted changes" };
    if (Date.now() - Date.parse(updatedAt) > freshnessWindowMs) {
      return { freshness: "stale", sourceSha, updatedAt, finding: "TASKBOARD.md source is older than three days" };
    }
    return { freshness: "fresh", sourceSha, updatedAt, finding: "none" };
  } catch {
    return { freshness: "stale", sourceSha: "unavailable", updatedAt: "unavailable", finding: "TASKBOARD.md provenance is unavailable" };
  }
}

function identifier(owner, spec, ticket) {
  const prefix = /^P-\d{3}$/.test(owner) ? owner : "system";
  return [prefix, spec, ticket].filter(Boolean).join("/");
}

function hotSpecSlices(text, owner) {
  const slices = [];
  const match = /<!-- hot-specs:start -->([\s\S]*?)<!-- hot-specs:end -->/.exec(text);
  if (!match) return slices;
  for (const line of match[1].split("\n")) {
    if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
    const [specCell, slice, assignee, blocker] = markdownCells(line);
    const spec = /\[S-(\d+)\]/.exec(specCell)?.[1];
    const ticket = /\b(TK-\d+)\b/.exec(slice)?.[1];
    if (!spec || !ticket) continue;
    const state = /\bready\b/i.test(slice) ? "ready"
      : /\b(blocked|owner[- ]gated)\b/i.test(slice) ? "blocked"
      : /\b(claimed|in-progress)\b/i.test(slice) ? "claimed" : "blocked";
    slices.push({ id: identifier(owner, `S-${spec}`, ticket), state, summary: slice, assignee, blocker: blocker || "none" });
  }
  return slices;
}

function legacySlices(text, owner) {
  const slices = [];
  const states = new Map([["Ready", "ready"], ["In Progress", "claimed"], ["Blocked", "blocked"]]);
  for (const [heading, state] of states) {
    const currentSection = section(text, heading);
    if (currentSection === null) continue;
    for (const line of currentSection.split("\n")) {
      if (!line.trim().startsWith("|") || /^\|\s*[-:| ]+\|$/.test(line.trim())) continue;
      const cells = markdownCells(line);
      const ticket = /^(T-\d+|B-\d+)$/.exec(cells[0])?.[1];
      if (!ticket) continue;
      slices.push({ id: identifier(owner, null, ticket), state, summary: cells[1] || ticket, assignee: "see source", blocker: state === "blocked" ? (cells[2] || "see source") : "none" });
    }
  }
  return slices;
}

function escapeCell(value) { return String(value).replaceAll("|", "\\|").replaceAll("\n", " "); }

function resolveLanePaths(root, canonicalRoot, lanePath) {
  const canonical = resolve(canonicalRoot);
  const source = resolve(lanePath);
  const rel = relative(canonical, source);
  const insideCanonical = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (!insideCanonical) return { physicalPath: source, logicalPath: source };
  const overlay = join(root, rel);
  return {
    physicalPath: existsSync(join(overlay, "TASKBOARD.md")) ? overlay : source,
    logicalPath: overlay,
  };
}

function readPortfolioEntries(root, { canonicalRoot = root } = {}) {
  const lanes = parseActivePortfolio(root);
  return lanes.map((lane) => {
    const { physicalPath, logicalPath } = resolveLanePaths(root, canonicalRoot, lane.path);
    const taskboard = join(physicalPath, "TASKBOARD.md");
    const displayTaskboard = join(logicalPath, "TASKBOARD.md");
    const provenance = taskboardProvenance(physicalPath);
    let slices = [];
    if (existsSync(taskboard)) {
      const body = readFileSync(taskboard, "utf8");
      slices = hotSpecSlices(body, lane.owner);
      if (!slices.length) slices = legacySlices(body, lane.owner);
      if (!slices.length && provenance.freshness === "fresh") {
        provenance.freshness = "stale";
        provenance.finding = "TASKBOARD.md has no parseable ready, blocked, or claimed slices";
      }
    }
    return { ...lane, taskboard, displayTaskboard, provenance, slices };
  });
}

export function buildDailyPortfolioPlan(root = defaultRoot, options = {}) {
  root = requireInstanceRoot(root);
  return readPortfolioEntries(root, options).map((entry) => {
    const claimed = entry.slices.find((slice) => slice.state === "claimed");
    const ready = entry.slices.find((slice) => slice.state === "ready");
    const blocked = entry.slices.find((slice) => slice.state === "blocked");
    const selected = claimed || ready || blocked || null;
    const disposition = entry.provenance.freshness !== "fresh" ? "repair"
      : claimed ? "resume"
        : ready ? "slice"
          : blocked ? "blocked"
            : "no-action";
    return {
      lane: entry.lane,
      owner: entry.owner,
      path: entry.path,
      freshness: entry.provenance.freshness,
      finding: entry.provenance.finding,
      disposition,
      selectedSlice: disposition === "repair" ? null : (selected?.id || null),
      candidateCount: entry.slices.filter((slice) => slice.state === "ready").length
    };
  });
}

export function buildReadyQueue(root = defaultRoot, options = {}) {
  root = requireInstanceRoot(root);
  const entries = readPortfolioEntries(root, options);
  const allSlices = entries.flatMap((entry) => entry.slices.map((slice) => ({ ...slice, lane: entry.lane })));
  const lines = [
    "# Captain Ready Queue",
    "",
    "> Generated; do not hand-edit. Run `node tools/captain-ready-queue.mjs` from the instance root.",
    "",
    "This is Captain's cross-portfolio traversal entry node. It is a derived cache of",
    "each enrolled lane's canonical `TASKBOARD.md`; project controls remain authoritative.",
    "Every lane carries its source ref and freshness so missing or stale canon is visible.",
    "",
    "## Enrolled Lanes",
    "",
    "| Lane | Source | Provenance | Freshness | Finding |",
    "|---|---|---|---|---|",
    ...entries.map((entry) => {
      const source = relative(join(root, "Scheduled/Captain"), entry.displayTaskboard) || "TASKBOARD.md";
      const p = entry.provenance;
      return `| ${escapeCell(entry.lane)} | [TASKBOARD.md](${source}) | ${p.sourceSha} (${p.updatedAt}) | ${p.freshness} | ${escapeCell(p.finding)} |`;
    }),
  ];
  for (const state of ["ready", "claimed", "blocked"]) {
    lines.push("", `## ${state[0].toUpperCase()}${state.slice(1)} Slices`, "");
    const slices = allSlices.filter((slice) => slice.state === state);
    lines.push(...(slices.length ? slices.map((slice) => `- \`${slice.id}\` — ${escapeCell(slice.summary)} (${slice.lane}; owner: ${escapeCell(slice.assignee)}; blocker: ${escapeCell(slice.blocker)})`) : ["- none"]));
  }
  const findings = entries.filter((entry) => entry.provenance.freshness !== "fresh");
  lines.push("", "## Routing Findings", "", ...(findings.length
    ? findings.map((entry) => `- ${entry.lane}: ${entry.provenance.finding}`)
    : ["- none; every enrolled lane has a fresh projection entry."]), "");
  return lines.join("\n");
}

export function writeReadyQueue(root = defaultRoot, options = {}) {
  root = requireInstanceRoot(root);
  const outputPath = join(root, "Scheduled/Captain/READY_QUEUE.md");
  writeFileSync(outputPath, buildReadyQueue(root, options), "utf8");
  return outputPath;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const rootFlag = process.argv.indexOf("--root");
  const root = requireInstanceRoot(rootFlag >= 0 && process.argv[rootFlag + 1]
    ? resolve(process.argv[rootFlag + 1])
    : defaultRoot);
  const options = { canonicalRoot: defaultCanonicalRoot ?? root };
  if (process.argv.includes("--plan")) {
    process.stdout.write(`${JSON.stringify(buildDailyPortfolioPlan(root, options), null, 2)}\n`);
  } else {
    const outputPath = join(root, "Scheduled/Captain/READY_QUEUE.md");
    const expected = buildReadyQueue(root, options);
    if (process.argv.includes("--check")) {
      if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== expected) {
        console.error(`not ok - generated Captain ready queue is stale: ${relative(root, outputPath)}`);
        process.exitCode = 1;
      } else console.log("ok - Captain ready queue is current");
    } else {
      writeReadyQueue(root, options);
      console.log(`ok - wrote ${relative(root, outputPath)}`);
    }
  }
}
