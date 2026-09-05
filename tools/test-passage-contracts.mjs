#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validatePassageReceipt,
  validateValidationFinding,
  validateGaugeActivity,
} from "./passage-contracts.mjs";

const receiptContract = JSON.parse(readFileSync(new URL("../Halls/Gatehouse/contracts/passage-receipt.json", import.meta.url), "utf8"));

const receipt = {
  id: "A1B2C3",
  jobOrderId: "D4E5F6",
  responsibleParty: "Foundry/Halls/Production",
  actor: "Pawn",
  timestamp: "2026-08-12T12:00:00.000Z",
  source: "Intent",
  destination: "Canon",
  clearanceBand: "standard",
  scope: "S-001/TK-003",
  purpose: "Record the contract passage",
  scanResult: "recorded",
};
assert.deepEqual(receiptContract.required, Object.keys(receipt), "declared Gatehouse receipt fields match the runtime validator contract");
assert.deepEqual(validatePassageReceipt(receipt), [], "complete Gatehouse receipt validates");
assert.ok(validatePassageReceipt({ ...receipt, actor: "" }).some((error) => error.includes("actor")), "receipt requires the scanning actor");
assert.ok(validatePassageReceipt({ ...receipt, id: "7M2Q" }).some((error) => error.includes("six-character")), "receipt cannot use an architectural ID");
assert.ok(validatePassageReceipt({ ...receipt, jobOrderId: "7M2Q" }).some((error) => error.includes("jobOrderId must be a six-character")), "receipt requires a six-character Job Order identity");
assert.ok(validatePassageReceipt({ ...receipt, responsibleParty: "" }).some((error) => error.includes("responsibleParty")), "receipt requires the Job Order's responsible party");

const finding = {
  id: "G7H8J9",
  receiptId: receipt.id,
  status: "attention",
  findings: ["scope record is incomplete"],
};
assert.deepEqual(validateValidationFinding(finding), [], "read-only Validation finding validates");
assert.ok(validateValidationFinding({ ...finding, action: "reroute" }).some((error) => error.includes("read-only")), "Validation cannot carry an action");
assert.ok(validateValidationFinding({ ...finding, receiptId: "3P7X" }).some((error) => error.includes("receiptId must be a six-character")), "finding remains bound to a runtime receipt identity");

const activity = {
  id: "K1L2M3",
  receiptId: receipt.id,
  channel: "cic",
  kind: "passage-recorded",
  actionable: false,
};
assert.deepEqual(validateGaugeActivity(activity), [], "Gauge CIC activity validates");
assert.ok(validateGaugeActivity({ ...activity, canonWrite: true }).some((error) => error.includes("cannot write")), "Gauge cannot carry Canon writes");
assert.ok(validateGaugeActivity({ ...activity, receiptId: "3P7X" }).some((error) => error.includes("receiptId must be a six-character")), "Gauge activity remains bound to a runtime receipt identity");

console.log("ok - Gatehouse, Validation, and Gauge passage contracts passed");
