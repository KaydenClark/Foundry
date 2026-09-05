export const HISTORY_STORAGE_KEY = "foundry-schematic.history.v1";
export const MAX_HISTORY = 20;

export function readHistory(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && Array.isArray(entry.trace))
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function writeHistory(storage, history) {
  try {
    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // History is a convenience projection. A storage failure must not affect the run.
  }
}

export function clearStoredHistory(storage) {
  const cleared = [];
  writeHistory(storage, cleared);
  return cleared;
}
