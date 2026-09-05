import { ArrowCounterClockwise, Binoculars, Crosshair, Path, SlidersHorizontal } from "@phosphor-icons/react";

import { useRun } from "../store/RunContext.jsx";
import { useView } from "../store/ViewContext.jsx";
import { ATLAS_VIEW_LIMITS } from "../view/atlasView.js";

const SPEEDS = [0.5, 1, 2, 4];
const PRESETS = [
  { id: "factory-overview", label: "Factory Overview", icon: Binoculars },
  { id: "follow-job-order", label: "Follow Job Order", icon: Path },
  { id: "explain-crossing", label: "Explain Crossing", icon: Crosshair },
  { id: "inspect-selection", label: "Inspect Selection", icon: SlidersHorizontal },
];

function RangeControl({ label, value, min, max, step, onChange, format = (next) => next }) {
  return (
    <label className="schematic-range">
      <span>{label}<output>{format(value)}</output></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleControl({ label, checked, onChange }) {
  return (
    <label className="schematic-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function SchematicControls() {
  const { view, updateView, applyPreset, resetView } = useView();
  const { run, setSpeed } = useRun();
  const speedIndex = SPEEDS.indexOf(run.speed);

  return (
    <section className="schematic-controls" aria-label="Schematic view and intensity controls">
      <header>
        <SlidersHorizontal size={16} aria-hidden="true" />
        <strong>SCHEMATIC CONTROLS</strong>
        <span>VIEW + PLAYBACK · SIMULATION ONLY</span>
        <button type="button" onClick={resetView}><ArrowCounterClockwise aria-hidden="true" /> RESET VIEW</button>
      </header>
      <nav className="schematic-presets" aria-label="Task-oriented Schematic views">
        {PRESETS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={view.preset === id} onClick={() => applyPreset(id)}>
            <Icon aria-hidden="true" /> <span>{label}</span>
          </button>
        ))}
      </nav>
      <details className="schematic-advanced">
        <summary><SlidersHorizontal aria-hidden="true" /> Advanced controls</summary>
        <div className="schematic-control-grid">
          <RangeControl label="ROTATION" value={view.yaw} min={ATLAS_VIEW_LIMITS.yaw.min} max={ATLAS_VIEW_LIMITS.yaw.max} step="1" format={(value) => `${value}°`} onChange={(yaw) => updateView({ yaw })} />
          <RangeControl label="ANGLE" value={view.pitch} min={ATLAS_VIEW_LIMITS.pitch.min} max={ATLAS_VIEW_LIMITS.pitch.max} step="1" format={(value) => `${value}°`} onChange={(pitch) => updateView({ pitch })} />
          <RangeControl label="FLOOR DEPTH" value={view.separation} min={ATLAS_VIEW_LIMITS.separation.min} max={ATLAS_VIEW_LIMITS.separation.max} step="0.05" format={(value) => `${value.toFixed(2)}×`} onChange={(separation) => updateView({ separation })} />
          <RangeControl label="PLAYBACK" value={Math.max(speedIndex, 0)} min="0" max={SPEEDS.length - 1} step="1" format={(value) => `${SPEEDS[value]}×`} onChange={(index) => setSpeed(SPEEDS[index])} />
          <RangeControl label="ROUTE" value={view.routeIntensity} min={ATLAS_VIEW_LIMITS.routeIntensity.min} max={ATLAS_VIEW_LIMITS.routeIntensity.max} step="0.05" format={(value) => `${Math.round(value * 100)}%`} onChange={(routeIntensity) => updateView({ routeIntensity })} />
          <RangeControl label="CROSSINGS" value={view.crossingIntensity} min={ATLAS_VIEW_LIMITS.crossingIntensity.min} max={ATLAS_VIEW_LIMITS.crossingIntensity.max} step="0.05" format={(value) => `${Math.round(value * 100)}%`} onChange={(crossingIntensity) => updateView({ crossingIntensity })} />
          <RangeControl label="OTHER FLOORS" value={view.inactiveEmphasis} min={ATLAS_VIEW_LIMITS.inactiveEmphasis.min} max={ATLAS_VIEW_LIMITS.inactiveEmphasis.max} step="0.05" format={(value) => `${Math.round(value * 100)}%`} onChange={(inactiveEmphasis) => updateView({ inactiveEmphasis })} />
          <div className="schematic-toggles" role="group" aria-label="Schematic visibility toggles">
            <ToggleControl label="ROUTE" checked={view.showRoute} onChange={(showRoute) => updateView({ showRoute })} />
            <ToggleControl label="CROSSINGS" checked={view.showCrossings} onChange={(showCrossings) => updateView({ showCrossings })} />
            <ToggleControl label="DETAILS" checked={view.showLabels} onChange={(showLabels) => updateView({ showLabels })} />
            <ToggleControl label="OTHER FLOORS" checked={view.showInactive} onChange={(showInactive) => updateView({ showInactive })} />
          </div>
        </div>
      </details>
    </section>
  );
}
