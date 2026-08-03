# Foundry

The Foundry is a portable agent operating system containing four native Halls,
reusable roles and scheduling, a standalone Schematic interface, explicit
Projects and Wiki capabilities, and safe installation tooling for optional
Modules.

## Start Here

```bash
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/test-foundry.mjs
node tools/test-captain.mjs
node tools/spec-workbench.mjs doctor
```

The checkout already contains:

- `Halls/Forge/`, `Halls/Assay/`, `Halls/Ward/`, and `Halls/Gatehouse/`;
- `Roles/` and `Scheduled/Captain/` reusable mechanics;
- `Schematic/`, a deterministic six-floor Job Order simulator with no production
  execution path;
- `Projects/` and `Wiki/` generic enrollment/memory tooling;
- `manifest/`, `templates/`, and `tools/` for adoption and validation.

## Plan Or Adopt

Plan is read-only:

```bash
node tools/foundry.mjs plan --instance-root /ABSOLUTE/INSTANCE
```

Adoption may clone the optional Modules declared by the manifest and writes
instance receipts outside product Git:

```bash
node tools/foundry.mjs adopt --instance-root /ABSOLUTE/INSTANCE
node tools/foundry.mjs doctor --instance-root /ABSOLUTE/INSTANCE
```

Read `templates/ADOPTION.md` before adopting an existing deployment. Existing
Wiki, bindings, workflows, Module checkouts, and runtime state are preserved.

## Boundaries

Halls are native product source. Modules are independent products installed
under ignored `Modules/` destinations. Populated project rooms, private memory,
credentials, active schedules/bindings, logs, worktrees, and provider state are
instance data and are never published with this repository.

Development targets `integration`; only the owner promotes `integration` to
`main`.

## Foundry Schematic

The standalone app under [`Schematic/`](Schematic/) lets a user run, pause,
step, reset, replay, accelerate, and trip-inject a public-safe Job Order model.
Its six-storey Factory repeats the same four-Hall floor plan on every Governance
Plane, with Projection as the top mirror and Actuality as the bottom work floor.
The simulator changes local UI state only and stays separate from CIC.
