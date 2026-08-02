import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { levelZeroDecision, stableSignalDigest, validateWorkflowConfig } from "./captain.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  readFileSync(resolve(root, "Scheduled", "Captain", "workflows.example.json"), "utf8"),
);

const unexpectedOption = spawnSync(
  process.execPath,
  [
    resolve(root, "tools", "captain.mjs"),
    "validate",
    "--config",
    resolve(root, "Scheduled", "Captain", "workflows.example.json"),
    "--state",
    "ignored.json",
  ],
  { encoding: "utf8" },
);
assert.notEqual(unexpectedOption.status, 0, "command-inapplicable CLI options fail closed");
assert.match(unexpectedOption.stderr, /unexpected option: --state/);

assert.deepEqual(validateWorkflowConfig(config), []);

const extraConfigField = structuredClone(config);
extraConfigField.credential = "forbidden";
assert.match(validateWorkflowConfig(extraConfigField).join("\n"), /workflow config fields/);

const extraWorkflowField = structuredClone(config);
extraWorkflowField.workflows[0].command = "ignored";
assert.match(validateWorkflowConfig(extraWorkflowField).join("\n"), /workflows\[0\] fields/);

const duplicate = structuredClone(config);
duplicate.workflows.push(structuredClone(duplicate.workflows[0]));
assert.match(validateWorkflowConfig(duplicate).join("\n"), /duplicate workflow id/);

const absoluteState = structuredClone(config);
absoluteState.statePath = resolve(root, ".local", "state.json");
assert.match(validateWorkflowConfig(absoluteState).join("\n"), /safe relative path/);

const unsafePolicy = structuredClone(config);
unsafePolicy.workflows[0].policy = "../outside.md";
assert.match(validateWorkflowConfig(unsafePolicy).join("\n"), /safe relative path/);

const signals = {
  enrollmentDigest: "abc123",
  readyQueueDigest: "def456",
  repositories: [
    { id: "F-001", localSha: "a".repeat(40), remoteSha: "a".repeat(40) },
  ],
};

const digest = stableSignalDigest(signals);
assert.match(digest, /^[0-9a-f]{64}$/);
assert.equal(stableSignalDigest({ ...signals, repositories: [...signals.repositories] }), digest);

assert.deepEqual(levelZeroDecision({ signals, previousDigest: null }), {
  decision: "wake_l1",
  changed: true,
  modelSpawns: 1,
  signalDigest: digest,
});
assert.deepEqual(levelZeroDecision({ signals, previousDigest: digest }), {
  decision: "no_change",
  changed: false,
  modelSpawns: 0,
  signalDigest: digest,
});

const changed = levelZeroDecision({
  signals: { ...signals, readyQueueDigest: "changed" },
  previousDigest: digest,
});
assert.equal(changed.decision, "wake_l1");
assert.equal(changed.modelSpawns, 1);
assert.notEqual(changed.signalDigest, digest);

assert.throws(
  () => stableSignalDigest({ accessToken: "not-allowed" }),
  /credential-shaped signal key/,
);

console.log("ok - portable Captain workflow and Level-0 contracts passed");
