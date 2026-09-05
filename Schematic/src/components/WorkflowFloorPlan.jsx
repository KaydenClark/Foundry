import {
  Buildings,
  Clock,
  Cube,
  MapPin,
  Plug,
  ShieldCheck,
  UserGear,
} from "@phosphor-icons/react";

import { deriveWorkflowProofPresentation } from "../domain/workflowProof.js";
import { formatSimulationTime } from "../domain/workflowPresentation.js";
import { useRun } from "../store/RunContext.jsx";

const ZONES = Object.freeze([
  { id: "halls", label: "HALLS", icon: Buildings },
  { id: "modules", label: "MODULES", icon: Cube },
]);

export function WorkflowFloorPlan({ focusedStepIndex, focusIsLive }) {
  const { scenario, run } = useRun();
  const proof = deriveWorkflowProofPresentation(scenario, run, focusedStepIndex);
  const { current } = proof;
  const socketActive = current.step.structuralClasses?.includes("sockets");

  return (
    <section className="workflow-floor-plan" aria-label="One top-down Foundry plan">
      <header>
        <div><span>FOUNDRY FLOOR PLAN</span><strong>{focusIsLive ? "ACTIVE SIMULATION" : "FOCUSED"} · {current.step.title}</strong></div>
        <b style={{ "--plane": current.plane.color }}>F{current.plane.floor} · {current.plane.label}</b>
      </header>

      <div className="workflow-live-strip">
        <div><span>CURRENT WORKER</span><strong><UserGear aria-hidden="true" /> {current.worker}</strong><small>{current.location}</small></div>
        <div><span>PASSAGE STATE</span><strong><ShieldCheck aria-hidden="true" /> {proof.receipt.result}</strong><small>{current.gate}</small></div>
        <div className="workflow-receipt"><span>LATEST PASSAGE RECEIPT / APPEND-ONLY</span><strong>{proof.receipt.id}</strong><small>{proof.receipt.message}</small></div>
      </div>

      <div className="workflow-map" aria-label={`Job Order at ${current.token.target}`}>
        <svg
          className={`workflow-socket-network ${socketActive ? "is-active" : ""}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label="Sockets connect Halls, Workspace, and Modules"
        >
          <g className="socket-conduit socket-conduit-left">
            <path d="M 28 35 H 32 V 42 H 36" />
            <path d="M 28 47 H 36" />
            <path d="M 28 59 H 32 V 52 H 36" />
            <rect x="27.4" y="32.8" width="1.2" height="4.4" />
            <rect x="27.4" y="44.8" width="1.2" height="4.4" />
            <rect x="27.4" y="56.8" width="1.2" height="4.4" />
            <rect x="35.4" y="39.8" width="1.2" height="4.4" />
            <rect x="35.4" y="44.8" width="1.2" height="4.4" />
            <rect x="35.4" y="49.8" width="1.2" height="4.4" />
          </g>
          <g className="socket-conduit socket-conduit-right">
            <path d="M 68 35 H 72 V 42 H 76" />
            <path d="M 68 47 H 76" />
            <path d="M 68 59 H 72 V 52 H 76" />
            <rect x="67.4" y="32.8" width="1.2" height="4.4" />
            <rect x="67.4" y="44.8" width="1.2" height="4.4" />
            <rect x="67.4" y="56.8" width="1.2" height="4.4" />
            <rect x="75.4" y="39.8" width="1.2" height="4.4" />
            <rect x="75.4" y="44.8" width="1.2" height="4.4" />
            <rect x="75.4" y="49.8" width="1.2" height="4.4" />
          </g>
        </svg>
        <svg className="workflow-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d={`M 51 45 L ${current.token.x} ${current.token.y}`} />
        </svg>
        {ZONES.map(({ id, label, icon: Icon }) => {
          const active = current.step.structuralClasses?.includes(id);
          return (
            <article className={`workflow-zone zone-${id} ${active ? "is-active" : ""}`} key={id}>
              <div className="workflow-zone-machinery" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
              <Icon weight="duotone" aria-hidden="true" />
              <strong>{label}</strong>
              <small>{active ? "ACTIVE IN THIS STEP" : "STANDBY"}</small>
            </article>
          );
        })}
        <article className="workflow-zone zone-workspace is-active">
          <div className="workflow-workspace-core" aria-hidden="true"><i /><i /><i /></div>
          <MapPin weight="duotone" aria-hidden="true" />
          <strong>WORKSPACE</strong>
          <small>{current.location}</small>
        </article>
        <div className={`workflow-socket-legend ${socketActive ? "is-active" : ""}`}>
          <Plug weight="duotone" aria-hidden="true" />
          <span><strong>SOCKETS</strong><small>TYPED CONDUITS · PORTS</small></span>
        </div>
        <div
          className={`workflow-job-token ${run.status === "running" ? "is-moving" : ""}`}
          style={{ "--token-x": `${current.token.x}%`, "--token-y": `${current.token.y}%` }}
          aria-label={`Job Order ${run.jobOrder.id} at ${current.token.target}`}
        ><span /></div>
        <div className="workflow-map-caption"><span>ONE PLAN · ONE JOB ORDER</span><strong>{run.jobOrder.id}</strong></div>
      </div>

      <div className="workflow-progress" aria-label={`${proof.progress.completed} of ${proof.progress.total} steps complete`}>
        <div><span>PROGRESS</span><strong>{proof.progress.completed} / {proof.progress.total} STEPS</strong></div>
        <i><span style={{ width: `${proof.progress.percent}%` }} /></i>
        <b><Clock aria-hidden="true" /> {formatSimulationTime(proof.elapsedMs)}</b>
      </div>

      <div className="workflow-proof-trace">
        <header><span>RECENT EVENT TRACE / APPEND-ONLY</span><small>{run.trace.length} EVENTS</small></header>
        <ol>
          {proof.trace.map((event) => (
            <li key={event.id}><time>{formatSimulationTime(event.elapsedMs)}</time><b>{event.id}</b><span>{event.message}</span></li>
          ))}
        </ol>
      </div>
    </section>
  );
}
