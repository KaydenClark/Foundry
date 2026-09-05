import { useRef } from "react";

import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CaretDown,
  CaretUp,
  CursorClick,
  Factory,
  Hammer,
  Megaphone,
  Package,
  Scales,
  TrafficSign,
} from "@phosphor-icons/react";

import actualityFloor from "../assets/factory/actuality-floor.png";
import governanceFloor from "../assets/factory/governance-floor.png";
import { governancePlanes } from "../domain/scenario.js";
import { useRun } from "../store/RunContext.jsx";
import { useView } from "../store/ViewContext.jsx";
import {
  ATLAS_FLOOR_TOPOLOGY,
  projectAtlasPoint,
  resolveAtlasGeometry,
  resolveAtlasRoute,
} from "../view/atlasTopology.js";
import "./factoryAtlas.css";
import { SchematicControls } from "./SchematicControls.jsx";

const roomIcons = Object.freeze({
  gatehouse: TrafficSign,
  ward: Megaphone,
  workspace: Factory,
  forge: Hammer,
  assay: Scales,
  shipping: Package,
});

const roomsById = new Map(ATLAS_FLOOR_TOPOLOGY.rooms.map((room) => [room.id, room]));

function crossingIsActive(route, boundaryIndex) {
  if (!route.crossing) return false;
  const fromIndex = governancePlanes.findIndex((plane) => plane.id === route.crossing.fromPlaneId);
  const toIndex = governancePlanes.findIndex((plane) => plane.id === route.crossing.toPlaneId);
  return boundaryIndex >= Math.min(fromIndex, toIndex) && boundaryIndex < Math.max(fromIndex, toIndex);
}

function selectionDetail(selection) {
  const plane = governancePlanes.find((candidate) => candidate.id === selection.planeId);
  const room = roomsById.get(selection.itemId);
  if (selection.kind === "room" && room) return `${plane?.label ?? selection.planeId} / ${room.label} — ${room.sub}`;
  if (selection.kind === "crossing") return `${plane?.label ?? selection.planeId} / Gatehouse Crossing`;
  if (selection.kind === "token") return `${plane?.label ?? selection.planeId} / Active Job Order token`;
  return `${plane?.label ?? selection.planeId} floor — ${plane?.summary ?? "Governance plane"}`;
}

