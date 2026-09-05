#!/usr/bin/env node

const RUNTIME_ID = /^[A-Z0-9]{6}$/;
const RECEIPT_FIELDS = ["id", "jobOrderId", "responsibleParty", "actor", "timestamp", "source", "destination", "clearanceBand", "scope", "purpose", "scanResult"];
const FINDING_FIELDS = ["id", "receiptId", "status", "findings"];
const ACTIVITY_FIELDS = ["id", "receiptId", "channel", "kind", "actionable"];

function stringErrors(record, fields, label) {
  const errors = [];
  for (const field of fields) {
    if (typeof record?.[field] !== "string" || !record[field].trim()) errors.push(`${label}.${field} must be a non-empty string`);
  }
  return errors;
}

function unknownFieldErrors(record, allowed, label) {
  return Object.keys(record ?? {}).filter((field) => !allowed.includes(field)).map((field) => `${label} must not include '${field}'`);
}

function runtimeIdError(id, label, field = "id") {
  return RUNTIME_ID.test(id ?? "") ? [] : [`${label}.${field} must be a six-character runtime identity`];
}

export function validatePassageReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return ["passage receipt must be an object"];
  errors.push(...runtimeIdError(receipt.id, "passage receipt"));
  errors.push(...runtimeIdError(receipt.jobOrderId, "passage receipt", "jobOrderId"));
  errors.push(...stringErrors(receipt, RECEIPT_FIELDS.slice(1), "passage receipt"));
  errors.push(...unknownFieldErrors(receipt, RECEIPT_FIELDS, "passage receipt"));
  if (receipt?.scanResult !== "recorded" && receipt?.scanResult !== "blocked") {
    errors.push("passage receipt.scanResult must be recorded or blocked");
  }
  return errors;
}

export function validateValidationFinding(finding) {
  const errors = [];
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) return ["Validation finding must be an object"];
  errors.push(...runtimeIdError(finding.id, "Validation finding"));
  errors.push(...runtimeIdError(finding.receiptId, "Validation finding", "receiptId"));
  errors.push(...stringErrors(finding, ["receiptId", "status"], "Validation finding"));
  if (!Array.isArray(finding.findings) || !finding.findings.every((item) => typeof item === "string" && item.trim())) {
    errors.push("Validation finding.findings must be a string array");
  }
  if (!["clear", "attention", "unverified"].includes(finding.status)) {
    errors.push("Validation finding.status must be clear, attention, or unverified");
  }
  for (const field of Object.keys(finding)) {
    if (!FINDING_FIELDS.includes(field)) errors.push(`Validation is read-only and cannot include '${field}'`);
  }
  return errors;
}

export function validateGaugeActivity(activity) {
  const errors = [];
  if (!activity || typeof activity !== "object" || Array.isArray(activity)) return ["Gauge activity must be an object"];
  errors.push(...runtimeIdError(activity.id, "Gauge activity"));
  errors.push(...runtimeIdError(activity.receiptId, "Gauge activity", "receiptId"));
  errors.push(...stringErrors(activity, ["receiptId", "channel", "kind"], "Gauge activity"));
  if (typeof activity.actionable !== "boolean") errors.push("Gauge activity.actionable must be boolean");
  if (!["cic", "responsible-hall", "discord"].includes(activity.channel)) {
    errors.push("Gauge activity.channel must be cic, responsible-hall, or discord");
  }
  for (const field of Object.keys(activity)) {
    if (!ACTIVITY_FIELDS.includes(field)) errors.push(`Gauge cannot write Canon or Grounding via '${field}'`);
  }
  return errors;
}
