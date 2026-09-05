const STEP_PRODUCERS = Object.freeze({
  "mirror-route": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "capture-intent": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "attach-context": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "ground-candidate": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "issue-order": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "enter-actuality": Object.freeze({ kind: "Product/project", hall: "Production" }),
  "stage-actuality-workspace": Object.freeze({ kind: "Product/project", hall: "Production" }),
  "perform-audit": Object.freeze({ kind: "Product/project", hall: "Production" }),
  "ground-results": Object.freeze({ kind: "Product/project", hall: "Production" }),
  "canon-disposition": Object.freeze({ kind: "Product/project", hall: "Production" }),
  "retain-lesson": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "dispose-intent": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
  "refresh-mirror": Object.freeze({ kind: "Foundry producer", hall: "Forge" }),
});

const OPTIONAL_PASSAGES = Object.freeze([
  Object.freeze({ hall: "Design", optional: true }),
  Object.freeze({ hall: "Knowledge", optional: true }),
  Object.freeze({ hall: "Scheduling", optional: true }),
]);

function stepIndex(scenario, stepId) {
  return scenario.steps.findIndex((step) => step.id === stepId);
}

export function deriveWorkflowFoundrySemantics(scenario, run) {
  if (!scenario?.steps?.length || !Number.isInteger(run?.stepIndex) || !Array.isArray(run?.trace)) {
    throw new TypeError("Foundry semantics requires deterministic scenario and Run state.");
  }
  const step = scenario.steps[run.stepIndex];
  const producer = STEP_PRODUCERS[step?.id];
  if (!producer) throw new RangeError(`Foundry semantics refuses unknown step: ${step?.id ?? "missing"}.`);

  const receiptRecorded = run.stepIndex >= stepIndex(scenario, "ground-candidate");
  const validationComplete = run.stepIndex >= stepIndex(scenario, "issue-order");
  const assayPassed = run.stepIndex >= stepIndex(scenario, "ground-results");
  const repairsUsed = Math.min(Math.max(0, Number(run.tripCount) || 0), 1);

  return Object.freeze({
    stepId: step.id,
    passage: Object.freeze([
      Object.freeze({ hall: "Gatehouse", receipt: "append-only", status: receiptRecorded ? "recorded" : "awaiting" }),
      Object.freeze({ hall: "Validation", authority: "read-only finding", status: validationComplete ? "emitted to Orchestration" : "awaiting receipt" }),
      Object.freeze({ hall: "Gauge", authority: "observe-only", writesActuality: false, status: validationComplete ? "observing receipt activity" : "standby" }),
    ]),
    producer,
    optionalPassages: OPTIONAL_PASSAGES,
    assay: Object.freeze({ status: assayPassed ? "passed" : "awaiting read-only verdict" }),
    ward: Object.freeze({ maxRepairs: 1, repairsUsed, status: assayPassed ? "eligible after Assay pass" : "blocked pending Assay pass" }),
    integration: Object.freeze({ target: "integration", main: "owner-only; not performed" }),
    shipping: Object.freeze({ status: "provisional", declaredProducer: producer.hall }),
  });
}
