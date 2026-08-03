import { ArrowDown, ArrowUp, Play } from "@phosphor-icons/react";

import { PageHeading } from "../components/PageHeading.jsx";
import { getPlane } from "../domain/scenario.js";
import { useRun } from "../state/RunContext.jsx";

export function WorkflowsPage({ navigate }) {
  const { scenario, run } = useRun();

  return (
    <div className="content-page workflows-page">
      <PageHeading
        meta="WORKFLOW LIBRARY / VERSIONED SEED"
        title="Feedback audit harness"
        description="The first complete workflow proves the governance circuit, worker handoff, trip response, and return to a fresh Projection without touching a live system."
        action={<button className="primary-action" type="button" onClick={() => navigate("/run")}><Play size={19} weight="fill" aria-hidden="true" /> PLAY THIS WORKFLOW</button>}
      />

      <section className="workflow-summary-band">
        <div><span>SCENARIO</span><strong>{scenario.id}</strong></div>
        <div><span>SCHEMA</span><strong>V{scenario.schemaVersion}</strong></div>
        <div><span>STAGES</span><strong>{scenario.steps.length}</strong></div>
        <div><span>ACTIVE RUN</span><strong>{run.id}</strong></div>
        <div className="boundary"><span>BOUNDARY</span><strong>{scenario.boundary}</strong></div>
      </section>

      <ol className="workflow-table" aria-label="Feedback audit stages">
        {scenario.steps.map((step, index) => {
          const plane = getPlane(step.planeId);
          const Direction = step.direction === "up" ? ArrowUp : ArrowDown;
          return (
            <li key={step.id} className={index === run.stepIndex ? "is-active" : ""} style={{ "--plane": plane.color }}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Direction size={17} weight="bold" aria-label={step.direction} />
              <div><small>{String(plane.floor).padStart(2, "0")} · {plane.label.toUpperCase()}</small><strong>{step.title}</strong></div>
              <p>{step.description}</p>
              <b>{step.worker}</b>
              <em>{step.location}</em>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
