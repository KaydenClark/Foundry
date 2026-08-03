import { FactoryStack } from "../components/FactoryStack.jsx";
import { JourneyRail } from "../components/JourneyRail.jsx";
import { RunInspector } from "../components/RunInspector.jsx";

export function RunPlayer() {
  return (
    <div className="run-player page-fill">
      <JourneyRail />
      <FactoryStack />
      <RunInspector />
    </div>
  );
}
