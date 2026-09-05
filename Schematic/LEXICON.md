# Foundry Schematic Lexicon

> Generated from LLM Workbench v2.3.

This file owns accepted product-local meanings. Candidate terms remain marked
and do not amend Foundry Canon.

| Term | Meaning in the Schematic |
|---|---|
| Foundry Schematic | The future-Foundry simulator and interactive visualization of what the Foundry is going to be once it is fully built. The Foundry tab supplies the spatial model and Workflow simulates how the intended system should run. It does not model current implementation, rollout progress, or live Actuality. |
| Foundry campus | The fully built future spatial composition shown by The Foundry tab: a dominant Factory plus surrounding Module buildings, socket connections, Workshops, Workbenches, and supporting facilities. |
| Factory | One host-scoped deployment building containing the six Governance floors and its native Halls; two deployments of the same Foundry are a dual-Factory setup. |
| Run | One deterministic, inspectable Job Order simulation with no production side effects. |
| Job Order token | The continuous object carrying current plane, location, worker, earned access, evidence, gate result, freshness, and projection state. |
| Run trace | The append-only deterministic event sequence behind every visible move. |
| Flight cycle | The seven-stage Job Order lifecycle `Sitrep -> Preflight -> Launch-flight -> In-flight -> Landing-check -> Land -> PostFlight-check`. In the Schematic it is explanatory future-model state, never proof that the corresponding automation ran. |
| Flight stage | One separately gated lifecycle step that consumes the prior handoff, revalidates its entry facts, and emits the next handoff or terminal receipt. A Flight stage is not a Governance Plane. |
| Worker badge | The Pawn or Agent currently attached to the continuous Job Order. |
| Governance floor | One identical Factory floor plan used as the explicit spatial metaphor for one Governance Plane. The Plane is the operating concept; the floor is how the Schematic makes its separation and access visible. |
| Governance elevator | The visual transition between Governance floors. The Gatehouse checks the travelling Job Order and Clearance before passage. |
| Projection floor | The top Governance floor and least-protected Plane. It can route and display freshness-bearing Projection state; it cannot authorize work. |
| Actuality floor | The bottom terminal work floor and most-protected Plane. In this simulator it is visual state only. |
| Foundry Workspace | The central working area repeated on every Governance floor, surrounded by the Halls declared by the future-model fixture. |
| Supporting building | A campus structure outside the main Factory. Module buildings are replaceable supporting buildings; other illustrative facilities do not become Halls or Modules merely by being drawn. |
| Pawn | A deterministic actor that may capture, route, ground, record, retain, dispose, and project within a modeled Job Order. |
| Agent | A deliberating worker shown only after the scenario earns access through Grounding and Canon. |
| Gatehouse Passageway | Candidate term for an amber Hall-to-workspace structural connection. |
| Gatehouse Crossing | Candidate term for a controlled transition between Governance Planes. |
| Tripped Crossing | Candidate simulator event that pauses advancement and records Gatehouse signal, Assay check, then Ward report. |
| Workflow plan | One category-only Halls/Modules/Sockets plan. It never mounts a FactoryStack or names rooms. |
| FactoryStack | The ordered six-Plane Governance visualization. Governance is its sole Schematic surface and also retains one selected floor guide. |
| Shipping | A provisional native Hall that packages only declared producer output; it is not a generic component-release router. |
| Test endpoint | `http://127.0.0.1:5173/`, the development-only Schematic validation surface. It is never production-release acceptance. |
| Production/presentation endpoint | `http://foundry.example:5173/`, the owner-visible Schematic surface. It is the final release-acceptance target. |
| Production release gate | The guarded sequence that passes the source suite, builds a static artifact, installs only that artifact in the configured live deployment home, probes the production endpoint, and completes desktop browser verification there. |

Hall identities, names, count, and placement are future-scenario data, not
permanent Schematic invariants. An owner-settled change to the future Foundry
updates the fixture and every derived visualization without changing the
meaning of Hall ownership, Socket contracts, Module implementation, instance
binding, or producer/product flow.
