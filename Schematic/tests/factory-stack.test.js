import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("mobile keeps native panning while touch users retain named orbit controls", () => {
  const factorySource = source("../src/components/FactoryStack.jsx");
  const geometryStyles = source("../src/components/factoryAtlas.css");

  assert.doesNotMatch(geometryStyles, /touch-action:\s*none/);
  assert.match(geometryStyles, /touch-action:\s*pan-x pan-y/);
  assert.match(geometryStyles, /\.factory-stack \.stack-canvas\s*\{[^}]*min-width:\s*0/s);
  assert.match(geometryStyles, /\.factory-stack\.is-compact \.stack-canvas\s*\{[^}]*min-width:\s*0/s);
  assert.match(factorySource, /event\.pointerType === "touch"/);
  assert.match(factorySource, /aria-label="Orbit Foundry left 45 degrees"/);
  assert.match(factorySource, /aria-label="Orbit Foundry right 45 degrees"/);
});
