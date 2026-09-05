import { Elevator, Factory, ShieldCheck } from "@phosphor-icons/react";

import { ATLAS_FLOOR_TOPOLOGY } from "../view/atlasTopology.js";

const roomById = new Map(ATLAS_FLOOR_TOPOLOGY.rooms.map((room) => [room.id, room]));

export function GovernanceFloorPlan({ plane }) {
  return (
    <section className="governance-floor-guide" style={{ "--selected-plane": plane.color }} aria-label={`${plane.label} selected top-down factory floor`}>
      <header>
        <div><span>SELECTED GOVERNANCE PLANE / FLOOR {plane.floor}</span><h2>{plane.label}</h2><p>{plane.purpose}</p></div>
        <strong>{plane.protection}</strong>
      </header>
      <div className="governance-plan-layout">
        <div className="governance-plan-map">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ATLAS_FLOOR_TOPOLOGY.passageways.map((passageway) => {
              const from = roomById.get(passageway.fromRoomId).point;
              const to = roomById.get(passageway.toRoomId).point;
              return <line key={`${passageway.fromRoomId}-${passageway.toRoomId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
            })}
          </svg>
          {ATLAS_FLOOR_TOPOLOGY.rooms.map((room) => (
            <span className={`governance-plan-room ${room.status === "provisional" ? "is-provisional" : ""}`} key={room.id} style={{ "--room-x": `${room.point.x}%`, "--room-y": `${room.point.y}%` }}>
              <Factory weight="duotone" aria-hidden="true" /><strong>{room.label}</strong><small>{room.status === "provisional" ? "PROVISIONAL / NOT CANON" : room.sub}</small>
            </span>
          ))}
          <span className="governance-elevator"><Elevator weight="duotone" aria-hidden="true" /><strong>GOVERNANCE ELEVATOR</strong><small>GATEHOUSE CHECK</small></span>
        </div>
        <dl className="governance-plane-detail">
          <div><dt>Authority rank</dt><dd>{plane.authorityRank} / 6 · MOST TO LEAST PROTECTED</dd></div>
          <div><dt>Inputs</dt><dd>{plane.inputs.join(" · ")}</dd></div>
          <div><dt>Outputs</dt><dd>{plane.outputs.join(" · ")}</dd></div>
          <div><dt>Protection</dt><dd>{plane.protectionDetail}</dd></div>
          <div><dt>Transition rule</dt><dd><ShieldCheck aria-hidden="true" /> {plane.transition}</dd></div>
        </dl>
      </div>
    </section>
  );
}
