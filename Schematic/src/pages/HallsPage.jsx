import { Factory, Hammer, Megaphone, Package, Scales, TrafficSign } from "@phosphor-icons/react";

import { PageHeading } from "../components/PageHeading.jsx";
import { halls } from "../domain/scenario.js";

const icons = { gatehouse: TrafficSign, forge: Hammer, assay: Scales, ward: Megaphone };
const parts = [
  { name: "Foundry Workspace", status: "STRUCTURE", icon: Factory, description: "Central project-working area repeated on every governance floor." },
  { name: "Gatehouse Passageway", status: "CANDIDATE", icon: TrafficSign, description: "Amber Hall-to-workspace connector. Prototype language; not promoted by this app." },
  { name: "Gatehouse Crossing", status: "CANDIDATE", icon: TrafficSign, description: "Controlled vertical transition between governance floors." },
  { name: "Shipping", status: "CANDIDATE BOUNDARY", icon: Package, description: "Shown outside the four-Hall plan; it is not a fifth canonical Hall here." },
];

export function HallsPage() {
  return (
    <div className="content-page halls-page">
      <PageHeading
        meta="HALLS & PARTS / FACILITY ANATOMY"
        title="Four Halls serve one workspace on every floor."
        description="Planes describe governance position. Halls describe work ownership. Passageways and Crossings remain orthogonal candidate structures."
      />

      <section className="hall-lineup" aria-label="Canonical Foundry Halls">
        {halls.map((hall) => {
          const Icon = icons[hall.id];
          return (
            <article key={hall.id} className={`hall-${hall.id}`}>
              <Icon size={34} weight="duotone" aria-hidden="true" />
              <small>CANONICAL HALL</small>
              <h2>{hall.label}</h2>
              <p>{hall.role}</p>
            </article>
          );
        })}
      </section>

      <section className="parts-ledger">
        <header><span>FACILITY PARTS</span><small>STATUS IS EXPLICIT</small></header>
        {parts.map((part) => {
          const Icon = part.icon;
          return (
            <article key={part.name}>
              <Icon size={24} weight="duotone" aria-hidden="true" />
              <div><h3>{part.name}</h3><p>{part.description}</p></div>
              <strong>{part.status}</strong>
            </article>
          );
        })}
      </section>
    </div>
  );
}
