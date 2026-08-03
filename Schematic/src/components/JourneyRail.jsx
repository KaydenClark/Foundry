import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Circle,
  TrafficSign,
} from "@phosphor-icons/react";

import { getPlane } from "../domain/scenario.js";
import { useRun } from "../store/RunContext.jsx";

export function JourneyRail({ compact = false }) {
  const { scenario, run } = useRun();

  return (
    <section className={`journey-rail ${compact ? "is-compact" : ""}`} aria-label="Controlled Job Order journey">
      <header className="section-heading">
        <span>WORKFLOW / JOURNEY</span>
        <strong>{scenario.title}</strong>
        <small>{scenario.summary}</small>
      </header>
      <ol className="journey-steps">
        {scenario.steps.map((step, index) => {
          const plane = getPlane(step.planeId);
          const active = index === run.stepIndex;
          const complete = index < run.stepIndex;
          const DirectionIcon = step.direction === "up" ? ArrowUp : ArrowDown;
          return (
            <li key={step.id} className={active ? "is-active" : complete ? "is-complete" : ""}>
              <article style={{ "--plane-color": plane.color }}>
                <span className="journey-number">{String(index + 1).padStart(2, "0")}</span>
                {complete ? <CheckCircle size={20} weight="fill" aria-hidden="true" /> : <Circle size={20} weight={active ? "fill" : "regular"} aria-hidden="true" />}
                <div>
                  <small>{plane.label.toUpperCase()} · {step.worker}</small>
                  <strong>{step.title}</strong>
                </div>
                <DirectionIcon size={16} weight="bold" aria-label={step.direction} />
              </article>
              {index < scenario.steps.length - 1 && (
                <div className={`crossing-band ${run.status === "tripped" && active ? "is-tripped" : ""}`}>
                  <TrafficSign size={12} weight="fill" aria-hidden="true" />
                  <span>{run.status === "tripped" && active ? "CROSSING HELD" : "GATEHOUSE CROSSING"}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
