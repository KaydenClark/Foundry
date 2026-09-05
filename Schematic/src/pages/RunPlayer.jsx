import { useState } from "react";

import { WorkflowExecutionRail } from "../components/WorkflowExecutionRail.jsx";
import { WorkflowFloorPlan } from "../components/WorkflowFloorPlan.jsx";
import { TransportControls } from "../components/TransportControls.jsx";
import { resolveTaskFocus } from "../domain/focus.js";
import { useRun } from "../store/RunContext.jsx";

export function RunPlayer() {
  const { run, scenario } = useRun();
  const [selectedStepId, setSelectedStepId] = useState(null);
  const focus = resolveTaskFocus(scenario, run.stepIndex, selectedStepId);

  return (
    <div className="run-player workflow-proof-console">
      <WorkflowExecutionRail focusedStepId={focus.step.id} onFocusStep={setSelectedStepId} />
      <div className="workflow-stage">
        <WorkflowFloorPlan focusedStepIndex={focus.index} focusIsLive={focus.isLive} />
        <TransportControls />
      </div>
      {!focus.isLive && <button className="workflow-return-live" type="button" onClick={() => setSelectedStepId(null)}>RETURN TO ACTIVE STEP</button>}
    </div>
  );
}
