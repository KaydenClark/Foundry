# Foundry Blueprint

**Status:** active
**Product repository:** `github.com/KaydenClark/Foundry`
**Staging branch:** `integration`

The Foundry is a portable agent operating system. Its currently declared Canon
roster contains thirteen native Halls; an explicit Canon amendment may change
that roster, so thirteen is not a permanent product invariant. The integrated
checkout contains every currently declared Hall path. It also contains reusable
roles and scheduling mechanics, project and memory capabilities, install
metadata for optional Modules, and deterministic tools.

## Product Map

```text
Foundry/
|-- Halls/                               native source for the Canon-declared Hall roster
|-- Schematic/                           separately owned visual blueprint
|-- Roles/                               remaining legacy authority contracts during role-skill migration
|-- Projects/                            explicit enrollment/index capability
|-- Wiki/                                generic memory schema and routing
|-- Scheduled/Captain/                   reusable AFK policy/configuration
|-- Modules/                             ignored installed product repositories
|-- manifest/foundry.json                component declaration
|-- templates/                           adoption and instance templates
`-- tools/                               lifecycle, adoption, and Captain tools
```

## Current Hall Roster

This table is the current thirteen-Hall declaration. Hall count and composition
may change only through an explicit Canon amendment that also updates identities,
contracts, migration evidence, and every derived projection.

| ID | Hall | Path | Responsibility |
|---|---|---|---|
| 2K7P | Intake | `Halls/Intake/` | Deterministically creates candidate Job Orders only |
| 8L4T | Validation | `Halls/Validation/` | Read-only passage findings for Orchestration |
| 6V1N | Gatehouse | `Halls/Gatehouse/` | Passage infrastructure, clearance, scans, and append-only receipts; authorizes nothing |
| 3W9H | Orchestration | `Halls/Orchestration/` | Decomposes, routes, delegates, and places work |
| 5B2Y | Design | `Halls/Design/` | Develops complex solutions when selected by Orchestration |
| 1R6F | Knowledge | `Halls/Knowledge/` | Houses organizational-knowledge Socket contracts, including Recall |
| 7C4J | Scheduling | `Halls/Scheduling/` | Makes Orchestration-selected schedules run reliably |
| 7M2Q | Forge | `Halls/Forge/` | Builds and improves the Foundry producer itself |
| 9P8A | Production | `Halls/Production/` | Makes bounded changes to products and projects the Foundry produces |
| 4X8C | Assay | `Halls/Assay/` | Read-only independent audit and judgment |
| 6G3S | Ward | `Halls/Ward/` | Bounded repair and integration into `integration` |
| 9D3R | Gauge | `Halls/Gauge/` | Observes Gatehouse passages and supplies derived live visibility and notifications |
| 2N5E | Shipping | `Halls/Shipping/` | Packages a declared producer into a reproducible deployable product; name provisional |

A Hall is native tracked source. A Module is optional, separately owned, and
installed from its own product repository. The canonical Foundry clone therefore
arrives with every Hall in the current Canon declaration.

## FUID Identity Contract

FUID is the permanent identity shared across Foundry architecture and work.
Four-character uppercase base36 values identify Halls, Modules, Sockets, and
Projects/Workshops. Six-character values identify Specs, Tickets, Intent
requests, Job Orders, and passage receipts. The identifier encodes no type or
parentage; those remain registry fields.

All-zero is reserved. New sequential allocation starts at `0001`/`000001`,
advances `0-9A-Z`, persists one high-water mark per width, and skips every active
or retired value. S-001's existing opaque identities are grandfathered permanent
FUIDs outside the new sequential chain and remain reserved rather than being
renumbered. Typed IDs remain unique compatibility aliases and no migration
bulk-renames historical paths.

The portable registry owns product entities, validation, and allocator rules.
An instance registry owns private Project/Workshop and work-item allocations;
portable validation may compose that registry without publishing its contents.
Canonical registries and task controls allocate. Recall may resolve only with
provenance and freshness and fails closed to Canon.

Every Spec and Ticket carries immutable `Created` and substantive `Last worked`
dates. Claim, close, completion, and explicit content mutation advance Last
worked. Rendering, projection refresh, lookup, and polling do not. `Updated`
remains a temporary compatibility field while consumers migrate. S-002 owns the
portable implementation and root S-036 owns the instance/CIC slice.

## Ownership Boundary

The product owns its controls, Halls,
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
| FUID | Spec alias | Description | Status | Created | Last worked |
|---|---|---|---|---|---|
| 00005E | [S-001 - Hall Architecture And Identity Registry](specs/S-001-hall-architecture-and-identity-registry/SPEC.md) | Establish the thirteen-Hall Foundry architecture, durable identity model, and staged passage contracts. | complete | 2026-08-12 | 2026-08-17 |
| 000002 | [S-002 - FUID Registry And Lifecycle](specs/S-002-fuid-registry-and-lifecycle/SPEC.md) | Extend the Foundry identity registry and Workbench lifecycle with fixed-width base36 FUID allocation, aliases, and Created/Last worked metadata. | complete | 2026-08-18 | 2026-08-18 |
| 00009K | [S-003 - Heartbeat Socket](specs/S-003-heartbeat-socket/SPEC.md) | Publish one portable FUID-primary Heartbeat Socket and a privacy-safe Gauge feed that exposes current Foundry activity without inventing lifecycle state. | planned | 2026-08-30 | 2026-08-30 |
| 00009O | [S-004 - Job Order Flight Observation Feed](specs/S-004-job-order-flight-observation-feed/SPEC.md) | Publish a privacy-safe Gauge observation feed for real seven-stage Job Order flights derived from lifecycle, Journal-health, and passage Actuality. | planned | 2026-08-30 | 2026-08-30 |
<!-- spec-catalog:end -->

## Design Decisions

- Physical organization is `Halls/`; a socket is a capability contract housed
  inside a Hall, not a filesystem tier.
- Role delivery is migrating to flat shared skills; `Roles/` contains the
  remaining legacy contracts during that transition. Scheduling policy is
  canonical under `Scheduled/Captain/`.
- Projects and Wiki are portable capabilities, never copied instance data.
- Schematic is a separately owned Projection producer. It is the interactive
  visual blueprint of Canon and the intended end-state design, not the native
  product interface, not CIC, and not live Actuality. Its deterministic Job
  Order runs are explanatory simulations only. It remains producer-only during
  migration; S-035 requires the next authorized Shipping artifact to include it
  in the Foundry product only after named Proof and independent Assay gates pass.
- Modules keep independent repositories and are installed, not vendored.
- Automated delivery stops at `integration`; `main` promotion is owner-only.
