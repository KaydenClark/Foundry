#!/usr/bin/env node

const RUNTIME_ID = /^[A-Z0-9]{6}$/;
const OPTIONAL_PASSAGES = new Set(["Design", "Knowledge", "Scheduling"]);

export function validateWorkflowHandoff(handoff) {
  const errors = [];
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return ["workflow handoff must be an object"];
  if (!RUNTIME_ID.test(handoff.jobOrderId ?? "")) errors.push("jobOrderId must be a six-character runtime identity");
  if (typeof handoff.responsibleParty !== "string" || !handoff.responsibleParty.trim()) {
    errors.push("responsibleParty must be a non-empty string");
  }
  if (!["foundry-producer", "product", "project"].includes(handoff.target)) {
    errors.push("target must be foundry-producer, product, or project");
  }
  const expectedImplementation = handoff.target === "foundry-producer" ? "Forge" : "Production";
  if (handoff.implementationHall !== expectedImplementation) {
    errors.push(`${handoff.target ?? "unknown"} work must route to ${expectedImplementation}`);
  }
  if (!Array.isArray(handoff.optionalPassages) || handoff.optionalPassages.some((passage) => !OPTIONAL_PASSAGES.has(passage))) {
    errors.push("optionalPassages may contain only Design, Knowledge, or Scheduling");
  }
  if (typeof handoff.scheduled !== "boolean") errors.push("scheduled must be boolean");
  if (handoff.scheduled && !handoff.optionalPassages?.includes("Scheduling")) {
    errors.push("scheduled work must include the optional Scheduling passage");
  }
  if (!handoff.implementation || typeof handoff.implementation.commit !== "string" || !handoff.implementation.commit || typeof handoff.implementation.pullRequest !== "string" || !handoff.implementation.pullRequest) {
    errors.push("implementation output must include commit and pullRequest");
  }
  const verdict = handoff.assay?.verdict;
  if (!["pass", "attention", "unverified"].includes(verdict)) errors.push("Assay verdict must be pass, attention, or unverified");
  const ward = handoff.ward;
  if (!ward || !["merge-integration", "repair", "return-production"].includes(ward.outcome)) {
    errors.push("Ward outcome must be merge-integration, repair, or return-production");
  } else {
    if (!Number.isInteger(ward.repairs) || ward.repairs < 0 || ward.repairs > 1) errors.push("Ward may make at most one repair");
    if (ward.outcome === "merge-integration" && verdict !== "pass") errors.push("Ward merge-integration requires an Assay pass verdict");
    if (ward.outcome === "repair" && ward.repairs !== 1) errors.push("Ward repair outcome must record one repair");
  }
  if (handoff.productization !== true && handoff.productization !== false) {
    errors.push("productization must be boolean");
  } else if (handoff.productization) {
    if (!handoff.shipping || handoff.shipping.declaredProducer !== true || typeof handoff.shipping.artifact !== "string" || !handoff.shipping.artifact) {
      errors.push("declared producer productization requires Shipping metadata");
    }
  }
  return errors;
}
