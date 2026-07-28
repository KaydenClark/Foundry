# Servitor Foundry - Blueprint

**Status:** active
**Product repository:** `github.com/KaydenClark/Foundry`
**Staging branch:** `integration`

This repository is the portable Servitor Foundry harness. It owns the reusable
composition and governance layer; a deployment such as GPT_OS is one instance
that adopts it.

> Foundry : instance :: Workbench : project.

## Navigation

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Authority order, scope, safety, and the work loop |
| [LEXICON.md](LEXICON.md) | Shared Foundry definitions |
| [TASKBOARD.md](TASKBOARD.md) | Generated hot projection of active harness specs |
| [RUNBOOK.md](RUNBOOK.md) | Exact setup, validation, audit, and recovery commands |
| [README.md](README.md) | Human-facing clone and "set up my foundry" entrypoint |
| [specs/](specs/) | Durable capability requirements, tickets, decisions, proof |
| [manifest/foundry.json](manifest/foundry.json) | The native-Hall / installed-Module component declaration |
| [forge/](forge/) | The Forge — native Hall, builds/releases the Workbench |
| [audit-engine/](audit-engine/) | The Assay — native Hall, read-only quality audit |
| [pip/](pip/) | The Ward — native Hall, integration/fit checking |
| [gatehouse/](gatehouse/) | The Gatehouse — native Hall, scaffold only, no implementation yet |

## The Four Halls Of The Foundry

The Foundry has exactly four Halls: **the Forge**, **the Assay**, **the
Ward**, and **the Gatehouse**. This is the organizational tier of the factory
floor — the rooms an agent enters to get its work, its skills, and its stance.
A Hall is a complete vertical boundary with its own lifecycle; tickets are the
sole interface between Halls.

As of S-024, the Forge, the Assay, and the Ward are **native Halls**: tracked
source inside this repository (`forge/`, `audit-engine/`, `pip/`), not
components a manifest installs. A clone of `KaydenClark/Foundry` alone yields
a working Forge, Assay, and Ward with zero additional clones. The Gatehouse
(`gatehouse/`) is scaffolded the same way — native from the start — but has no
implementation yet; see `gatehouse/BLUEPRINT.md`.

Only **Modules** (OpenBrain, Command Information Center, Slack, Discord)
remain genuinely optional, separately owned, and independently releasable —
they are the only components the install manifest still clones from a remote.
Each is a self-contained mini-Workbench: it carries its own `AGENTS.md`,
`BLUEPRINT.md`, `LEXICON.md`, `RUNBOOK.md`, `TASKBOARD.md`, `CLAUDE.md`,
`README.md`, and, for the three folded Halls, its own `specs/`, tests, and
tooling — read the nearest one for project-local detail; this Blueprint owns
only the composition layer above them.

## Product Map

A Foundry turns one instance root into a governed set of Workbench rooms. The
harness supplies controls, its four native Halls, installation metadata for
Modules, socket composition, Captain/scheduler policy, roles-as-skills, setup
protocols, and verification. It installs Modules from their own repositories
and never absorbs their source histories; the native Halls travel with the
harness itself.

Reference deployment layout:

```text
<instance-root>/
|-- Foundry/                    <- this repository
|   |-- AGENTS.md
|   |-- BLUEPRINT.md
|   |-- RUNBOOK.md
|   |-- manifest/foundry.json
|   |-- forge/                 <- native Hall: the Forge, tracked source
|   |-- audit-engine/          <- native Hall: the Assay, tracked source
|   |-- pip/                   <- native Hall: the Ward, tracked source
|   |-- gatehouse/             <- native Hall: the Gatehouse, scaffold only
|   |-- Modules/               <- installed repos; ignored by Foundry Git
|   `-- .worktrees/            <- registered worktrees; ignored by Foundry Git
|-- Wiki/                      <- live instance memory; never harness data
|-- Projects/                  <- instance project rooms
|-- .foundry/                  <- instance bindings and installation marker
`-- .local/foundry/            <- receipts, scheduler state, and runtime output
```

The harness root is resolved from the running tool, while the instance root is
an explicit argument. No host-specific absolute path is part of the contract.

## Ownership Model

### Foundry harness

Tracked in `KaydenClark/Foundry`:

- the root control surface and stable harness specs;
- the four native Halls (`forge/`, `audit-engine/`, `pip/`, `gatehouse/`) as
  ordinary tracked source, each a self-contained mini-Workbench;
- `manifest/foundry.json`, its schema checks, and Module install destinations;
- socket-registry discovery and binding validation through the native Forge;
- Captain/scheduler policy and portable configuration templates;
- Team roles delivered as `skills/role-*`, never as a second `Roles/` store;
- Foundry control-plane tools and repeatable tests;
- `templates/ADOPTION.md`, `templates/GENESIS.md`, the adoption skill, and the
  template Wiki;
