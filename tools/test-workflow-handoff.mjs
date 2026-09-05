#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateWorkflowHandoff } from "./workflow-handoff.mjs";

const workflowContract = JSON.parse(readFileSync(new URL("../Halls/Orchestration/contracts/workflow-handoff.json", import.meta.url), "utf8"));

const productFlow = {
  jobOrderId: "A1B2C3",
  responsibleParty: "Foundry/Halls/Production",
  target: "product",
  implementationHall: "Production",
  optionalPassages: ["Knowledge"],
  scheduled: false,
  implementation: { commit: "abc1234", pullRequest: "https://example.invalid/pr/1" },
  assay: { verdict: "pass" },
  ward: { outcome: "merge-integration", repairs: 0 },
  productization: false,
};
assert.deepEqual(workflowContract.required, Object.keys(productFlow), "declared workflow handoff fields match the runtime validator contract");
assert.deepEqual(validateWorkflowHandoff(productFlow), [], "passing product flow validates");
assert.ok(
  validateWorkflowHandoff({ ...productFlow, responsibleParty: "" }).some((error) => error.includes("responsibleParty")),
  "workflow handoff requires the Job Order's responsible party",
);
assert.ok(
  validateWorkflowHandoff({ ...productFlow, target: "foundry-producer", implementationHall: "Production" }).some((error) => error.includes("Forge")),
  "Foundry producer work routes to Forge",
);
assert.ok(
  validateWorkflowHandoff({ ...productFlow, assay: { verdict: "attention" }, ward: { outcome: "merge-integration", repairs: 0 } }).some((error) => error.includes("Assay pass")),
  "Ward cannot merge without a passing Assay verdict",
);
assert.ok(
  validateWorkflowHandoff({ ...productFlow, ward: { outcome: "repair", repairs: 2 } }).some((error) => error.includes("one repair")),
  "Ward cannot make a second autonomous repair",
);
assert.ok(
  validateWorkflowHandoff({ ...productFlow, ward: { outcome: "merge-main", repairs: 0 } }).some((error) => error.includes("integration")),
  "Ward cannot promote main",
);
assert.ok(
  validateWorkflowHandoff({ ...productFlow, productization: true }).some((error) => error.includes("Shipping")),
  "declared producer productization requires Shipping metadata",
);

console.log("ok - Orchestration workflow handoff passed");
