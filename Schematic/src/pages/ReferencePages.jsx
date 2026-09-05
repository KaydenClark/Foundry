import { PageHeading } from "../components/PageHeading.jsx";
import { ReferenceExplorer } from "../components/ReferenceExplorer.jsx";
import { REFERENCE_REGISTRY } from "../domain/referenceRegistry.js";

function ReferencePage({ collectionType, meta, title, description }) {
  return <div className={`content-page reference-page ${collectionType}-page`}><PageHeading meta={meta} title={title} description={description} /><ReferenceExplorer registry={REFERENCE_REGISTRY} collectionType={collectionType} /></div>;
}

export function HallsPage() {
  return <ReferencePage collectionType="hall" meta="HALLS / NATIVE FACTORY SPACES" title="Thirteen spaces own thirteen bounded responsibilities." description="Inspect each Hall's floor map, responsibility, inputs, outputs, and hard boundary. Halls stay inside the Factory and repeat on every identical floor." />;
}

export function SocketsPage() {
  return <ReferencePage collectionType="socket" meta="SOCKETS / TYPED CAPABILITY CONTRACTS" title="Connections that preserve replaceability." description="Inspect a Socket's stable contract, Hall home, illustrative binding, and no-reach-around rule. A Socket is a boundary and conduit—not a building." />;
}

export function ModulesPage() {
  return <ReferencePage collectionType="module" meta="MODULES / REPLACEABLE PRODUCTS" title="Supporting buildings outside the Factory." description="Inspect illustrative Modules, the Sockets they implement, their installation boundary, architectural fit, and instance-owned binding state." />;
}

export function WorkbenchPage() {
  return <ReferencePage collectionType="workbench" meta="WORKBENCH / ONE WORKSHOP" title="The operating surface inside a project room." description="Inspect how Contract, Canon, memory, specs, procedures, skills, tools, and tests become one portable Workbench applied within a Workshop." />;
}