- explanatory reference material that contains no live-health claims.

### Native Halls versus installed Modules

| | Native Hall | Installed Module |
|---|---|---|
| Examples | the Forge, the Assay, the Ward, the Gatehouse | OpenBrain, CIC, Slack, Discord |
| Necessity | a Foundry is not a Foundry without it | optional capability |
| Lives in | `KaydenClark/Foundry`, tracked source | its own repo, own remote |
| Arrives by | `git clone` of the Foundry itself | adoption manifest install |
| No-vendoring rule | does not apply | applies |
| Ownership | the Foundry product | the component's own repo |
| Manifest fields | `tier: "native-hall"`, `family: "Halls"`, `path` | `tier: "installed-module"`, `family: "Modules"`, `remote`/`ref`/`destination` |

| Stable ID | Hall | Path | Folded from (historical, read-only archive) |
|---|---|---|---|
| F-001 | the Forge | `forge/` | `KaydenClark/LLM_Workbench` — see Design Decisions (TK-004) |
| F-002 | the Assay | `audit-engine/` | `KaydenClark/Audit-Engine` |
| P-012 | the Ward | `pip/` | `KaydenClark/personal-intelligence-platform` |
| G-001 | the Gatehouse | `gatehouse/` | none — born native, never a separate repo |

| Family | Stable ID | Component | Remote | Staging ref | Destination |
|---|---|---|---|---|---|
| Module | P-010 | OpenBrain | `KaydenClark/OpenBrain` | `integration` | `Modules/OpenBrain` |
| Module | P-005 | Command Information Center | `KaydenClark/command-information-center` | `Integration` | `Modules/Command Information Center` |
| Module | M-002 | Servitor Slack | `KaydenClark/Slack` | `integration` | `Modules/Slack` |
| Module | M-001 | Servitor Discord (paused) | `KaydenClark/Discord` | `integration` | `Modules/Discord` |

Each component's `status` is one of `active` (working today), `paused` (was
active, temporarily off — e.g. Discord), or `planned` (exists but has no
implementation yet — the Gatehouse). `planned` is distinct from `paused`: it
never ran, rather than having stopped running.

Repository visibility is not a composition rule. An adopter needs existing
non-interactive read access for private Module repositories; the harness never
stores or provisions credentials. The three folded Halls' former remotes
(`LLM_Workbench`, `Audit-Engine`, `personal-intelligence-platform`) are not
deleted — they remain as historical archives, same as any repo that stops
being the live source. See Design Decisions below for the `LLM_Workbench`
tier decision specifically.

### Instance data

The deployment, not the harness, owns:

- live Wiki memory and per-room brains;
- project rooms and the instance routing registry;
- socket bindings, module configuration, and credentials;
- `.local` receipts, logs, caches, scheduler counters, and runtime state;
- launchd/systemd/Task Scheduler bindings and host-specific paths;
- provider discovery symlinks, active handoffs, worktrees, and local recovery
  material.

### Historical and archive material

Superseded controls, completed one-release manifests, expired handoffs,
grilling diaries after promotion, migration-only tools, and stale live-status
drawings remain evidence. They are not active harness machinery and are not
silently copied into a new instance.

## GPT_OS Source Split Map (TK-001)

This is a build map, not a file-move plan. GPT_OS remains untouched until the
owner approves the separate live cutover.

| Current GPT_OS scrap | Disposition | Harness result | Entanglement / cutover note |
|---|---|---|---|
| `Roles/` | `move-to-foundry-harness` | Re-author the seven durable contracts as `skills/role-*` with an explicit in-context/no-spawn header. | Reconcile with GPT_OS S-016. Do not copy raw files or retire `Roles/` until that spec's checks and TK-003 cutover run. Instance-specific paths/model policy are parameterized. |
| `Scheduled/` | `move-to-foundry-harness` (split) | Ship generic Captain/AFK policy, workflow schema/examples, and schedule-install guidance. | `READY_QUEUE.md`, active enrollment, handoff flags, external automation state, project-specific schedules, and local counters remain instance data. PR-34 and completed verifier manifests are archive evidence. |
| `tools/` | `move-to-foundry-harness` (split) | Foundry owns manifest/adoption/doctor, portable Captain controls, binding checks, and cross-instance verification. | GPT_OS `.gitignore` whitelists specific tools and root controls call `Foundry/Sockets/Forge/tools/spec-workbench.mjs`; neither path nor mirror scope changes before TK-003. `foundry-migration-preflight` and the fixed PR-34 executor are historical/instance-specific. `wiki-cloud-projects.json` is instance data. |
| `SKILLs Maker/` | `defer` | No raw copy in the first harness. | `create-skill` is a candidate reusable build skill; `update-harness` duplicates the Forge-owned canonical skill; the dataset skill is project/personal-specific; DOCX/source packages need provenance and ownership review. |
| `project templates/` | `defer` | Foundry references the installed Forge for Workbench/project templates. | `VISUAL_DESIGN.md` is an instance preference, not a Foundry contract. Do not create a second template owner. |
| `.agents/` | `keep-instance` | Adoption may create provider discovery links from a template, never track the live link or diary. | Current `.agents/skills` is an absolute symlink to the Forge; grilling diary/prep files are transient or historical instance material. |
| `handoffs/` | `keep-instance` | Define a receipt/handoff schema only. | Live handoffs and their freshness belong to the deployment; archive them after their owning work closes. |
| `grilling/` | `archive` | No active harness folder. | The provisional staging README is superseded by the gitignored `.agents/grilling diary` flow and stable specs. |
| `Foundry/reference/` | `move-to-foundry-harness` | Ship a portable, non-authoritative architecture reference. | The current drawing contains historical Discord/model/live-status labels; adapt it and label it as a map, never a health source. |
| `Foundry/CIC-worktrees/` | `archive` | None. | Verified empty leftover. Remove only during owner-approved cutover/cleanup. |
| `Foundry/.worktrees/` | `keep-instance` | Ship only the ignored destination convention and safety rules. | Eleven registered worktrees are live Git metadata owned by their component repositories; never move, copy, or hand-delete them during harness build. |

