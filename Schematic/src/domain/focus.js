import { getPlane } from "./scenario.js";

export function resolveTaskFocus(scenario, liveStepIndex, selectedStepId) {
  const liveIndex = Math.min(Math.max(liveStepIndex, 0), scenario.steps.length - 1);
  const selectedIndex = selectedStepId
    ? scenario.steps.findIndex((step) => step.id === selectedStepId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex : liveIndex;
  const step = scenario.steps[index];

  return {
    index,
    step,
    plane: getPlane(step.planeId),
    isLive: index === liveIndex,
  };
}
