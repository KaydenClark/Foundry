function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function downloadScenarioFile(prepared, dependencies = {}) {
  const BlobCtor = dependencies.BlobCtor ?? globalThis.Blob;
  const createObjectURL = dependencies.createObjectURL
    ?? ((blob) => globalThis.URL.createObjectURL(blob));
  const revokeObjectURL = dependencies.revokeObjectURL
    ?? ((url) => globalThis.URL.revokeObjectURL(url));
  const createAnchor = dependencies.createAnchor
    ?? (() => globalThis.document.createElement("a"));
  const appendAnchor = dependencies.appendAnchor
    ?? ((anchor) => globalThis.document.body.append(anchor));
  const defer = dependencies.defer ?? ((callback) => globalThis.setTimeout(callback, 0));

  let objectUrl = "";
  let anchor = null;
  let cleanupQueued = false;
  const queueCleanup = () => {
    if (cleanupQueued || (!anchor && !objectUrl)) return;
    cleanupQueued = true;
    defer(() => {
      anchor?.remove();
      if (objectUrl) revokeObjectURL(objectUrl);
    });
  };

  try {
    const blob = new BlobCtor([prepared.text], { type: prepared.mimeType });
    objectUrl = createObjectURL(blob);
    anchor = createAnchor();
    anchor.href = objectUrl;
    anchor.download = prepared.filename;
    appendAnchor(anchor);
    anchor.click();
    return prepared;
  } finally {
    queueCleanup();
  }
}

export function performScenarioDownload({
  scenarioId,
  prepare,
  download = downloadScenarioFile,
  reportSuccess,
  reportError,
}) {
  try {
    const prepared = prepare(scenarioId);
    if (!prepared.ok) return prepared;
    download(prepared);
    reportSuccess(`Downloaded ${prepared.filename}.`);
    return prepared;
  } catch (error) {
    const message = `Could not download local scenario: ${errorMessage(error)}`;
    reportError(message);
    return { ok: false, errors: [message] };
  }
}

export async function uploadScenarioFile({
  input,
  importDocument,
  reportError,
  readFile = (file) => file.text(),
}) {
  const file = input.files?.[0];
  if (!file) return { ok: false, errors: [] };

  try {
    const documentText = await readFile(file);
    return importDocument(documentText);
  } catch (error) {
    const message = `Could not read scenario file: ${errorMessage(error)}`;
    reportError(message);
    return { ok: false, errors: [message] };
  } finally {
    input.value = "";
  }
}

export function presentScenarioImport({ transact, accept, refuse }) {
  const result = transact();
  if (!result.ok) {
    refuse(result.errors);
    return result;
  }
  accept(result);
  return result;
}