### Tool ownership detail

| Tool family | Destination |
|---|---|
| manifest, adoption, harness doctor, boundary/portability checks | Foundry harness |
| Captain decision core, Git preflight, ready-queue projection, save gate | Foundry harness after instance-root/state paths are parameters |
| socket contract registry and validator | Installed Forge; Foundry manifest points to it and never duplicates it |
| project index, Wiki/vault link checks, instance ID/binding registry | Split: reusable validators in harness; live registry, project list, and cloud target config in instance |
| fixed Workbench PR-34 executor/manifest | archive; one-release GPT_OS evidence |
| Foundry physical-migration preflight | archive after TK-003; cutover-only evidence, not a permanent setup API |

## Socket Composition Contract

The install manifest declares Module repositories and where the native Forge's
traveling contract registry can be found. It never records secrets or an
active instance binding.

The native Forge (`forge/`) owns the Git-canonical socket contract registry at
`forge/tools/socket-registry/registry.json`. The instance copies
`templates/instance/bindings.json` to
`<instance-root>/.foundry/bindings.json` and may then choose which compatible
Module fills each socket. A connection is valid only through the declared
contract entrypoint; filesystem/database reach-arounds are rejected.

Current proven registry coverage is K-001 recall. K-002 messaging and K-003
interface components are installed and represented in the instance binding
template, but their machine-readable Forge contract records are still pending;
the doctor reports them as pending instead of inventing or duplicating a
contract. K-004 finance remains planned and unbound.

## Control Surface

| Artifact | Owns |
|---|---|
| `AGENTS.md` | authority, boundaries, work loop, Git, safety, proof |
| `BLUEPRINT.md` | product/instance architecture and ownership split |
| `LEXICON.md` | shared Foundry definitions |
| `TASKBOARD.md` | generated hot projection of active harness specs |
| `specs/` | durable capability requirements, tickets, decisions, and proof |
| `RUNBOOK.md` | exact setup, validation, audit, recovery, and Git commands |
| `README.md` | human-facing clone and "set up my foundry" entrypoint |
| `CLAUDE.md` | thin provider bridge to `AGENTS.md` |

## Setup And Adoption Flow

1. Create or select an instance root; never assume a username or home path.
2. Clone `KaydenClark/Foundry` into `<instance-root>/Foundry` at an explicit
   ref. This one clone already includes the Forge, the Assay, the Ward, and
   the Gatehouse scaffold as native tracked source — nothing more to fetch for
   the four Halls.
3. Run `foundry.mjs adopt --instance-root <instance-root>`.
4. Validate the manifest before any clone. Refuse duplicate IDs/destinations,
   absolute/traversing destinations, embedded credentials, and binding data.
5. Clone each installed Module to its ignored destination and check out its
   declared staging ref. Existing destinations must have the expected origin;
   adoption never overwrites or resets them. Native Halls are verified present
   with their required control docs, never cloned.
6. Seed the template Wiki only when the target files do not exist. An existing
   Wiki is inventoried and preserved for the later migration/cutover plan.
7. Copy the binding template into instance-owned `.foundry/`, keeping paths
   relative to the instance and leaving credentials absent.
8. Write a sanitized receipt under `.local/foundry/` with manifest digest,
   harness source ref/SHA, component remotes/refs/resolved SHAs, and checks run.
9. Run Foundry doctor, boundary and portability tests, then Audit Engine against
   the Foundry checkout. Audit Engine remains read-only toward the target.
