import { Cube, IdentificationBadge, ShieldCheck, WarningDiamond } from "@phosphor-icons/react";

import { getPlane } from "../domain/scenario.js";
import { useRun } from "../store/RunContext.jsx";

function formatElapsed(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const tenths = Math.floor((milliseconds % 1000) / 100);
  return `T+${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function RunInspector({ traceLimit = 7, focusedStep = null, focusIsLive = true, onReturnLive }) {
  const { run, scenario } = useRun();
  const plane = getPlane(run.jobOrder.planeId);
  const trace = run.trace.slice(-traceLimit).reverse();

  return (
    <aside className="run-inspector" aria-label="Job Order inspector">
      <header className="section-heading">
        <span>JOB ORDER INSPECTOR</span>
        <strong>{run.jobOrder.id}</strong>
      </header>
      <dl className="inspector-grid">
        {focusedStep && (
          <div className="span-two inspector-focus">
            <dt>{focusIsLive ? "Viewing active simulation" : "Focused task"}</dt>
            <dd>
              <span>{focusedStep.title}</span>
              {!focusIsLive && <button type="button" onClick={onReturnLive}>RETURN TO ACTIVE</button>}
            </dd>
          </div>
        )}
        <div><dt>Workflow</dt><dd>{scenario.title}</dd></div>
        <div><dt>State</dt><dd className={`value-${run.status}`}>{run.status.toUpperCase()}</dd></div>
        <div><dt>Current spec</dt><dd>{run.jobOrder.specId}</dd></div>
        <div><dt>Current task</dt><dd>{run.jobOrder.taskId}</dd></div>
        <div><dt>Current plane</dt><dd style={{ color: plane.color }}>{String(plane.floor).padStart(2, "0")} {plane.label}</dd></div>
        <div><dt>Location</dt><dd>{run.jobOrder.location}</dd></div>
        <div><dt>Worker</dt><dd><IdentificationBadge size={16} aria-hidden="true" /> {run.jobOrder.worker}</dd></div>
        <div><dt>Gate result</dt><dd className={run.jobOrder.gateResult === "held" ? "value-tripped" : "value-clear"}><ShieldCheck size={16} aria-hidden="true" /> {run.jobOrder.gateResult}</dd></div>
        <div className="span-two"><dt>Earned access</dt><dd>{run.jobOrder.earnedAccess.length ? run.jobOrder.earnedAccess.join(" · ") : "NONE"}</dd></div>
        <div className="span-two"><dt>Evidence</dt><dd><Cube size={16} aria-hidden="true" /> {run.jobOrder.evidence.join(" · ")}</dd></div>
      </dl>

      {run.status === "tripped" && (
        <div className="trip-notice" role="status">
          <WarningDiamond size={22} weight="fill" aria-hidden="true" />
          <div><strong>CROSSING HELD</strong><span>GATEHOUSE SIGNAL → ASSAY CHECK → WARD REPORT</span></div>
        </div>
      )}

      <section className="trace-panel">
        <header><span>APPEND-ONLY TRACE</span><small>{run.trace.length} EVENTS</small></header>
        <ol>
          {trace.map((event) => (
            <li key={`${event.id}-${event.kind}`} className={event.kind.includes("trip") || event.kind.includes("signal") || event.kind.includes("check") || event.kind.includes("report") ? "is-trip" : ""}>
              <div><b>{event.id}</b><span>{formatElapsed(event.elapsedMs)}</span></div>
              <strong>{event.kind.replaceAll("-", " ")}</strong>
              <p>{event.message}</p>
              <small>{event.specId} · {event.taskId} · {event.planeId.toUpperCase()} · {event.worker}</small>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
