# Projects Capability

`Projects/` is the Foundry-owned workspace for explicitly enrolled producer
projects. Enrollment is registry-driven; the tooling never discovers projects
by scanning arbitrary directories.

From a fresh Foundry root:

```bash
node Projects/tools/projects.mjs init --root .
node Projects/tools/projects.mjs enroll --root . \
  --id P-001 --name "Example Project" --owner example-owner \
  --project Projects/example-project
node Projects/tools/projects.mjs check --root .
```

Each enrolled path must be a real directory under the instance's `Projects/`
folder and must contain `AGENTS.md`. The instance registry is
`Projects/projects.json`; `Projects/INDEX.md` is its deterministic generated
view. IDs and paths are unique, and entries render in stable ID order.

Producer source for this capability lives under `Foundry/Projects/`; packaging
places it at product-root `Projects/`. A populated instance registry and its
project checkouts are instance content, not reusable producer source.