10. Stop at `integration`. Live service bindings and an existing deployment's
    ownership cutover require the separate owner gate.

## Architecture And Invariants

- Build the portable contract; do not relocate the live GPT_OS tree.
- Native Halls are ordinary tracked source in this repository; no-vendoring
  does not apply to them. Installed Modules remain independent Git roots and
  are always ignored by the Foundry repository; no-vendoring applies to them
  only.
- Instance paths are parameters. Committed artifacts contain no host-specific
  absolute paths, credentials, `.env` values, or runtime state.
- The template Wiki is shippable; live memory is never copied back into the
  harness.
- Roles are skills that change the current agent's stance. They never spawn an
  agent; explicit Captain dispatch creates separate tasks.
- Audit is read-only and fail-visible. Missing private-repo access, pending
  socket contracts, or unavailable checks are reported, not papered over.
- `integration` is the automation finish line. Only the owner promotes to
  `main`.

## Non-Goals

- Vendoring installed Modules. (Native Halls are not vendored either — they
  were never a separate install in the first place.)
- Moving GPT_OS controls, live Wiki, worktrees, projects, secrets, launchd
  bindings, or runtime data during TK-001/TK-002.
- Completing K-002/K-003 machine-readable socket contracts in a second owner.
- Publishing a supported external distribution or changing repository
  visibility.
- Performing the GPT_OS live cutover; that is S-018/TK-003 and owner-gated.
- Building any Gatehouse implementation in this pass — see `gatehouse/BLUEPRINT.md`
  Non-Goals for the scaffold-specific list.
- Deleting or force-pushing the folded Halls' former public remotes
  (`LLM_Workbench`, `Audit-Engine`, `personal-intelligence-platform`); they
  stay as untouched historical archives.

## Spec Catalog

<!-- spec-catalog:start -->
| Spec | Description | Status |
|---|---|---|
| [S-001 - Portable Foundry Harness](specs/S-001-portable-foundry-harness/SPEC.md) | Design, build, and prove the first portable Foundry harness without moving a live instance. Its original all-install-by-manifest contract is superseded in part by the native-Hall model (2026-07-28 addendum below); evidence below is unmodified. | active |
| [S-002 - Native-Hall / Installed-Module Composition Model](specs/S-002-native-hall-installed-module-model/SPEC.md) | Record the native-Hall / installed-Module composition model as a durable capability of this repository — what each tier means, why the fold happened, the manifest schema shape that already implements it, and acceptance criteria for landing the pending branch and for the Gatehouse's first real slice. | active |
<!-- spec-catalog:end -->

## Design Decisions

| Decision | Rationale | Date |
|---|---|---|
| Harness checkout lives at `<instance-root>/Foundry` | Keeps reusable controls/components together while Wiki, projects, bindings, and runtime remain instance-owned siblings. | 2026-07-21 |
| Install repositories from an explicit manifest | Preserves component histories and makes a blank adoption deterministic and auditable. | 2026-07-21 |
| Forge remains the socket-contract registry owner | Extends S-014 without creating a parallel registry in the composition repository. | 2026-07-21 |
| Convert roles to skills in the new harness | Matches S-016's target mechanism without moving or prematurely retiring GPT_OS role sources. | 2026-07-21 |
| Fold the Forge, the Assay, and the Ward into `KaydenClark/Foundry` as native tracked source (`forge/`, `audit-engine/`, `pip/`); manifest gains `tier: native-hall` requiring no `remote`, versus `tier: installed-module` requiring one | GPT_OS S-024, on Kayden's explicit direction ("FULL SEND ... put them all under the foundry as sockets"): a Foundry cannot stand alone if its own foundations require three separate remote clones. The manifest schema previously *forbade* the correct shape (required `remote`+`destination` for every component); TK-003 makes native-Hall the valid alternative rather than special-casing it. | 2026-07-28 |
| Scaffold `gatehouse/` as the fourth native Hall, honestly labeled as unimplemented | Kayden authorized creating the Gatehouse the same way as the folded three — native from the start, never a separate repo — so the tree names all four Halls even though only three have working source. Building the containment boundary itself is explicitly out of scope for this pass. | 2026-07-28 |
| `KaydenClark/LLM_Workbench` becomes a read-only historical archive, same treatment as the retired `Audit-Engine`/`personal-intelligence-platform` remotes; the living template tier (`forge/templates/`, the `ADOPTION.md`/`GENESIS.md`/control-doc stamping machinery) continues development inside `forge/` in this repository | TK-004. `forge/` is now native tracked source and IS the Forge Hall's home — keeping `LLM_Workbench` simultaneously "live" for template changes would create two mutable sources of the same template truth, violating single ownership. This is a documented default, not a certainty: if Kayden wants `LLM_Workbench` kept as a separate published distribution channel for external consumers who want the Workbench without the whole Foundry, that overrides this default. | 2026-07-28 |
