---
status: accepted
date: 2026-09-03
---

# Delivery with independent proof closes a record

A Job Order record that carries, in its own evidence, an independent audit PASS at an exact SHA, an explicit non-force Land, and a remote read-back is closed. It does not additionally require a receipt from a mechanism that was never built. Where the only thing standing between a delivered artifact and its closure is the absence of the closing machinery, the record closes on the proof it already has.

Considered Options: building the genesis and digest semantics behind `/postflight-check` first was the alternative, and it is the honest long-term answer — but it is the same work that has been blocked for weeks, and making it the price of closing records that were already built, audited, landed and read back is the shape [ADR-0020](0020-a-check-blocks-only-the-change-it-evaluates.md) forbids. The evidence those records need exists; only the machine to read it is missing. Owner ruling, 2026-09-03.

The discriminator is proof, not convenience. A record closes only when its own evidence names all three of an independent audit PASS at a fixed SHA, an explicit non-force Land, and a remote read-back. Delivered-but-unaudited, ready-and-unclaimed, and accounting-only records stay open, and so does any record whose own Next gate still asks for the review it never had. A missing mechanism cannot keep a proved record open; it equally cannot make an unproved one closed.

Consequences: apply the three-part evidence test to each record individually. Completed delivery with independent proof may close; unaudited, unclaimed, accounting-only, or unverified delivery stays open. Historical missing receipts remain recorded as implementation debt.

Provenance: owner-accepted decision, 2026-09-03; copied for the undeployed Foundry template. Instance-specific session provenance is retained separately.
