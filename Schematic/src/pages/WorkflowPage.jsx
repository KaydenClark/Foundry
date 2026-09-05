import { PageHeading } from "../components/PageHeading.jsx";
import { ScenarioLibraryPanel } from "../components/ScenarioLibraryPanel.jsx";
import { WorkflowScenarioPicker } from "../components/WorkflowScenarioPicker.jsx";
import { WorkflowHistory } from "../components/WorkflowHistory.js";
import { useRun } from "../store/RunContext.jsx";
import { RunPlayer } from "./RunPlayer.jsx";

export function WorkflowPage() {
  const { scenario, run, history, replay, clearHistory } = useRun();

  return (
    <div className="workflow-page">
      <div className="workflow-intro">
        <PageHeading
          meta="WORKFLOW / DETERMINISTIC PROOF SURFACE"
          title="Job Order Simulation"
          description="Select a workflow and watch one explanatory simulation of intended behavior. It does not claim the route is implemented or live."
        />
        <WorkflowScenarioPicker />
      </div>

      <RunPlayer />

      <details className="workflow-secondary-tools">
        <summary>CUSTOM SCENARIOS &amp; REPLAY HISTORY <span>{scenario.title} · {run.id}</span></summary>
        <ScenarioLibraryPanel />
        <WorkflowHistory history={history} replay={replay} clearHistory={clearHistory} />
      </details>
    </div>
  );
}
