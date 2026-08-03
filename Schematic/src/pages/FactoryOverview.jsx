import { ArrowRight, Play, ShieldWarning } from "@phosphor-icons/react";

import { FactoryStack } from "../components/FactoryStack.jsx";
import { PageHeading } from "../components/PageHeading.jsx";
import { useRun } from "../state/RunContext.jsx";

export function FactoryOverview({ navigate }) {
  const { run, currentStep, progress } = useRun();

  return (
    <div className="content-page overview-page">
      <PageHeading
        meta="FACTORY OVERVIEW / LIVE LOCAL MODEL"
        title="One Foundry. Six governance floors."
        description="The same floor plan repeats from Actuality to the Projection mirror. One continuous Job Order earns its way down, performs bounded simulated work, then checks back up."
        action={(
          <button className="primary-action" type="button" onClick={() => navigate("/run")}>
            <Play size={20} weight="fill" aria-hidden="true" /> OPEN RUN PLAYER <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      />

      <section className="overview-layout">
        <FactoryStack compact />
        <aside className="overview-readout">
          <header><span>ACTIVE RUN</span><strong>{run.id}</strong></header>
          <dl>
            <div><dt>Status</dt><dd>{run.status.toUpperCase()}</dd></div>
            <div><dt>Current operation</dt><dd>{currentStep.title}</dd></div>
            <div><dt>Worker</dt><dd>{run.jobOrder.worker}</dd></div>
            <div><dt>Route complete</dt><dd>{Math.round(progress * 100)}%</dd></div>
          </dl>
          <div className="boundary-callout">
            <ShieldWarning size={28} weight="duotone" aria-hidden="true" />
            <div><strong>SIMULATION BOUNDARY</strong><p>This app changes local UI state only. There is no command, repository, dispatch, publish, or Actuality adapter.</p></div>
          </div>
          <div className="stack-reading-rule">
            <span>READING RULE</span>
            <p><b>Projection</b> mirrors the five lower floors. <b>Actuality</b> is the real-work plane in Foundry, but remains effect-free inside this simulator.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
