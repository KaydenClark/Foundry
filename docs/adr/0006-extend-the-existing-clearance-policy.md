---
status: accepted
date: 2026-09-03
---

# Extend the existing clearance policy

The governance model extends Gatehouse's existing `clearance-policy.json`, keeping one policy source and enforcement point. The extension describes operations and their required authority, following the role model instead of introducing a separate governance policy or assigning planes to paths.

Consequences: The implementation slice is deferred by item 48; this ADR supplies no new runtime enforcement and does not repair the reported observer/auditor read-policy discrepancy.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
