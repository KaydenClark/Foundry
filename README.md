# Undeployed recovery status

This is an unfinished, non-deployed Foundry template. The broken flight workflow
is preserved for future development; no working flight or deployment is claimed.
See [recovery supplement](recovery/README.md) for the additional source,
inventory, and known gaps. Do not adopt or deploy it as part of ordinary work.

# Foundry

The Foundry is a portable agent operating system whose currently declared Canon
roster contains thirteen native Halls. An explicit Canon amendment may change
that roster; the count is not a permanent product invariant. The product also
contains reusable roles and scheduling, explicit
Projects and Wiki capabilities, and safe installation tooling for optional
Modules.

This repository is the public, open-source Foundry template. It contains only
portable product source: adopters supply their own projects, private memory,
credentials, provider configuration, schedules, runtime state, and optional
Module access. Foundry is released under the [MIT License](LICENSE).

## Start Here

```bash
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/test-foundry.mjs
node tools/test-captain.mjs
node tools/spec-workbench.mjs doctor
```

The checkout contains all thirteen paths in the currently declared Hall roster.
A future roster change still requires an explicit Canon amendment and matching
identity, manifest, migration, and projection updates.

The checkout also contains:

- every current native Hall under `Halls/`;
- remaining legacy `Roles/` contracts during role-skill migration and
  `Scheduled/Captain/` reusable mechanics;
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

## Reinstall Or Restart

Treat a tagged GitHub release as the recovery package. Clone that tag into a
new checkout, verify it before installation, then run the read-only plan before
adopting it into an instance:

```bash
git clone --branch TAG --depth 1 https://github.com/KaydenClark/Foundry.git Foundry
cd Foundry
node tools/foundry.mjs validate-manifest
node tools/foundry.mjs doctor --harness-only
node tools/test-foundry.mjs
node tools/foundry.mjs plan --instance-root /ABSOLUTE/INSTANCE
```

Only run `adopt` after reviewing the plan and satisfying the instance's own
authorization, privacy, and recovery requirements. Adoption does not enable an
active schedule implicitly.

## Boundaries

Halls are native product source. Modules are independent products installed
under ignored `Modules/` destinations. Populated project rooms, private memory,
credentials, active schedules/bindings, logs, worktrees, and provider state are
instance data and are never published with this repository.

Development targets `integration`; only the owner promotes `integration` to
`main`.

## Foundry Schematic

The separately owned Schematic app is the interactive visual blueprint of
Foundry Canon and the intended end-state design. It is producer-side material
and is not included in this public package. It is not the Foundry native product
interface, not CIC, and not a live Actuality mirror.
