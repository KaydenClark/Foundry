import { ArrowRight, Check } from "@phosphor-icons/react";

import { useRun } from "../store/RunContext.jsx";

const PICKER_LABELS = Object.freeze({
  "job-order-flight": "Job Order Flight",
  "create-and-assign": "Create & Assign",
  "producer-update": "Producer Update",
  "feedback-audit": "Harness Review",
  "release-recovery": "Release Recovery",
});

export function WorkflowScenarioPicker() {
  const { premadeScenarios, scenario, selectScenario } = useRun();

  return (
    <section className="workflow-scenario-picker" aria-label="Premade Workflow simulations">
      {premadeScenarios.map((candidate, index) => {
        const active = candidate.id === scenario.id;
        return (
          <button
            key={candidate.id}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            onClick={() => selectScenario(candidate.id)}
            disabled={active}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{PICKER_LABELS[candidate.id] ?? candidate.title}</strong>
            <small>{candidate.steps.length} governed steps</small>
            {active ? <Check weight="bold" aria-hidden="true" /> : <ArrowRight weight="bold" aria-hidden="true" />}
          </button>
        );
      })}
    </section>
  );
}
