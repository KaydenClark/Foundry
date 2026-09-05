# Foundry Lexicon

| Term | Meaning |
|---|---|
| **Foundry** | The portable product containing Halls, composition, governance, and install tooling. |
| **instance** | One deployment that owns populated memory, projects, bindings, schedules, credentials, and runtime state. |
| **Hall** | One native organizational boundary and home of a Socket family; it need not own every implementation or store behind its Sockets. The currently declared roster has thirteen Halls. That count is current Canon, not a permanent invariant; an explicit Canon amendment may change the roster while preserving stable identities and migration evidence. |
| **Intake** | Deterministic Hall that creates candidate Job Orders only. |
| **Validation** | Read-only Hall that returns findings about a Job Order's entry to and exit from a Governance Plane for Orchestration to act on. |
| **Gatehouse** | Hall that supplies the Foundry's structural passage, scan, containment, clearance, and receipt infrastructure. Gatehouse authorizes nothing: it does not route work, validate, decide scope or policy, assign Job Orders, or write Canon or Grounding. |
| **Orchestration** | Hall that decomposes a Job Order into Specs/tasks, selects necessary Hall passages, routes work, delegates agents, and sets up requested schedules. |
| **Design** | Hall that develops complex solutions for Forge or Production when Orchestration requests it. |
| **Knowledge** | Hall that houses organizational-knowledge Socket contracts, including Recall; Wiki and other Modules may implement its Sockets. |
| **Scheduling** | Hall that makes Orchestration-selected schedules run deterministically: queues, quotas, concurrency, wakeups, and timing. |
| **Forge** | Hall that builds and improves the Foundry producer itself. |
| **Production** | Hall that makes bounded Actuality changes to products and projects the Foundry produces; it does not self-audit, self-merge, or package a producer. |
| **Assay** | Independent, read-only Hall that audits and judges projects, results, and immutable artifacts. |
| **Ward** | Hall that triages, makes one bounded in-scope repair, and merges a passing audited branch to `integration`; it returns broader or second-failed repairs to Production through Orchestration. |
| **Gauge** | Observe-and-notify-only Hall that turns Gatehouse receipts into derived visibility. It feeds CIC every passage and sends targeted actionable alerts; it never writes Canon or Grounding. |
| **Shipping** | Provisional-name Hall that packages a declared producer into a clean, reproducible deployable product. |
| **Socket** | A stable capability connection contract housed inside a Hall. |
| **Module** | Optional separately owned product implementing one or more sockets. |
| **native Hall** | Hall source tracked directly in the Foundry product; never installed by manifest. |
| **installed Module** | Module cloned from its own repository into ignored instance space. |
| **Job Order** | Explicit authority to change a named Actuality scope, including the party responsible for returning Grounding. |
| **candidate Job Order** | Intake-created request record that is trackable but does not itself grant authority. |
| **passage receipt** | Gatehouse-owned append-only record of a protected Job Order scan: responsible party, actor/Pawn, time, source, destination, clearance band, scope, purpose, scan result, and receipt ID. |
| **Grounding** | Verified evidence returned against the same Job Order. |
| **Captain** | Coordinator that routes work, protects writer lanes, and applies scheduling policy. |
| **product source** | Clean public files produced from an immutable private producer commit. |
| **FUID (Foundry Unique Identifier)** | A permanent, globally unique, never-reused uppercase base36 identity. Four characters identify Halls, Modules, Sockets, and Projects/Workshops; six identify Specs, Tickets, Intent requests, Job Orders, and passage receipts. All-zero is reserved. Type, parentage, and Hall affiliation live in registry fields, never in the code. |
| **allocator high-water mark** | Canonical last sequentially issued value per FUID width. Allocation advances fixed-width base36 (`0009` → `000A`, `000Z` → `0010`), skips active/retired/grandfathered values, and persists atomically with the allocation. Recall and projections never allocate. |
| **legacy alias** | A unique typed reference such as `P-005`, `S-027`, or `TK-002` retained for lookup, CLI compatibility, links, and history while FUID is primary. |
| **Created** | Immutable creation date on a Spec or Ticket. |
| **Last worked** | Date of the latest substantive lifecycle or content action on a Spec or Ticket; render and polling never advance it. |

Retired: **Foundry Sockets** as a family name for the Halls. Lowercase socket
remains the capability-contract term.
