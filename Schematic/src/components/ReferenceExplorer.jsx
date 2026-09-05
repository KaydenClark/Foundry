import { useState } from "react";
import { Buildings, Factory, Package, Plug, ShieldCheck, Wrench } from "@phosphor-icons/react";

import { relatedReferences, resolveReference, selectReference } from "../domain/referenceRegistry.js";

const ICONS = Object.freeze({ hall: Buildings, socket: Plug, module: Package, workshop: Factory, workbench: Wrench });

function Field({ label, children, wide = false }) {
  return <div className={wide ? "is-wide" : ""}><dt>{label}</dt><dd>{children}</dd></div>;
}

function TypedDetail({ record }) {
  if (record.type === "hall") {
    return (
      <>
        <div className="reference-floor-map" aria-label={`${record.name} spatial map`}>
          {record.map.map((space, index) => <span key={space}><i>{String(index + 1).padStart(2, "0")}</i><strong>{space}</strong></span>)}
        </div>
        <dl className="reference-fields">
          <Field label="Responsibility" wide>{record.responsibility}</Field><Field label="Inputs">{record.inputs.join(" · ")}</Field><Field label="Outputs">{record.outputs.join(" · ")}</Field><Field label="Boundary" wide>{record.boundary}</Field>
        </dl>
      </>
    );
  }
  if (record.type === "socket") {
    return <dl className="reference-fields"><Field label="Contract" wide>{record.contract}</Field><Field label="Hall home">{record.homeHallId}</Field><Field label="Binding state">Example only</Field><Field label="No reach-around" wide>{record.boundary}</Field></dl>;
  }
  if (record.type === "module") {
    return <dl className="reference-fields"><Field label="Fit" wide>{record.fit}</Field><Field label="Installation">{record.installation}</Field><Field label="Binding">{record.binding}</Field><Field label="Implements" wide>{record.implementsSocketIds.join(" · ")}</Field></dl>;
  }
  if (record.type === "workshop") {
    return <dl className="reference-fields"><Field label="Hall">{record.hallId}</Field><Field label="Applied Workbench">{record.workbenchId}</Field><Field label="Purpose" wide>{record.summary}</Field></dl>;
  }
  return (
    <div className="workbench-anatomy" aria-label="Workbench anatomy">
      {record.anatomy.map((part, index) => <article key={part.name}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{part.name}</strong><p>{part.detail}</p></div></article>)}
    </div>
  );
}

export function ReferenceExplorer({ registry, collectionType }) {
  const records = registry.collections[collectionType];
  const [selection, setSelection] = useState(() => ({ type: collectionType, id: records[0].id }));
  const selected = resolveReference(registry, selection.type, selection.id);
  const related = relatedReferences(registry, selected.type, selected.id);
  const SelectedIcon = ICONS[selected.type];

  const choose = (type, id) => setSelection(selectReference(registry, { type, id }));

  return (
    <section className="reference-explorer">
      <aside className="reference-index" aria-label={`${collectionType} reference index`}>
        <header><span>{collectionType.toUpperCase()} INDEX</span><small>{records.length} PUBLIC RECORDS</small></header>
        {records.map((record) => {
          const Icon = ICONS[collectionType];
          const active = selection.type === collectionType && selection.id === record.id;
          return (
            <button key={record.id} type="button" aria-pressed={active} className={active ? "is-selected" : ""} onClick={() => choose(collectionType, record.id)}>
              <Icon weight="duotone" aria-hidden="true" /><span><strong>{record.name}</strong><small>{record.status}</small></span>
            </button>
          );
        })}
      </aside>

      <div className="reference-detail">
        <header><SelectedIcon size={34} weight="duotone" aria-hidden="true" /><div><span>SELECTED {selected.type.toUpperCase()}</span><h2>{selected.name}</h2><p>{selected.summary}</p></div></header>
        <TypedDetail record={selected} />
        <section className="reference-relations" aria-label="Declared typed relationships">
          <header><span>DECLARED RELATIONSHIPS</span><small>{related.length} TYPED LINKS</small></header>
          {related.length === 0 ? <p>NO DECLARED LINKS IN THIS PUBLIC FIXTURE.</p> : <div>{related.map((record) => {
            const Icon = ICONS[record.type];
            return <button key={`${record.type}-${record.id}`} type="button" onClick={() => choose(record.type, record.id)}><Icon aria-hidden="true" /><span>{record.type.toUpperCase()}</span><strong>{record.name}</strong></button>;
          })}</div>}
        </section>
      </div>

      <footer className="reference-provenance"><ShieldCheck weight="duotone" aria-hidden="true" /><div><strong>{registry.provenance.label}</strong><p>{registry.provenance.note}</p><small>SOURCE · {registry.provenance.source}</small></div></footer>
    </section>
  );
}
