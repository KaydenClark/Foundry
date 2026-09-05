function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function fingerprint(projection) {
  return {
    schemaVersion: projection.schemaVersion,
    homes: projection.homes.map(({ id, label }) => ({ id, label })),
    halls: projection.halls.map(({ id, name, status, homeId, mode, inputs, outputs, forbidden }) => ({ id, name, status, homeId, mode, inputs, outputs, forbidden })),
    modules: projection.modules.map(({ id, name, status, implementsSocketIds }) => ({ id, name, status, implementsSocketIds })),
    sockets: projection.sockets.map(({ id, name, status, homeHallId, moduleIds, contract }) => ({ id, name, status, homeHallId, moduleIds, contract })),
  };
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function deriveProjectionSignature(projection) {
  if (!projection?.halls || !projection?.modules || !projection?.sockets || !projection?.homes) {
    throw new TypeError("Projection signature requires the public Foundry Projection.");
  }
  return `S017-PROJECTION-${fnv1a(JSON.stringify(stable(fingerprint(projection))).replaceAll("\\r\\n", "\\n"))}`;
}

export const PROJECTION_SIGNATURE = "S017-PROJECTION-c48efa25";
