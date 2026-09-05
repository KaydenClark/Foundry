import { createRun, replayTrace, runIdForScenario, transitionRun } from "../domain/engine.js";

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return sameValue(leftKeys, rightKeys)
    && leftKeys.every((key) => sameValue(left[key], right[key]));
}

function actionForArchivedEvent(event) {
  if (!event || typeof event !== "object") {
    throw new TypeError("Archived run trace events must be objects.");
  }
  switch (event.kind) {
    case "run-control": {
      if (event.message === "Run started.") return { type: "RUN" };
      if (event.message === "Run paused.") return { type: "PAUSE" };
      const speed = (event.message ?? "").match(/^Speed set to (0\.5|1|2|4)×\.$/);
      if (speed) return { type: "SET_SPEED", speed: Number(speed[1]) };
      break;
    }
    case "transition":
      return { type: event.snapshot?.status === "running" ? "TICK" : "STEP" };
    case "gatehouse-signal":
      return { type: "INJECT_TRIP" };
    case "trip-disposition":
      return { type: "STEP" };
    case "transition-refused":
      if (
        event.message === "A completed run cannot accept a trip injection."
        || event.message === "This Crossing is already held."
      ) {
        return { type: "INJECT_TRIP" };
      }
      if (event.message === "Run is complete; reset or replay to continue.") return { type: "STEP" };
      break;
    default:
      break;
  }
  throw new TypeError(`Archived run trace event kind is not replayable: ${event.kind ?? "missing"}.`);
}

function validateTraceStepReferences(scenario, trace) {
  trace.forEach((event, index) => {
    const eventNumber = index + 1;
    if (!Number.isSafeInteger(event?.stepIndex) || event.stepIndex < 0 || event.stepIndex >= scenario.steps.length) {
      throw new RangeError(`Archived run trace event ${eventNumber} stepIndex must reference its source scenario.`);
    }
    if (event.snapshot?.stepIndex !== event.stepIndex) {
      throw new TypeError(`Archived run trace event ${eventNumber} snapshot stepIndex is inconsistent.`);
    }
  });
}

function reconstructTrustedRun(scenario, trace) {
  validateTraceStepReferences(scenario, trace);
  let trusted = createRun(scenario, 1);
  if (!sameValue(trace[0], trusted.trace[0])) {
    throw new TypeError("Archived run trace event 1 contradicts its source scenario authority.");
  }

  let sourceIndex = 1;
  while (sourceIndex < trace.length) {
    const beforeLength = trusted.trace.length;
    trusted = transitionRun(trusted, actionForArchivedEvent(trace[sourceIndex]), scenario);
    const emitted = trusted.trace.slice(beforeLength);
    const archived = trace.slice(sourceIndex, sourceIndex + emitted.length);
    if (emitted.length === 0 || archived.length !== emitted.length) {
      throw new TypeError(`Archived run trace event ${sourceIndex + 1} has an incomplete transition.`);
    }
    for (let offset = 0; offset < emitted.length; offset += 1) {
      if (!sameValue(archived[offset], emitted[offset])) {
        throw new TypeError(
          `Archived run trace event ${sourceIndex + offset + 1} contradicts its source scenario authority.`,
        );
      }
    }
    sourceIndex += emitted.length;
  }
  return trusted;
}

function assertReplayLineage(scenario, entry, lineageEntries, seenIds) {
  if (!Array.isArray(lineageEntries)) {
    throw new TypeError("Archived Replay lineage must be an array.");
  }
  const matches = lineageEntries.filter((candidate) => candidate?.id === entry.replayOf);
  if (matches.length !== 1 || matches[0].id === entry.id) {
    throw new TypeError("Archived Replay lineage must resolve one distinct source entry.");
  }

  const source = matches[0];
  if (
    source.scenarioId !== entry.scenarioId
    || (source.scenario !== undefined && !sameValue(source.scenario, scenario))
  ) {
    throw new TypeError("Archived Replay lineage has an inconsistent source scenario.");
  }
  assertRunEntry(scenario, source, { lineageEntries, seenIds });
  if (
    !sameValue(entry.trace, source.trace)
    || entry.stepIndex !== source.stepIndex
    || entry.tripCount !== source.tripCount
    || !sameValue(entry.jobOrder, source.jobOrder)
  ) {
    throw new TypeError("Archived Replay lineage contradicts its source entry.");
  }
}

