function required(value, label, errors) {
  const valid = typeof value === "string" && value.trim() !== "";
  if (!valid) errors.push(`${label} is required.`);
  return valid;
}

export function validateScenarioJobOrder(scenario) {
  const errors = [];
  if (!scenario || typeof scenario !== "object") return ["Scenario is required."];
  if (!Array.isArray(scenario.steps)) errors.push("Scenario steps must be an array.");
  if (!scenario.jobOrder || !Array.isArray(scenario.jobOrder.specs)) errors.push("Scenario Job Order specs must be an array.");
  if (errors.length) return errors;
  required(scenario.jobOrder.id, "Scenario Job Order id", errors);
  required(scenario.jobOrder.title, "Scenario Job Order title", errors);

  const stepsById = new Map();
  for (const [stepIndex, step] of scenario.steps.entries()) {
    if (!step || typeof step !== "object") {
      errors.push(`Scenario step ${stepIndex} must be an object.`);
      continue;
    }
    const hasStepId = required(step.id, `Scenario step ${stepIndex} id`, errors);
    if (!hasStepId) continue;
    if (stepsById.has(step.id)) errors.push(`Duplicate step id: ${step.id}.`);
    else stepsById.set(step.id, step);
  }
  const specIds = new Set();
  const taskIds = new Set();
  const resolvedStepIds = new Set();

  for (const [specIndex, spec] of scenario.jobOrder.specs.entries()) {
    if (!spec || typeof spec !== "object") {
      errors.push(`Job Order spec ${specIndex} must be an object.`);
      continue;
    }
    const hasSpecId = required(spec.id, `Job Order spec ${specIndex} id`, errors);
    required(spec.title, `Job Order spec ${specIndex} title`, errors);
    if (hasSpecId) {
      if (specIds.has(spec.id)) errors.push(`Duplicate spec id: ${spec.id}.`);
      specIds.add(spec.id);
    }
    const specLabel = hasSpecId ? spec.id : specIndex;
    if (!Array.isArray(spec.tasks) || spec.tasks.length === 0) {
      errors.push(`Job Order spec ${specLabel} must contain tasks.`);
      continue;
    }

    for (const [taskIndex, task] of spec.tasks.entries()) {
      if (!task || typeof task !== "object") {
        errors.push(`Task ${taskIndex} in ${specLabel} must be an object.`);
        continue;
      }
      const hasTaskId = required(task.id, `Task ${taskIndex} in ${specLabel} id`, errors);
      required(task.title, `Task ${taskIndex} in ${specLabel} title`, errors);
      const taskLabel = hasTaskId ? task.id : taskIndex;
      const hasTaskStepId = required(task.stepId, `Task ${taskLabel} stepId`, errors);
      if (hasTaskId) {
        if (taskIds.has(task.id)) errors.push(`Duplicate task id: ${task.id}.`);
        taskIds.add(task.id);
      }

      if (!hasTaskStepId) continue;

      const step = stepsById.get(task.stepId);
      if (!step) {
        errors.push(`Task ${task.id} references missing step ${task.stepId}.`);
        continue;
      }
      resolvedStepIds.add(step.id);
      if (step.specId !== spec.id || step.taskId !== task.id) {
        errors.push(`Step ${step.id} does not resolve to ${spec.id}/${task.id}.`);
      }
    }
  }

  for (const step of scenario.steps) {
    if (step?.id && !resolvedStepIds.has(step.id)) errors.push(`Step ${step.id} does not resolve to a declared Job Order task.`);
  }
  return errors;
}

export function flattenJobOrder(scenario) {
  const errors = validateScenarioJobOrder(scenario);
  if (errors.length) throw new TypeError(errors.join("\n"));
  const stepsById = new Map(scenario.steps.map((step, index) => [step.id, { step, stepIndex: index }]));

  return scenario.jobOrder.specs.flatMap((spec, specIndex) => spec.tasks.map((task, taskIndex) => ({
    spec,
    specIndex,
    task,
    taskIndex,
    ...stepsById.get(task.stepId),
  })));
}

export function resolveCurrentWork(scenario, stepIndex) {
  const index = Number(stepIndex);
  if (!Number.isInteger(index) || index < 0 || index >= scenario.steps.length) {
    throw new RangeError("Current Job Order step index is out of range.");
  }
  const step = scenario.steps[index];
  const entry = flattenJobOrder(scenario).find((candidate) => candidate.step.id === step.id);
  if (!entry) throw new RangeError(`Step ${step.id} does not resolve to the Job Order.`);
  return entry;
}

export function resolveLocationRoom(location) {
  const normalized = String(location).toLowerCase();
  if (normalized.includes("assay")) return "assay";
  if (normalized.includes("forge")) return "forge";
  if (normalized.includes("ward")) return "ward";
  if (normalized.includes("gatehouse") || normalized.includes("entrance") || normalized.includes("exit")) return "gatehouse";
  return "workspace";
}
