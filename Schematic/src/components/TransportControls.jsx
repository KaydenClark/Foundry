import {
  ArrowCounterClockwise,
  Pause,
  Play,
  Repeat,
  SkipForward,
  WarningDiamond,
} from "@phosphor-icons/react";

import { useRun } from "../state/RunContext.jsx";

function ControlButton({ label, icon: Icon, onClick, tone = "default", disabled = false, pressed }) {
  return (
    <button
      className={`transport-button tone-${tone}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      <Icon size={20} weight="duotone" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function TransportControls() {
  const {
    run,
    runNow,
    pause,
    step,
    reset,
    replay,
    setSpeed,
    injectTrip,
  } = useRun();
  const isComplete = run.status === "completed";
  const isTripped = run.status === "tripped";

  return (
    <section className="transport" aria-label="Run transport controls">
      <div className="transport-heading">
        <span>TRANSPORT CONTROLS</span>
        <small>{run.id} · {run.status.toUpperCase()}</small>
      </div>
      <div className="transport-actions">
        <ControlButton label="Run" icon={Play} onClick={runNow} disabled={isComplete || isTripped} pressed={run.status === "running"} />
        <ControlButton label="Pause" icon={Pause} onClick={pause} disabled={run.status !== "running"} pressed={run.status === "paused"} />
        <ControlButton label={isTripped ? "Resolve" : "Step"} icon={SkipForward} onClick={step} disabled={isComplete} />
        <ControlButton label="Reset" icon={ArrowCounterClockwise} onClick={reset} />
      </div>

      <label className="speed-control">
        <span>SPEED</span>
        <select value={run.speed} onChange={(event) => setSpeed(Number(event.target.value))}>
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </label>

      <div className="transport-secondary">
        <ControlButton label="Replay" icon={Repeat} onClick={() => replay()} disabled={run.trace.length <= 1} />
        <ControlButton label="Inject Trip" icon={WarningDiamond} onClick={injectTrip} tone="alarm" disabled={isComplete || isTripped} />
      </div>

      <div className="transport-safety">
        <strong>SAFETY BOUNDARY</strong>
        <span>LOCAL STATE MACHINE</span>
        <b>NO EXECUTOR</b>
      </div>
    </section>
  );
}
