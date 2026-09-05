import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(projectRoot, "src");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

test("shipped source contains no side-effect-capable adapter", () => {
  const prohibited = [
    /from\s+["']node:(?:child_process|fs|fs\/promises|net|http|https|tls)["']/,
    /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
    /\b(?:exec|execFile|spawn|fork)\s*\(/,
    /\b(?:git|gh|npm|node)\s+(?:push|commit|publish|run)\b/i,
  ];

  const findings = [];
  for (const path of sourceFiles(sourceRoot)) {
    const source = readFileSync(path, "utf8");
    for (const pattern of prohibited) {
      if (pattern.test(source)) findings.push(`${relative(projectRoot, path)} matched ${pattern}`);
    }
  }

  assert.deepEqual(findings, []);
});

test("public source contains no absolute host path or secret-shaped material", () => {
  const prohibited = [
    /\/Users\//,
    /\/home\/[A-Za-z0-9._-]+/,
    /(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]/i,
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
  ];

  const findings = [];
  for (const path of sourceFiles(sourceRoot)) {
    const source = readFileSync(path, "utf8");
    for (const pattern of prohibited) {
      if (pattern.test(source)) findings.push(`${relative(projectRoot, path)} matched ${pattern}`);
    }
  }

  assert.deepEqual(findings, []);
});

test("source scanner covers real files", () => {
  const files = sourceFiles(sourceRoot);
  assert.ok(files.length >= 10);
  assert.ok(files.every((path) => statSync(path).isFile()));
});

test("every local source import is packaged outside excluded runtime namespaces", () => {
  const missing = [];
  const excluded = [];
  for (const path of sourceFiles(sourceRoot)) {
    const source = readFileSync(path, "utf8");
    const relativePath = relative(projectRoot, path);
    if (relativePath.split(/[\\/]/).some((segment) => ["state", "runtime", "dist", "build"].includes(segment))) {
      excluded.push(relativePath);
    }
    for (const match of source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const destination = join(path, "..", match[1]);
      if (!existsSync(destination)) missing.push(`${relativePath} -> ${match[1]}`);
    }
  }
  assert.deepEqual(excluded, []);
  assert.deepEqual(missing, []);
});
