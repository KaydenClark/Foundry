# Foundry Blueprint

**Status:** active
**Product repository:** `github.com/KaydenClark/Foundry`
**Staging branch:** `integration`

The Foundry is a portable agent operating system. A checkout contains its four
native Halls, reusable roles and scheduling mechanics, project and memory
capabilities, install metadata for optional Modules, and deterministic tools.

## Product Map

```text
Foundry/
|-- Halls/{Forge,Assay,Ward,Gatehouse}/  native product source
|-- Schematic/                           standalone six-floor simulator
|-- Roles/                               reusable authority contracts
|-- Projects/                            explicit enrollment/index capability
|-- Wiki/                                generic memory schema and routing
|-- Scheduled/Captain/                   reusable AFK policy/configuration
|-- Modules/                             ignored installed product repositories
|-- manifest/foundry.json                component declaration
|-- templates/                           adoption and instance templates
`-- tools/                               lifecycle, adoption, and Captain tools
```

## The Four Halls

| ID | Hall | Path | Responsibility |
|---|---|---|---|
| F-001 | Forge | `Halls/Forge/` | Builds, evaluates, packages, and publishes reusable products |
| F-002 | Assay | `Halls/Assay/` | Performs read-only project and artifact judgment |
| P-012 | Ward | `Halls/Ward/` | Validates Module integration, transport, and health |
| G-001 | Gatehouse | `Halls/Gatehouse/` | Owns containment and Job Order enforcement; currently scaffolded |

A Hall is native tracked source. A Module is optional, separately owned, and
installed from its own product repository. A Foundry clone therefore arrives
with all four Halls and can verify them without additional Hall clones.

## Ownership Boundary

The product owns its controls, Halls, the public-safe Schematic interface,
generic Projects/Wiki behavior, Roles, scheduling primitives, manifest,
templates, references, and tools. A deployed instance owns populated project
data and memory, active bindings and workflows, credentials, receipts, logs,
provider configuration, services, and worktrees.

Installed Module source and release history remain in each Module repository.
The manifest may declare compatible implementations, but socket contracts are
the only integration boundary; filesystem reach-arounds are invalid.
Adoption records `/Modules/` in checkout-local Git exclusions before installing
declared Modules. This keeps product checkouts clean without imposing the
product's runtime ignore policy on an independently tracked producer tree.

## Source And Publication

This product is generated from an independently tracked producer source. The
public repository is an output and is never an authoring input. Packaging reads
one immutable producer commit, constructs a clean temporary tree, enforces the
publication/exclusion contract, scans for secrets and host coupling, and
compares the result byte-for-byte before an explicit `integration` push.
Tracked producer-only Module source is an explicit non-published class. The
inventory may omit that declared class, while unclassified, private, secret,
and runtime paths still fail closed.

Product controls describe this mechanism only. Private producer or instance
contents, filenames, task state, and purpose do not belong in the public tree.

## Adoption Contract

Adoption validates the whole manifest before mutation, verifies native Halls in
place, clones only installed Modules into ignored destinations, preserves
existing Wiki/binding/workflow files, and writes instance receipts outside
product Git. Plan mode is read-only. A failed preflight leaves no partial clone.

## Capability Catalog

<!-- spec-catalog:start -->
| Spec | Description | Status |
|---|---|---|
| none | No specs recorded yet. | n/a |
<!-- spec-catalog:end -->

## Design Decisions

- Physical organization is `Halls/`; a socket is a capability contract housed
  inside a Hall, not a filesystem tier.
- Roles are canonical under `Roles/`; scheduling policy is canonical under
  `Scheduled/Captain/`.
- Projects and Wiki are portable capabilities, never copied instance data.
- Schematic is a native product interface whose initial deterministic engine
  simulates Job Orders locally and cannot execute commands or change Actuality.
- Modules keep independent repositories and are installed, not vendored.
- Automated delivery stops at `integration`; `main` promotion is owner-only.
