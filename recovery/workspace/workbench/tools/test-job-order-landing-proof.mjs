#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeLandingProof } from "./job-order-landing-proof.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const segments = [
  {
    base: "afd45cf93fabc1366cf899e186065e781bccc69e",
    candidate: "13df2578724fbece4fa29df7e32e99a8db797f62",
    expected: "pass",
  },
  {
    base: "13df2578724fbece4fa29df7e32e99a8db797f62",
    candidate: "51f139a951fe24a73ab17c79457273df5936faf8",
    expected: "append.archive-introduction-mismatch",
  },
  {
    base: "51f139a951fe24a73ab17c79457273df5936faf8",
    candidate: "919fe12126723b87c7ebdf32c9a7d8f47301b931",
    expected: "pass",
  },
];

const result = composeLandingProof({
  root,
  specId: "S-023",
  jobOrder: "JO-00007U",
  segments,
  acceptedReview: {
    task: "01a04962-34df-7992-8c69-7bc1f1e63026",
    candidate: "919fe12126723b87c7ebdf32c9a7d8f47301b931",
    verdict: "PASS",
  },
});

assert.equal(result.ok, true);
assert.deepEqual(result.observations.map(({ observation }) => observation), [
  "pass",
  "append.archive-introduction-mismatch",
  "pass",
]);
assert.equal(result.observations[0].candidate, result.observations[1].base);
assert.equal(result.observations[1].candidate, result.observations[2].base);
assert.equal(result.acceptedReview.candidate, result.observations.at(-1).candidate);
assert.equal(result.acceptedReview.verdict, "PASS");

const relabelled = composeLandingProof({
  root,
  specId: "S-023",
  jobOrder: "JO-00007U",
  segments: segments.map((segment, index) => index === 1 ? { ...segment, expected: "pass" } : segment),
  acceptedReview: {
    task: "01a04962-34df-7992-8c69-7bc1f1e63026",
    candidate: "919fe12126723b87c7ebdf32c9a7d8f47301b931",
    verdict: "PASS",
  },
});
assert.equal(relabelled.ok, false, "the historical middle failure cannot be relabelled as pass");
assert.equal(relabelled.errors[0].code, "composition.observation-mismatch");

console.log("job-order landing proof: 2 checks passed");
