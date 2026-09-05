import { useState } from "react";
import { ArrowDown, ArrowUp, Elevator, Eye, LockKeyOpen, ShieldCheck } from "@phosphor-icons/react";

import { FactoryStack } from "../components/FactoryStack.jsx";
import { GovernanceFloorPlan } from "../components/GovernanceFloorPlan.jsx";
import { PageHeading } from "../components/PageHeading.jsx";
import { GOVERNANCE_GUIDE, resolveGovernancePlane, selectGovernancePlane } from "../domain/governanceGuide.js";
import { useRun } from "../store/RunContext.jsx";

export function GovernancePage() {
  const { run, scenario } = useRun();
  const [selectedPlaneId, setSelectedPlaneId] = useState("actuality");
  const selectedPlane = resolveGovernancePlane(selectedPlaneId);

  const selectPlane = (id) => setSelectedPlaneId((current) => selectGovernancePlane(current, id));

  return (
    <div className="content-page governance-page">
      <PageHeading
        meta="GOVERNANCE / PLANES + FACTORY-FLOOR METAPHOR"
        title="Six operating planes. One repeated floor plan."
        description="A Governance Plane is the operating classification. The identical factory-floor metaphor makes separation, protection, and passage visible; it does not create six Foundries or six copies of reality."
      />

      <section className="governance-primer" aria-label="Governance metaphor and transition rules">
        <article><Eye weight="duotone" aria-hidden="true" /><div><span>THE METAPHOR</span><strong>The Plane is the operating concept; the floor is the picture.</strong><p>Every floor repeats the same Halls and paths so each Plane can be inspected top-down.</p></div></article>
        <article><Elevator weight="duotone" aria-hidden="true" /><div><span>THE TRANSITION</span><strong>Gatehouse checks the Job Order and Clearance.</strong><p>The Governance elevator moves the same order only after its read/write band permits passage.</p></div></article>
        <article><ShieldCheck weight="duotone" aria-hidden="true" /><div><span>AUTHORITY ORDER</span><strong>Protection, not truth precedence.</strong><p>Actuality is most protected. Projection is least protected and may route, but cannot authorize.</p></div></article>
      </section>

      <section className="governance-layout">
        <div className="plane-ledger" aria-label="Authority Order from most to least protected">
          {GOVERNANCE_GUIDE.map((plane) => {
            const active = run.jobOrder.planeId === plane.id;
            const selected = selectedPlaneId === plane.id;
            const visits = scenario.steps.filter((step) => step.planeId === plane.id);
            return (
              <button key={plane.id} type="button" aria-pressed={selected} className={`${active ? "is-active" : ""} ${selected ? "is-selected" : ""}`} style={{ "--plane": plane.color }} onClick={() => selectPlane(plane.id)}>
                <span>{String(plane.floor).padStart(2, "0")}</span>
                <div><small>AUTHORITY {plane.authorityRank} / 6 · {plane.qualifier.toUpperCase()}</small><h2>{plane.label}</h2><p>{plane.summary}</p></div>
                <div className="plane-visits">{visits.map((visit) => visit.direction === "up" ? <ArrowUp key={visit.id} size={18} aria-label="return visit" /> : <ArrowDown key={visit.id} size={18} aria-label="descent visit" />)}</div>
                {plane.id === "projection" && <Eye size={24} weight="duotone" aria-label="routes but cannot authorize" />}
                {plane.id === "actuality" && <LockKeyOpen size={24} weight="duotone" aria-label="most protected bounded work" />}
              </button>
            );
          })}
        </div>
        <FactoryStack compact />
      </section>

      <GovernanceFloorPlan plane={selectedPlane} />
    </div>
  );
}