function FloorPlate({ plane, live, focused, run, compact, route, yaw, geometry, hasCrossing, crossingActive, crossingTripped, selection, onSelect, structuralOverview }) {
  const isMirror = plane.id === "projection";
  const isActuality = plane.id === "actuality";
  const tokenHere = run.jobOrder.planeId === plane.id;
  const liveRoomId = live ? route.destination.roomId : null;
  const offset = Math.abs(3.5 - plane.floor) * (compact ? 1 : 3);
  const floorSelected = selection.kind === "floor" && selection.planeId === plane.id;
  const routeSegments = route.segments.filter((segment) => segment.planeId === plane.id);

  return (
    <div
      className={`factory-floor ${live ? "is-live" : ""} ${focused ? "is-focused" : ""} ${isMirror ? "is-mirror" : ""} ${isActuality ? "is-actuality" : ""}`}
      style={{ "--plane": plane.color, "--floor-offset": `${offset}px` }}
      data-floor={plane.floor}
      data-plane={plane.id}
    >
      <button
        className={`floor-label ${floorSelected ? "is-selected" : ""}`}
        type="button"
        aria-pressed={floorSelected}
        onClick={() => onSelect({ kind: "floor", planeId: plane.id, itemId: plane.id })}
      >
        <span>{String(plane.floor).padStart(2, "0")}</span>
        <strong>{plane.label.toUpperCase()}</strong>
        <small>{isMirror ? "MIRROR" : plane.qualifier.toUpperCase()}</small>
      </button>
      <div className="floor-plate">
        <img
          className="floor-asset"
          src={isActuality ? actualityFloor : governanceFloor}
          alt=""
          aria-hidden="true"
        />
        <div className="floor-rooms atlas-floor-plan">
          <svg className="atlas-passageways" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ATLAS_FLOOR_TOPOLOGY.passageways.map((passageway) => {
              const from = projectAtlasPoint(roomsById.get(passageway.fromRoomId).point, yaw);
              const to = projectAtlasPoint(roomsById.get(passageway.toRoomId).point, yaw);
              return <line key={`${passageway.fromRoomId}-${passageway.toRoomId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}
            {routeSegments.map((segment) => {
              const from = projectAtlasPoint(segment.from, yaw);
              const to = projectAtlasPoint(segment.to, yaw);
              return <line className="atlas-live-route" key={`${segment.planeId}-${segment.fromRoomId}-${segment.toRoomId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}
          </svg>
          {hasCrossing && (
            <i
              className={`atlas-crossing-anchor ${crossingActive ? "is-route-active" : ""} ${crossingTripped ? "is-tripped" : ""}`}
              style={{ "--crossing-x": `${geometry.gatehouseAnchor.x}%`, "--crossing-y": `${geometry.gatehouseAnchor.y}%` }}
              aria-hidden="true"
            />
          )}
          {geometry.rooms.map((room) => {
            const Icon = structuralOverview && room.id !== "gatehouse" ? Factory : (roomIcons[room.id] ?? Factory);
            const structuralLabel = "Halls";
            const structuralSub = "Native Factory spaces";
            return (
              <button
                className={`floor-room room-${room.id} ${room.status === "provisional" ? "is-provisional" : ""} ${selection.kind === "room" && selection.planeId === plane.id && selection.itemId === room.id ? "is-selected" : ""} ${liveRoomId === room.id ? "is-live-location" : ""}`}
                key={room.id}
                type="button"
                style={{ "--room-x": `${room.projectedPoint.x}%`, "--room-y": `${room.projectedPoint.y}%` }}
                aria-label={`${structuralOverview ? structuralLabel : room.label}${room.status === "provisional" ? " — provisional outward Hall" : ""}`}
                aria-pressed={selection.kind === "room" && selection.planeId === plane.id && selection.itemId === room.id}
                onClick={() => onSelect({ kind: "room", planeId: plane.id, itemId: room.id })}
              >
                <Icon size={compact ? 9 : 12} weight="duotone" aria-hidden="true" />
                <strong>{structuralOverview ? structuralLabel : room.label}</strong>
                {(!compact || room.status === "provisional") && <small>{structuralOverview ? structuralSub : room.status === "provisional" ? `PROVISIONAL · ${room.sub}` : room.sub}</small>}
                {isMirror && room.id === "workspace" && (
                  <div className="mirror-bars" aria-label="Five lower floors mirrored">
                    {governancePlanes.slice(1).map((lower) => <i key={lower.id} style={{ "--mirror": lower.color }} />)}
                  </div>
                )}
              </button>
            );
          })}
          {tokenHere && (
            <button
              className={`job-token ${run.status === "running" ? "is-moving" : ""} ${selection.kind === "token" && selection.planeId === plane.id ? "is-selected" : ""}`}
              style={{
                "--token-x": `${projectAtlasPoint(route.destination.point, yaw).x}%`,
                "--token-y": `${projectAtlasPoint(route.destination.point, yaw).y}%`,
              }}
              type="button"
                aria-label={structuralOverview ? `Inspect Job Order on ${plane.label} in the active category plan` : `Inspect Job Order on ${plane.label} at ${roomsById.get(route.destination.roomId).label}`}
              aria-pressed={selection.kind === "token" && selection.planeId === plane.id}
              onClick={() => onSelect({ kind: "token", planeId: plane.id, itemId: run.jobOrder.id })}
            >
              <span />
            </button>
          )}
        </div>
        {isMirror && <div className="mirror-sheen" aria-hidden="true" />}
      </div>
    </div>
  );
}

export function FactoryStack({ compact = false, focusedStep = null, focusIsLive = true, structuralOverview = false }) {
  const { scenario, run, currentStep, progress } = useRun();
  const { view: atlasView, rotateView, selectView, resetView } = useView();
  const dragRef = useRef(null);
  const focusedPlaneId = focusedStep?.planeId ?? run.jobOrder.planeId;
  const route = resolveAtlasRoute({
    fromStep: scenario.steps[Math.max(0, run.stepIndex - 1)],
    toStep: currentStep,
  });
  const atlasGeometry = resolveAtlasGeometry(atlasView.yaw);
  const shellYaw = Math.sin(atlasView.yaw * (Math.PI / 180)) * 18;

  const rotateByKey = (event) => {
    const rotations = {
      ArrowLeft: { yaw: atlasView.yaw - 45 },
      ArrowRight: { yaw: atlasView.yaw + 45 },
      ArrowUp: { pitch: atlasView.pitch + 2 },
      ArrowDown: { pitch: atlasView.pitch - 2 },
    };
    if (event.key === "Home") {
      event.preventDefault();
      resetView();
    } else if (rotations[event.key]) {
      event.preventDefault();
      rotateView(rotations[event.key]);
    }
  };

  const beginOrbit = (event) => {
    if (event.pointerType === "touch") return;
    if (event.target.closest?.("button, input, label")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, yaw: atlasView.yaw, pitch: atlasView.pitch };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueOrbit = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    rotateView({
      yaw: drag.yaw + ((event.clientX - drag.x) * 0.6),
      pitch: drag.pitch - ((event.clientY - drag.y) * 0.12),
    });
  };

  const endOrbit = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className={`factory-stack ${compact ? "is-compact" : ""} ${structuralOverview ? "is-structural-overview" : ""} ${atlasView.showRoute ? "" : "is-route-hidden"} ${atlasView.showCrossings ? "" : "is-crossings-hidden"} ${atlasView.showLabels ? "" : "is-labels-hidden"}`} aria-label="Six-floor Foundry governance factory">
      <header className="stack-heading">
        <div>
          <span>FOUNDRY / SIX-STOREY FACTORY</span>
          <small>SAME FLOOR PLAN · SIX GOVERNANCE PLANES</small>
        </div>
        <b>{focusIsLive ? "ACTIVE SIMULATION" : "FOCUS"} · {focusedStep?.title ?? `${Math.round(progress * 100)}% ROUTE`}</b>
        <div className="atlas-rotation-controls" role="group" aria-label="Rotate Foundry model">
          <button type="button" aria-label="Orbit Foundry left 45 degrees" onClick={() => rotateView({ yaw: atlasView.yaw - 45 })}><ArrowLeft aria-hidden="true" /></button>
          <button type="button" aria-label="Tilt Foundry up" onClick={() => rotateView({ pitch: atlasView.pitch + 2 })}><CaretUp aria-hidden="true" /></button>
          <button type="button" aria-label="Reset Foundry view" onClick={resetView}><ArrowCounterClockwise aria-hidden="true" /></button>
          <button type="button" aria-label="Tilt Foundry down" onClick={() => rotateView({ pitch: atlasView.pitch - 2 })}><CaretDown aria-hidden="true" /></button>
          <button type="button" aria-label="Orbit Foundry right 45 degrees" onClick={() => rotateView({ yaw: atlasView.yaw + 45 })}><ArrowRight aria-hidden="true" /></button>
        </div>
      </header>
      <SchematicControls />
      <div
        className="stack-canvas"
        role="group"
        tabIndex="0"
        aria-label="Rotatable Foundry Atlas. Use a mouse or stylus to drag, arrow keys to orbit and tilt, or press Home to reset."
        onKeyDown={rotateByKey}
        onPointerDown={beginOrbit}
        onPointerMove={continueOrbit}
        onPointerUp={endOrbit}
        onPointerCancel={endOrbit}
        style={{
          "--stack-yaw": `${atlasView.yaw}deg`,
          "--stack-shell-yaw": `${shellYaw}deg`,
          "--stack-pitch": `${atlasView.pitch}deg`,
          "--stack-separation": atlasView.separation,
          "--route-opacity": atlasView.showRoute ? atlasView.routeIntensity : 0.05,
          "--crossing-opacity": atlasView.showCrossings ? atlasView.crossingIntensity : 0.12,
          "--inactive-opacity": atlasView.showInactive ? atlasView.inactiveEmphasis : 0.16,
        }}
      >
        <div className="stack-world">
          {governancePlanes.map((plane, index) => (
            <div className="floor-with-crossing" key={plane.id} style={{ "--floor-depth": `${(plane.floor - 3.5) * 3}px` }}>
              <FloorPlate
                plane={plane}
                live={run.jobOrder.planeId === plane.id}
                focused={focusedPlaneId === plane.id}
                run={run}
                compact={compact}
                route={route}
                yaw={atlasView.yaw}
                geometry={atlasGeometry}
                hasCrossing={index < governancePlanes.length - 1}
                crossingActive={crossingIsActive(route, index)}
                crossingTripped={run.status === "tripped" && run.jobOrder.planeId === plane.id}
                selection={atlasView.selection}
                onSelect={selectView}
                structuralOverview={structuralOverview}
              />
              {index < governancePlanes.length - 1 && (
                <button
                  className={`vertical-crossing ${crossingIsActive(route, index) ? "is-route-active" : ""} ${run.status === "tripped" && run.jobOrder.planeId === plane.id ? "is-tripped" : ""} ${atlasView.selection.kind === "crossing" && atlasView.selection.planeId === plane.id ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={atlasView.selection.kind === "crossing" && atlasView.selection.planeId === plane.id}
                  onClick={() => selectView({ kind: "crossing", planeId: plane.id, itemId: `${plane.id}-${governancePlanes[index + 1].id}` })}
                >
                  <span>GATEHOUSE CROSSING</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <footer className="stack-legend">
        <span><i className="legend-token" /> JOB ORDER TOKEN · {run.id}</span>
        <span className="atlas-selection" aria-live="polite"><CursorClick aria-hidden="true" /> {selectionDetail(atlasView.selection)}</span>
        <span>VIEW {atlasView.yaw}° / {atlasView.pitch}° · ACTUALITY EXECUTES 00 EFFECTS</span>
      </footer>
    </section>
  );
}
