import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Circle,
  TrafficSign,
} from "@phosphor-icons/react";

import { getPlane } from "../domain/scenario.js";
import { useRun } from "../store/RunContext.jsx";

export function JourneyRail({ compact = false, focusedStepId = null, onFocusStep }) {
  const { scenario, run } = useRun();
  const stepIndexes = new Map(scenario.steps.map((step, index) => [step.id, index]));
  const focusedStep = scenario.steps.find((step) => step.id === focusedStepId) ?? scenario.steps[run.stepIndex];

  return (
    <section className={`journey-rail ${compact ? "is-compact" : ""}`} aria-label="Job Order specs and tasks">
      <header className="section-heading">
        <span>JOB ORDER / SPECS + TASKS</span>
        <strong>{scenario.title}</strong>
        <small>{scenario.jobOrder.id} · {scenario.summary}</small>
      </header>
      <div className="journey-steps">
        {scenario.jobOrder.specs.map((spec) => {
          const liveSpec = spec.id === run.jobOrder.specId;
          const focusedSpec = spec.id === focusedStep.specId;
          return (
            <section className={`job-order-spec ${liveSpec ? "is-live" : ""} ${focusedSpec ? "is-focused" : ""}`} key={spec.id}>
              <header>
                <span>{spec.id}</span>
                <strong>{spec.title}</strong>
                {liveSpec && <b>CURRENT SPEC</b>}
              </header>
              <ol>
                {spec.tasks.map((task) => {
                  const step = scenario.steps[stepIndexes.get(task.stepId)];
                  const index = stepIndexes.get(step.id);
                  const plane = getPlane(step.planeId);
                  const live = index === run.stepIndex;
                  const focused = focusedStepId ? step.id === focusedStepId : live;
                  const complete = index < run.stepIndex;
                  const DirectionIcon = step.direction === "up" ? ArrowUp : ArrowDown;
                  return (
                    <li key={step.id} className={`${live ? "is-live" : ""} ${focused ? "is-focused" : ""} ${complete ? "is-complete" : ""}`}>
                      <button
                        type="button"
                        className="journey-card"
                        style={{ "--plane-color": plane.color }}
                        aria-pressed={focused}
                        aria-current={live ? "step" : undefined}
                        aria-label={`Focus ${spec.id} ${task.id}: ${step.title} on ${plane.label} at ${step.location}`}
                        onClick={() => onFocusStep?.(step.id)}
                      >
                        <span className="journey-number">{task.id.replace("SIM-TK-", "")}</span>
                        {complete ? <CheckCircle size={20} weight="fill" aria-hidden="true" /> : <Circle size={20} weight={live ? "fill" : "regular"} aria-hidden="true" />}
                        <div>
                          <small>{task.id} · {plane.label.toUpperCase()}</small>
                          <strong>{task.title}</strong>
                          <em>{step.location}</em>
                        </div>
                        <DirectionIcon size={16} weight="bold" aria-label={step.direction} />
                      </button>
                      {index < scenario.steps.length - 1 && (
                        <div className={`crossing-band ${run.status === "tripped" && live ? "is-tripped" : ""}`}>
                          <TrafficSign size={12} weight="fill" aria-hidden="true" />
                          <span>{run.status === "tripped" && live ? "CROSSING HELD" : "GATEHOUSE CROSSING"}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </section>
  );
}
