---
status: accepted
date: 2026-09-03
---

# A Job Order is a form work takes, not a precondition for doing it

Multi-chat work does not require a Job Order in order to exist or to proceed. The order is the durable coordination form that work takes *when one is in force*; without one, continuity is carried by the handoff and its session notepad, which is what has actually carried multi-session work here. Human-led chat work under direct owner instruction is the ordinary operating path, and no Canon requirement may demand a mechanism that is unavailable or is itself the thing under repair.

Considered Options: issuing a Job Order for the repair, rather than narrowing the rule, was rejected because the Job Order machinery *is* the machinery under repair. Three accepted statements in `AGENTS.md` composed into a deadlock — work spanning chats "needs a Job Order", Actuality work must "stop" when none exists, and "a handoff does not replace those gates" — so Canon ordered the repair to stop and pre-emptively denied the artifact carrying it. [ADR-0020](0020-a-check-blocks-only-the-change-it-evaluates.md) forbids exactly that, and both were accepted the same day.

Consequences: this narrows [ADR-0010](0010-job-orders-coordinate-work-across-chats.md), which described the order as *the* form of multi-chat Intent — the description stands, the exclusivity does not. [ADR-0009](0009-job-order-authority-is-an-intersection.md), [ADR-0011](0011-job-order-is-an-operation-checklist.md) and [ADR-0012](0012-job-orders-link-to-owning-sources.md) are untouched: they constrain orders that exist. The "unless current Canon specifically requires the exact mechanism for the exact work" carve-out does not survive — specificity is what makes a deadlock precise, not what makes it legitimate. The Grounding receipt keeps its obligation but loses its spec precondition, because creating a spec ran through a FUID allocator the V3 move had broken. The deadlock also had an executable half: `preflight.mjs` asserted launch mode unconditionally and failed `job-order-required` against launches nobody requested; removing the prose alone would have left the tool saying no.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
