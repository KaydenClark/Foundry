import { Check, Circle, Eye, LockKey, Play } from "@phosphor-icons/react";

import { deriveWorkflowProofPresentation } from "../domain/workflowProof.js";
import { useRun } from "../store/RunContext.jsx";

const STATE_ICONS = Object.freeze({ complete: Check, active: Play, queued: Circle });

function compactBand(values) {
  if (values.length <= 2) return values.join(" · ");
  return `${values[0]} → ${values.at(-1)}`;
}

export function WorkflowExecutionRail({ focusedStepId, onFocusStep }) {
  const { scenario, run } = useRun();
  const proof = deriveWorkflowProofPresentation(scenario, run);

  return (
    <aside className="workflow-execution-rail" aria-label="Job Order steps, Governance Plane, and Clearance">
      <header>
        <div><span>SELECTED WORKFLOW</span><strong>{scenario.title}</strong></div>
        <div><span>JOB ORDER ID</span><strong>{run.jobOrder.id}</strong></div>
      </header>
      <div className="workflow-rail-columns" aria-hidden="true">
        <span>JOB ORDER STEPS</span><span>GOVERNANCE PLANE</span><span>CLEARANCE</span>
      </div>
      <ol>
        {proof.steps.map((item) => {
          const StateIcon = STATE_ICONS[item.state];
          const focused = item.id === focusedStepId;
          const live = item.index === run.stepIndex;
          return (
            <li key={item.id} className={`is-${item.state} ${focused ? "is-focused" : ""} ${live ? "is-live" : ""}`} style={{ "--plane": item.plane.color }}>
              <button type="button" onClick={() => onFocusStep(item.id)} aria-current={live ? "step" : undefined}>
                <span className="workflow-step-number">{String(item.index + 1).padStart(2, "0")}</span>
                <span className="workflow-step-title"><strong>{item.title}</strong><small><StateIcon weight="bold" aria-hidden="true" /> {item.state}</small></span>
                <span className="workflow-step-plane"><i aria-hidden="true" /> <b>F{item.plane.floor}</b><small>{item.plane.label}</small></span>
                <span className="workflow-step-clearance"><small><Eye aria-hidden="true" /> READ</small><b>{compactBand(item.clearance.read)}</b><small><LockKey aria-hidden="true" /> WRITE</small><b>{compactBand(item.clearance.write)}</b></span>
              </button>
              {focused && (
                <div className="workflow-step-detail">
                  <span>{live ? "CURRENT ACTION" : "INSPECTED ACTION"}</span>
                  <p>{item.description}</p>
                  <small>{item.worker} · Clearance caps this simulated Job Order; it does not grant authority.</small>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
