import assert from "node:assert/strict";
import test from "node:test";

import viteConfig from "../vite.config.js";

test("development and preview servers are reachable through the host mesh interface", () => {
  const expected = {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: ["Servitor.local", "foundry.example"],
  };

  assert.deepEqual(viteConfig.server, expected);
  assert.deepEqual(viteConfig.preview, expected);
});
