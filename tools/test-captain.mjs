import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { levelZeroDecision, stableSignalDigest, validateWorkflowConfig } from "./captain.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(root, "scheduler", "workflows.example.json"), "utf8"));

assert.deepEqual(validateWorkflowConfig(config), []);

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
