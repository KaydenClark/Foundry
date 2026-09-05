import { Elevator, Factory, Package, Plug } from "@phosphor-icons/react";

import { deriveWorkflowPresentation, formatSimulationTime } from "../domain/workflowPresentation.js";
import { deriveWorkflowFoundrySemantics } from "../domain/workflowFoundrySemantics.js";
import { useRun } from "../store/RunContext.jsx";

const CLASS_ICONS = Object.freeze({ halls: Factory, modules: Package, sockets: Plug });

export function WorkflowTelemetry() {
  const { scenario, run } = useRun();
  const presentation = deriveWorkflowPresentation(scenario, run);
  const semantics = deriveWorkflowFoundrySemantics(scenario, run);

  return (
    <section className="workflow-telemetry" aria-label="Synchronized Workflow state">
      <div className="workflow-stage-readout">
        <header><span>ACTIVE SIMULATION</span><strong>{run.jobOrder.id}</strong><b>{formatSimulationTime(presentation.elapsedMs)} ELAPSED</b></header>
        <dl>
          <div><dt>Plane</dt><dd>F{presentation.plane.floor} · {presentation.plane.label}</dd></div>
          <div><dt>Floor location</dt><dd>{presentation.location}</dd></div>
          <div><dt>Actor</dt><dd>{presentation.actor}</dd></div>
          <div><dt>Packet</dt><dd>{presentation.packet}</dd></div>
          <div><dt>Gate</dt><dd>{presentation.gate}</dd></div>
          <div><dt>Stage active</dt><dd>{formatSimulationTime(presentation.activeDurationMs)}</dd></div>
          <div className="span-two"><dt>Evidence</dt><dd>{presentation.evidence.join(" · ")}</dd></div>
        </dl>
      </div>

      <div className="workflow-activations">
        <header><span>STRUCTURAL ACTIVATION</span><small>DETERMINISTIC TRACE TIME</small></header>
        <div>
          {presentation.activations.map((activation) => {
            const Icon = CLASS_ICONS[activation.id];
            return (
              <article className={activation.active ? "is-active" : ""} key={activation.id}>
                <Icon weight="duotone" aria-hidden="true" />
                <span>{activation.active ? "ACTIVE" : "STANDBY"}</span>
                <strong>{activation.label}</strong>
                <small>{activation.description}</small>
                <b>{formatSimulationTime(activation.durationMs)} TOTAL</b>
              </article>
            );
          })}
        </div>
      </div>

      <section className="workflow-foundry-semantics" aria-label="Foundry workflow semantics">
        <header><span>FOUNDRY SEMANTICS</span><small>PRESENTATION ONLY</small></header>
        <dl>
          <div><dt>Passage</dt><dd>{semantics.passage.map((stage) => `${stage.hall}: ${stage.authority ?? stage.receipt} / ${stage.status}`).join(" → ")}</dd></div>
          <div><dt>Producer</dt><dd>{semantics.producer.kind} → {semantics.producer.hall}</dd></div>
          <div><dt>Optional</dt><dd>{semantics.optionalPassages.map((passage) => passage.hall).join(" · ")}</dd></div>
          <div><dt>Assay / Ward</dt><dd>{semantics.assay.status} · {semantics.ward.repairsUsed}/{semantics.ward.maxRepairs} repair</dd></div>
          <div><dt>Integration</dt><dd>{semantics.integration.target}; main {semantics.integration.main}</dd></div>
          <div><dt>Shipping</dt><dd>{semantics.shipping.status} · declared {semantics.shipping.declaredProducer} producer</dd></div>
        </dl>
      </section>

      <div className={`workflow-transition ${presentation.transition.usesElevator ? "uses-elevator" : "same-floor"}`} role="status">
        <Elevator weight="duotone" aria-hidden="true" />
        <div><span>{presentation.transition.usesElevator ? "GOVERNANCE ELEVATOR" : "TOP-DOWN FLOOR MOVEMENT"}</span><strong>{presentation.transition.message}</strong></div>
      </div>
    </section>
  );
}
