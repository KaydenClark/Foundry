# Servitor Foundry - Lexicon

These definitions are shared across the portable harness and its instances.
Root GPT_OS `LEXICON.md` (out of this repository) carries the *canonical*
Hall vocabulary — **Hall**, **the Forge**, **the Assay**, **the Ward**, **the
Gatehouse**, **Job Order**, **Socket**, **Blessed module** — decided in GPT_OS
S-024 TK-002. This file does not redefine those terms; it gives the Foundry
harness's own composition-layer vocabulary and points to the canonical source
for the Hall tier itself.

## Navigation

| Go to | For |
|---|---|
| [AGENTS.md](AGENTS.md) | Authority order, scope, safety, and the work loop |
| [BLUEPRINT.md](BLUEPRINT.md) | The Four Halls model and ownership split |
| [TASKBOARD.md](TASKBOARD.md) | Generated hot projection of active harness specs |
| [RUNBOOK.md](RUNBOOK.md) | Exact commands |

## Terms

| Term | Meaning |
|---|---|
| **Servitor Foundry** | The reusable governance and composition product that ships four native Halls and installs Modules, coordinating a set of Workbench rooms. |
| **Foundry harness** | This portable repository: controls, its four native Halls, manifest, setup, skills, scheduler policy, templates, tools, and reference. It never contains an installed Module's source or instance data. |
| **Foundry instance** | One deployment root that adopts the harness and owns live Wiki memory, projects, bindings, secrets, runtime, schedules, and host-specific state. GPT_OS is one instance. |
| **Hall** | The Foundry's organizational tier — see GPT_OS root `LEXICON.md` -> **Hall** for the full definition. The Foundry has exactly four: the Forge (`forge/`), the Assay (`audit-engine/`), the Ward (`pip/`), and the Gatehouse (`gatehouse/`, scaffold only). |
| **native Hall** | A Hall folded into this repository as tracked source (S-024): no `remote`, arrives with `git clone` of the Foundry itself. Manifest `tier: "native-hall"`. Contrast **installed Module**. |
| **installed Module** | A standalone, optional, replaceable implementation of a socket contract that keeps its own repository and release history, and is cloned by the install manifest. Manifest `tier: "installed-module"`. Contrast **native Hall**. Corresponds to GPT_OS root Lexicon's **Foundry Module**. |
| **install manifest** | `manifest/foundry.json`: the tracked, credential-free list of native-Hall paths and installed-Module remotes/staging refs/ignored destinations/status, plus contract-registry discovery information. It contains no active binding. |
| **instance binding** | The instance-owned choice of which Module fills a socket plus contract entrypoint/configuration. Credentials are separate secret state. |
| **no reach-around** | A hard boundary: consumers use a Module only through its declared socket contract, never through the Module's files, database, or internal API by accident. |
| **Foundry adoption** | The one-time, preserve-first process that installs this harness into an instance, clones the manifest's installed Modules (native Halls are already present in the clone), seeds missing instance controls, verifies, audits, and records provenance. |
| **role skill** | A plain Markdown stance contract loaded into the current agent for one task. Loading it never spawns an agent; Captain dispatch is separate. |
| **Captain** | The user-facing coordinator that routes work, protects writer lanes, applies scheduler/AFK policy, and stops automation at `integration`. |
| **Workbench** | The operating surface of one room. A Foundry contains and coordinates Workbench rooms. Each native Hall (and each installed Module built the same way) is itself a self-contained mini-Workbench with its own `AGENTS.md`/`BLUEPRINT.md`/`LEXICON.md`/`RUNBOOK.md`/`TASKBOARD.md`/`CLAUDE.md`/`README.md`. |
| **Wiki / brain** | Canonical human-editable instance or room memory. The Wiki remembers; a recall Module recalls. |
| **adoption receipt** | Sanitized instance-local provenance containing manifest digest, harness source, native-Hall presence, installed-Module remotes/refs/commits, and checks actually run. |

## Retired

| Term | Status |
|---|---|
| **Foundry Socket** (capitalized family term for Forge/Audit Engine/PIP as remote-installed components) | Retired by S-024. The three are now native Halls, not a remote-installed family. See root GPT_OS `LEXICON.md` -> **Foundry Sockets** for the full retirement note. |
| **socket** (lowercase, singular) | Not retired — still means one stable capability contract (recall, messaging, interface, ...), housed inside a Hall. See root GPT_OS `LEXICON.md` -> **Socket**. |