function assertRunEntry(
  scenario,
  entry,
  { lineageEntries = [], seenIds = new Set(), trustedCurrentRun = false } = {},
) {
  if (!entry || typeof entry !== "object" || !Array.isArray(entry.trace) || entry.trace.length === 0) {
    throw new TypeError("Archived run must contain a non-empty trace.");
  }
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    throw new TypeError("Archived run id is required.");
  }
  if (entry.scenarioId !== scenario.id) {
    throw new TypeError("Archived run scenario identity is inconsistent.");
  }
  if (entry.schemaVersion !== undefined && entry.schemaVersion !== 1) {
    throw new TypeError("Archived run schemaVersion must be 1.");
  }

  const runNumberText = entry.id.startsWith(`${scenario.shortId}-`)
    ? entry.id.slice(scenario.shortId.length + 1)
    : "";
  const runNumber = Number(runNumberText);
  if (!/^\d{4,}$/.test(runNumberText) || !Number.isSafeInteger(runNumber) || runNumber < 1) {
    throw new TypeError("Archived run id does not belong to its source scenario.");
  }
  if (entry.runNumber !== undefined && runIdForScenario(scenario, entry.runNumber) !== entry.id) {
    throw new TypeError("Archived run number is inconsistent with its id.");
  }
  if (entry.replayOf !== null && (typeof entry.replayOf !== "string" || entry.replayOf.trim() === "")) {
    throw new TypeError("Archived run replayOf must be null or a run id.");
  }
  if (seenIds.has(entry.id)) {
    throw new TypeError("Archived Replay lineage contains a cycle.");
  }
  const nextSeenIds = new Set(seenIds);
  nextSeenIds.add(entry.id);

  const trusted = reconstructTrustedRun(scenario, entry.trace);
  if (
    entry.stepIndex !== trusted.stepIndex
    || entry.tripCount !== trusted.tripCount
    || !sameValue(entry.jobOrder, trusted.jobOrder)
    || (entry.speed !== undefined && entry.speed !== trusted.speed)
  ) {
    throw new TypeError("Archived run final state contradicts its source scenario trace.");
  }
  if (entry.replayOf !== null && !trustedCurrentRun) {
    assertReplayLineage(scenario, entry, lineageEntries, nextSeenIds);
  }
  const expectedStatus = entry.replayOf === null ? trusted.status : "paused";
  if (entry.status !== expectedStatus) {
    throw new TypeError("Archived run final state contradicts its source scenario trace.");
  }
  return true;
}

export function assertArchivedRunEntry(scenario, entry, lineageEntries = []) {
  return assertRunEntry(scenario, entry, { lineageEntries });
}

function buildReplayedRun(scenario, entry, runNumber) {
  const reconstructed = replayTrace(scenario, entry.trace, runNumber);
  return {
    ...reconstructed,
    status: "paused",
    replayOf: entry.id,
    tripCount: entry.tripCount ?? reconstructed.tripCount,
  };
}

export function replayRunState({
  scenario,
  currentRun,
  entry,
  lineageEntries = [],
  runNumber = currentRun.runNumber + 1,
}) {
  assertArchivedRunEntry(scenario, entry, lineageEntries);
  return buildReplayedRun(scenario, entry, runNumber);
}

export function replayCurrentRunState({ scenario, currentRun, runNumber = currentRun.runNumber + 1 }) {
  assertRunEntry(scenario, currentRun, { trustedCurrentRun: true });
  return buildReplayedRun(scenario, currentRun, runNumber);
}
