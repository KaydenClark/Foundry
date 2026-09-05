import {
  Copy,
  DownloadSimple,
  FloppyDisk,
  PencilSimple,
  Play,
  UploadSimple,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { useRun } from "../store/RunContext.jsx";
import {
  performScenarioDownload,
  uploadScenarioFile,
} from "../store/scenarioTransfer.js";

export function ScenarioLibraryPanel() {
  const {
    scenarios,
    premadeScenarios,
    scenario,
    scenarioDraft,
    scenarioErrors,
    scenarioNotice,
    duplicateSeed,
    editLocalScenario,
    updateScenarioDraft,
    saveScenarioDraft,
    selectScenario,
    exportLocalScenario,
    importLocalScenarioDocument,
    reportScenarioTransferError,
    reportScenarioTransferSuccess,
  } = useRun();
  const [selectedStepId, setSelectedStepId] = useState("");

  useEffect(() => {
    setSelectedStepId(scenarioDraft?.steps[0]?.id ?? "");
  }, [scenarioDraft?.id]);

  const selectedStep = scenarioDraft?.steps.find((step) => step.id === selectedStepId)
    ?? scenarioDraft?.steps[0];

  const downloadLocalScenario = (scenarioId) => performScenarioDownload({
    scenarioId,
    prepare: exportLocalScenario,
    reportSuccess: reportScenarioTransferSuccess,
    reportError: reportScenarioTransferError,
  });

  const uploadLocalScenario = (event) => uploadScenarioFile({
    input: event.currentTarget,
    importDocument: importLocalScenarioDocument,
    reportError: reportScenarioTransferError,
  });

  return (
    <section className="scenario-library" aria-labelledby="scenario-library-title">
      <header>
        <div>
          <span>SCENARIO LIBRARY / THIS BROWSER</span>
          <strong id="scenario-library-title">Duplicate the Harness Review seed, save a valid local copy, then start it explicitly.</strong>
        </div>
        <div className="scenario-library-header-actions">
          <button type="button" onClick={duplicateSeed}>
            <Copy aria-hidden="true" /> DUPLICATE SEED / HARNESS
          </button>
          <label className="scenario-transfer-field" htmlFor="scenario-import-file">
            <span><UploadSimple aria-hidden="true" /> IMPORT JSON</span>
            <input
              id="scenario-import-file"
              type="file"
              accept=".json,application/json"
              onChange={uploadLocalScenario}
            />
          </label>
        </div>
      </header>

      {scenarioErrors.length > 0 && (
        <div className="scenario-library-alert" role="alert">
          <strong>LOCAL SCENARIO REFUSED</strong>
          <ul>{scenarioErrors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}
      {scenarioNotice && <p className="scenario-library-notice" role="status">{scenarioNotice}</p>}

      <div className="scenario-library-grid">
        <div className="scenario-library-list" aria-label="Available scenarios">
          {scenarios.map((candidate) => {
            const isPremade = premadeScenarios.some((preset) => preset.id === candidate.id);
            const isActive = candidate.id === scenario.id;
            return (
              <article className={isActive ? "is-active" : ""} key={candidate.id}>
                <span>{isPremade ? "IMMUTABLE PREMADE" : "LOCAL SCENARIO"}{isActive ? " · ACTIVE" : ""}</span>
                <strong>{candidate.title}</strong>
                <small>{candidate.id} · {candidate.steps.length} STAGES</small>
                <div>
                  {!isPremade && (
                    <>
                      <button type="button" onClick={() => editLocalScenario(candidate.id)}>
                        <PencilSimple aria-hidden="true" /> EDIT LOCAL
                      </button>
                      <button type="button" onClick={() => downloadLocalScenario(candidate.id)}>
                        <DownloadSimple aria-hidden="true" /> EXPORT JSON
                      </button>
                    </>
                  )}
                  <button type="button" disabled={isPremade && isActive} onClick={() => selectScenario(candidate.id)}>
                    <Play aria-hidden="true" /> SELECT / START
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <form className="scenario-library-editor" onSubmit={(event) => { event.preventDefault(); saveScenarioDraft(); }}>
          <header>
            <span>LOCAL DRAFT</span>
            <strong>{scenarioDraft ? scenarioDraft.id : "DUPLICATE OR EDIT TO BEGIN"}</strong>
          </header>
          <label htmlFor="local-scenario-title">SCENARIO TITLE</label>
          <input
            id="local-scenario-title"
            type="text"
            disabled={!scenarioDraft}
            value={scenarioDraft?.title ?? ""}
            onChange={(event) => updateScenarioDraft({ title: event.target.value })}
          />
          <label htmlFor="local-scenario-step">STAGE TO EDIT</label>
          <select
            id="local-scenario-step"
            disabled={!scenarioDraft}
            value={selectedStep?.id ?? ""}
            onChange={(event) => setSelectedStepId(event.target.value)}
          >
            {!scenarioDraft && <option value="">NO LOCAL DRAFT</option>}
            {scenarioDraft?.steps.map((step) => <option key={step.id} value={step.id}>{step.id}</option>)}
          </select>
          <label htmlFor="local-scenario-step-title">STAGE / JOB ORDER TASK TITLE</label>
          <input
            id="local-scenario-step-title"
            type="text"
            disabled={!selectedStep}
            value={selectedStep?.title ?? ""}
            onChange={(event) => updateScenarioDraft({
              stepId: selectedStep.id,
              stepTitle: event.target.value,
            })}
          />
          <small>Stage and referenced Job Order task titles are saved in lockstep. Save never starts or changes a run.</small>
          <button type="submit" disabled={!scenarioDraft}>
            <FloppyDisk aria-hidden="true" /> SAVE LOCAL SCENARIO
          </button>
        </form>
      </div>
    </section>
  );
}
