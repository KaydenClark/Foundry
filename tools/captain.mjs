#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, resolve, win32 } from "node:path";
import { pathToFileURL } from "node:url";

const CREDENTIAL_KEY = /token|secret|password|credential|authorization|cookie/i;

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\")) return false;
  if (isAbsolute(value) || win32.isAbsolute(value)) return false;
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  return posix.normalize(value) === value;
}

function credentialKeyPath(value, location = "signals") {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const result = credentialKeyPath(entry, `${location}[${index}]`);
      if (result) return result;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, entry] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) return `${location}.${key}`;
    const result = credentialKeyPath(entry, `${location}.${key}`);
    if (result) return result;
  }
  return null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function validateWorkflowConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return ["workflow config must be a JSON object"];
  }
  if (config.schemaVersion !== "1.0") errors.push("schemaVersion must be '1.0'");
  if (!isSafeRelativePath(config.statePath)) errors.push("statePath must be a safe relative path");
  if (!Array.isArray(config.workflows) || config.workflows.length === 0) {
    errors.push("workflows must be a non-empty array");
    return errors;
  }
  const ids = new Set();
  for (const [index, workflow] of config.workflows.entries()) {
    const prefix = `workflows[${index}]`;
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(workflow.id ?? "")) {
      errors.push(`${prefix}.id must be lowercase kebab-case`);
    } else if (ids.has(workflow.id)) {
      errors.push(`${prefix}: duplicate workflow id '${workflow.id}'`);
    } else {
      ids.add(workflow.id);
    }
    if (typeof workflow.enabled !== "boolean") errors.push(`${prefix}.enabled must be boolean`);
    if (workflow.activation !== "event-driven") {
      errors.push(`${prefix}.activation must be 'event-driven'`);
    }
    if (!/^role-[a-z][a-z0-9-]*$/.test(workflow.roleSkill ?? "")) {
      errors.push(`${prefix}.roleSkill must name a role-* skill`);
    }
    if (!isSafeRelativePath(workflow.policy)) {
      errors.push(`${prefix}.policy must be a safe relative path`);
    }
  }
  return errors;
}

export function stableSignalDigest(signals) {
  const credentialPath = credentialKeyPath(signals);
  if (credentialPath) throw new Error(`credential-shaped signal key is forbidden: ${credentialPath}`);
  return createHash("sha256").update(JSON.stringify(canonicalize(signals))).digest("hex");
}

export function levelZeroDecision({ signals, previousDigest = null }) {
  const signalDigest = stableSignalDigest(signals);
  const changed = signalDigest !== previousDigest;
  return {
    decision: changed ? "wake_l1" : "no_change",
    changed,
    modelSpawns: changed ? 1 : 0,
    signalDigest,
  };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
}

function parseFlags(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`invalid option near ${key ?? "end of input"}`);
    values[key.slice(2)] = value;
  }
  return values;
}

function printHelp() {
  console.log(`Usage:
  node tools/captain.mjs validate --config FILE
  node tools/captain.mjs level-zero --signals FILE --state FILE
`);
}

function cli() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }
  const flags = parseFlags(rest);
  if (command === "validate") {
    if (!flags.config) throw new Error("--config is required");
    const errors = validateWorkflowConfig(readJson(resolve(flags.config)));
    if (errors.length) throw new Error(`invalid Captain workflow config:\n- ${errors.join("\n- ")}`);
    console.log("ok - Captain workflow config valid");
    return;
  }
  if (command === "level-zero") {
    if (!flags.signals || !flags.state) throw new Error("--signals and --state are required");
    const stateFile = resolve(flags.state);
    const previous = existsSync(stateFile) ? readJson(stateFile) : {};
    const decision = levelZeroDecision({
      signals: readJson(resolve(flags.signals)),
      previousDigest: previous.signalDigest ?? null,
    });
    writeJsonAtomic(stateFile, { schemaVersion: "1.0", checkedAt: new Date().toISOString(), ...decision });
    console.log(JSON.stringify(decision, null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    cli();
  } catch (error) {
    console.error(`error - ${error.message}`);
    process.exitCode = 1;
  }
}
