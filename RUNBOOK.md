# Foundry Runbook

Run commands from the Foundry product root.

## Verify Product Source

```bash
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/test-foundry.mjs
node tools/test-captain.mjs
node tools/test-spec-workbench.mjs
node Projects/tools/test-projects.mjs
node Wiki/tools/test-wiki.mjs
node Halls/Forge/tools/test-foundry-source-root.mjs
node Halls/Forge/tools/test-foundry-publisher.mjs
npm test --prefix Schematic
npm run test:safety --prefix Schematic
npm run build --prefix Schematic
node tools/spec-workbench.mjs render
node tools/spec-workbench.mjs doctor
git diff --check
```

Hall-specific verification remains in each `Halls/*/RUNBOOK.md`. The Assay is
read-only; the Ward may report expected degraded Module freshness on an instance
without configured Module state.

Install the Schematic's pinned dependencies once before the full product suite:

```bash
npm ci --prefix Schematic
```

The Schematic build writes ignored `Schematic/dist/` and has no server-side or
production-execution dependency. Its complete local demo and recovery procedure
live in `Schematic/RUNBOOK.md`.

The immutable source inventory deliberately excludes the declared
producer-only Module class. It still fails on every unclassified, private,
secret, runtime, or generated path before an artifact can be approved.
Adoption adds `/Modules/` to that product checkout's local Git exclusions; it
does not rewrite tracked `.gitignore` policy or publish local Git metadata.

## Projects And Wiki

```bash
node Projects/tools/projects.mjs init --root .
node Projects/tools/projects.mjs enroll --root . \
  --id P-001 --name "Example" --owner example-owner \
  --project Projects/example
node Wiki/tools/wiki.mjs init --root .
node Projects/tools/projects.mjs check --root .
node Wiki/tools/wiki.mjs check --root .
```

Enrollment is explicit; neither tool discovers arbitrary directories or private
notes. Existing managed memory notes are never overwritten.

## Adoption

```bash
node tools/foundry.mjs plan --instance-root /ABSOLUTE/INSTANCE
node tools/foundry.mjs adopt --instance-root /ABSOLUTE/INSTANCE
node tools/foundry.mjs doctor --instance-root /ABSOLUTE/INSTANCE
```

Plan must pass before adoption. Adoption validates the complete manifest and
existing destinations before cloning, verifies native Halls in place, clones
only installed Modules, preserves existing instance files, and writes receipts
outside product Git. Use `--source-map FILE` only for controlled offline tests.

## Captain Level Zero

```bash
node tools/captain.mjs validate --config Scheduled/Captain/workflows.example.json
node tools/captain.mjs level-zero --signals /ABSOLUTE/signals.json \
  --state /ABSOLUTE/instance-state.json
```

No-change must spawn zero models. Active schedule installation is an instance
operation and is never enabled implicitly by product adoption.

## Recovery

- Dirty or mismatched Module destination: stop; never reset or replace it.
- Missing native Hall control: restore from this product's Git history.
- Unsafe path, symlink, or instance marker: correct the instance boundary and
  rerun plan; do not bypass validation.
- Missing private-repository access: repair operator Git access outside the
  Foundry; do not store credentials in product or instance templates.
- Delivery targets `integration` with an explicit refspec. `main` remains
  owner-only.
