import { useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Buildings,
  Factory,
  Package,
  Plug,
  Wrench,
} from "@phosphor-icons/react";

import {
  CAMPUS,
  createCampusView,
  resolveCampusEntity,
  rotateCampus,
  selectCampusEntity,
} from "../domain/campus.js";
import { useRun } from "../store/RunContext.jsx";
import "./campus.css";

const ICONS = Object.freeze({
  factory: Factory,
  hall: Buildings,
  module: Package,
  socket: Plug,
  workshop: Wrench,
  facility: Buildings,
});

function CampusEntity({ kind, entity, selected, onSelect, children }) {
  const Icon = ICONS[kind];
  return (
    <button
      className={`campus-entity campus-${kind} ${selected ? "is-selected" : ""} ${entity.id === "factory-east" ? "is-primary" : ""}`}
      style={{ "--entity-x": `${entity.position.x}%`, "--entity-y": `${entity.position.y}%` }}
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(kind, entity.id)}
    >
      <span className="campus-entity-type"><Icon weight="duotone" aria-hidden="true" /> {kind.toUpperCase()}</span>
      <strong>{entity.name}</strong>
      <small>{entity.label}</small>
      {children}
    </button>
  );
}

function SocketNetwork({ selection, onSelect }) {
  const factoryById = new Map(CAMPUS.factories.map((factory) => [factory.id, factory]));
  const moduleById = new Map(CAMPUS.modules.map((module) => [module.id, module]));

  return (
    <>
      <svg className="campus-conduits" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {CAMPUS.sockets.map((socket) => {
          const factory = factoryById.get(socket.factoryId);
          const module = moduleById.get(socket.moduleId);
          return (
            <line
              className={selection.kind === "socket" && selection.id === socket.id ? "is-selected" : ""}
              key={socket.id}
              x1={factory.position.x}
              y1={factory.position.y}
              x2={module.position.x}
              y2={module.position.y}
            />
          );
        })}
      </svg>
      {CAMPUS.sockets.map((socket) => {
        const factory = factoryById.get(socket.factoryId);
        const module = moduleById.get(socket.moduleId);
        const position = { x: (factory.position.x + module.position.x) / 2, y: (factory.position.y + module.position.y) / 2 };
        return (
          <button
            className={`campus-socket-port ${selection.kind === "socket" && selection.id === socket.id ? "is-selected" : ""}`}
            key={socket.id}
            style={{ "--entity-x": `${position.x}%`, "--entity-y": `${position.y}%` }}
            type="button"
            aria-label={`Inspect Socket: ${socket.name}, ${socket.contract}`}
            aria-pressed={selection.kind === "socket" && selection.id === socket.id}
            onClick={() => onSelect("socket", socket.id)}
          >
            <Plug weight="fill" aria-hidden="true" />
            <span>SOCKET</span>
          </button>
        );
      })}
    </>
  );
}

export function CampusAtlas() {
  const { run } = useRun();
  const [view, setView] = useState(createCampusView);
  const dragRef = useRef(null);
  const selected = resolveCampusEntity(CAMPUS, view.selection.kind, view.selection.id);

  const rotate = (rotation) => setView((current) => rotateCampus(current, rotation));
  const select = (kind, id) => setView((current) => selectCampusEntity(current, CAMPUS, kind, id));
  const reset = () => setView(createCampusView());
  const keyRotate = (event) => {
    if (event.key === "Home") {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      rotate({ yaw: view.yaw + (event.key === "ArrowLeft" ? -15 : 15) });
    }
  };
  const beginOrbit = (event) => {
    if (event.target.closest?.("button")) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, yaw: view.yaw };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const continueOrbit = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    rotate({ yaw: dragRef.current.yaw + ((event.clientX - dragRef.current.x) * 0.35) });
  };
  const endOrbit = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className="campus-atlas" aria-label="Rotatable end-state Foundry campus">
      <header className="campus-toolbar">
        <div>
          <span>END-STATE CAMPUS / TWO HOSTS</span>
          <strong>ONE PORTABLE FOUNDRY · TWO FACTORIES</strong>
        </div>
        <div className="campus-camera-controls" role="group" aria-label="Rotate campus">
          <button type="button" onClick={() => rotate({ yaw: view.yaw - 15 })} aria-label="Rotate campus left"><ArrowLeft aria-hidden="true" /></button>
          <button type="button" onClick={reset} aria-label="Reset campus view"><ArrowCounterClockwise aria-hidden="true" /></button>
          <button type="button" onClick={() => rotate({ yaw: view.yaw + 15 })} aria-label="Rotate campus right"><ArrowRight aria-hidden="true" /></button>
        </div>
      </header>

      <div
        className="campus-stage"
        role="group"
        tabIndex="0"
        aria-label="Factory campus. Drag to rotate, use left and right arrow keys, or press Home to reset."
        onKeyDown={keyRotate}
        onPointerDown={beginOrbit}
        onPointerMove={continueOrbit}
        onPointerUp={endOrbit}
        onPointerCancel={endOrbit}
        style={{ "--campus-yaw": `${view.yaw}deg`, "--campus-pitch": `${view.pitch}deg` }}
      >
        <div className="campus-world">
          <div className="campus-ground" aria-hidden="true" />
          <SocketNetwork selection={view.selection} onSelect={select} />
          {CAMPUS.factories.map((factory) => (
            <CampusEntity key={factory.id} kind="factory" entity={factory} selected={view.selection.kind === "factory" && view.selection.id === factory.id} onSelect={select}>
              <span className="factory-storeys" aria-label="Six identical floors">
                {Array.from({ length: factory.floors }, (_, index) => <i key={index}>0{factory.floors - index}</i>)}
              </span>
            </CampusEntity>
          ))}
          {CAMPUS.halls.map((hall) => <CampusEntity key={hall.id} kind="hall" entity={hall} selected={view.selection.kind === "hall" && view.selection.id === hall.id} onSelect={select} />)}
          {CAMPUS.workshops.map((workshop) => <CampusEntity key={workshop.id} kind="workshop" entity={workshop} selected={view.selection.kind === "workshop" && view.selection.id === workshop.id} onSelect={select} />)}
          {CAMPUS.modules.map((module) => <CampusEntity key={module.id} kind="module" entity={module} selected={view.selection.kind === "module" && view.selection.id === module.id} onSelect={select} />)}
          {CAMPUS.facilities.map((facility) => <CampusEntity key={facility.id} kind="facility" entity={facility} selected={view.selection.kind === "facility" && view.selection.id === facility.id} onSelect={select} />)}
        </div>
      </div>

      <footer className="campus-readout">
        <div className={`campus-kind kind-${selected.kind}`}><span>SELECTED {selected.kind.toUpperCase()}</span><strong>{selected.name}</strong></div>
        <p>{selected.detail}</p>
        <dl>
          <div><dt>Camera</dt><dd>{view.yaw}°</dd></div>
          <div><dt>Run isolation</dt><dd>{run.id} · {run.trace.length} events unchanged</dd></div>
        </dl>
      </footer>
    </section>
  );
}
