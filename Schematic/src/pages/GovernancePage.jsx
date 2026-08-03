import { ArrowDown, ArrowUp, Eye, LockKeyOpen } from "@phosphor-icons/react";

import { FactoryStack } from "../components/FactoryStack.jsx";
import { PageHeading } from "../components/PageHeading.jsx";
import { governancePlanes } from "../domain/scenario.js";
import { useRun } from "../store/RunContext.jsx";

export function GovernancePage() {
  const { run, scenario } = useRun();

  return (
    <div className="content-page governance-page">
      <PageHeading
        meta="GOVERNANCE STACK / AUTHORITY ORDER"
        title="A building, not a precedence ladder."
        description="The floors show how a Job Order earns access toward protected work and checks evidence back upward. They do not rank which source is true."
      />

      <section className="governance-layout">
        <div className="plane-ledger">
          {governancePlanes.map((plane) => {
            const active = run.jobOrder.planeId === plane.id;
            const visits = scenario.steps.filter((step) => step.planeId === plane.id);
            return (
              <article key={plane.id} className={active ? "is-active" : ""} style={{ "--plane": plane.color }}>
                <span>{String(plane.floor).padStart(2, "0")}</span>
                <div><small>{plane.qualifier.toUpperCase()}</small><h2>{plane.label}</h2><p>{plane.summary}</p></div>
                <div className="plane-visits">
                  {visits.map((visit) => visit.direction === "up"
                    ? <ArrowUp key={visit.id} size={18} aria-label="return visit" />
                    : <ArrowDown key={visit.id} size={18} aria-label="descent visit" />)}
                </div>
                {plane.id === "projection" && <Eye size={24} weight="duotone" aria-label="mirror" />}
                {plane.id === "actuality" && <LockKeyOpen size={24} weight="duotone" aria-label="bounded work" />}
              </article>
            );
          })}
        </div>
        <FactoryStack compact />
      </section>
    </div>
  );
}
