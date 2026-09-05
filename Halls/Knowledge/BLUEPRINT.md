# Knowledge Blueprint

## Purpose

House Socket contracts for organizational knowledge, vocabulary, precedent,
durable context, and Recall. Wiki and Modules may implement those contracts.

The Hall-local capability spec assigns Knowledge the `grounding-journal`
socket: versioned event schema,
append validation, sequence and prior-event digest, retention, replay, and
recovery verification. In lifecycle schema v2 the Journal is a subtree of the
same private authoritative commit as lifecycle state; Knowledge owns the
contract and custody semantics, while Orchestration owns the only mutator.

Knowledge also owns `journal-health-projector`, an idempotent post-commit Pawn
capture of sequence, digest-chain, and recovery health. It never publishes raw
operational envelopes to public repositories or directly feeds CIC.

## Capability Catalog

<!-- spec-catalog:start -->
| FUID | Spec alias | Description | Status | Created | Last worked |
|---|---|---|---|---|---|
| 000087 | [S-001 - Grounding Journal Primitive](specs/S-001-grounding-journal-primitive/SPEC.md) | Provide a stage-agnostic Grounding Journal primitive for canonical event validation, sequencing, digest chaining, replay, and recovery. | active | 2026-08-28 | 2026-08-28 |
<!-- spec-catalog:end -->
