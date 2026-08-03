import {
  Factory,
  Hammer,
  Megaphone,
  Scales,
  TrafficSign,
} from "@phosphor-icons/react";

import { governancePlanes } from "../domain/scenario.js";
import { useRun } from "../state/RunContext.jsx";

const rooms = [
  { id: "ward", label: "WARD", sub: "REPORTS AFTER ASSAY", icon: Megaphone },
  { id: "gatehouse", label: "GATEHOUSE", sub: "WATCHES STRUCTURE", icon: TrafficSign },
  { id: "workspace", label: "MAIN FOUNDRY WORKSPACE", sub: "PROJECT WORK LIVES HERE", icon: Factory },
  { id: "forge", label: "FORGE", sub: "BUILDS PRODUCT SOURCE", icon: Hammer },
  { id: "assay", label: "ASSAY", sub: "CHECKS EVIDENCE", icon: Scales },
];

function FloorPlate({ plane, active, run, compact }) {
  const isMirror = plane.id === "projection";
  const isActuality = plane.id === "actuality";
  const tokenHere = run.jobOrder.planeId === plane.id;
  const offset = Math.abs(3.5 - plane.floor) * (compact ? 2 : 5);

  return (
    <div
      className={`factory-floor ${active ? "is-active" : ""} ${isMirror ? "is-mirror" : ""} ${isActuality ? "is-actuality" : ""}`}
      style={{ "--plane": plane.color, "--floor-offset": `${offset}px` }}
      data-floor={plane.floor}
    >
      <div className="floor-label">
        <span>{String(plane.floor).padStart(2, "0")}</span>
        <strong>{plane.label.toUpperCase()}</strong>
        <small>{isMirror ? "MIRROR" : plane.qualifier.toUpperCase()}</small>
      </div>
      <div className="floor-plate">
        <div className="passageway horizontal" aria-hidden="true" />
        <div className="passageway vertical" aria-hidden="true" />
        {rooms.map((room) => {
          const Icon = room.icon;
          return (
            <div className={`floor-room room-${room.id}`} key={room.id}>
              <Icon size={compact ? 12 : 16} weight="duotone" aria-hidden="true" />
              <strong>{room.label}</strong>
              {!compact && <small>{room.sub}</small>}
              {isMirror && room.id === "workspace" && (
                <div className="mirror-bars" aria-label="Five lower floors mirrored">
                  {governancePlanes.slice(1).map((lower) => <i key={lower.id} style={{ "--mirror": lower.color }} />)}
                </div>
              )}
            </div>
          );
        })}
        {tokenHere && (
          <div className={`job-token ${run.status === "running" ? "is-moving" : ""}`} aria-label={`Job Order on ${plane.label}`}>
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

export function FactoryStack({ compact = false }) {
  const { run, progress } = useRun();

  return (
    <section className={`factory-stack ${compact ? "is-compact" : ""}`} aria-label="Six-floor Foundry governance factory">
      <header className="stack-heading">
        <div>
          <span>FOUNDRY / SIX-STOREY FACTORY</span>
          <small>SAME FLOOR PLAN · SIX GOVERNANCE PLANES</small>
        </div>
        <b>{Math.round(progress * 100)}% ROUTE</b>
      </header>
      <div className="stack-canvas">
        <div className="vertical-route" aria-hidden="true">
          <span />
        </div>
        {governancePlanes.map((plane, index) => (
          <div className="floor-with-crossing" key={plane.id}>
            <FloorPlate plane={plane} active={run.jobOrder.planeId === plane.id} run={run} compact={compact} />
            {index < governancePlanes.length - 1 && (
              <div className={`vertical-crossing ${run.status === "tripped" && run.jobOrder.planeId === plane.id ? "is-tripped" : ""}`}>
                <span>GATEHOUSE CROSSING</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <footer className="stack-legend">
        <span><i className="legend-token" /> JOB ORDER TOKEN · {run.id}</span>
        <span>PROJECTION MIRRORS 05 FLOORS · ACTUALITY EXECUTES 00 EFFECTS</span>
      </footer>
    </section>
  );
}
