# Gatehouse

The Gatehouse is the fourth native Hall of the Foundry — alongside the Forge,
the Assay, and the Ward — and it owns the Foundry's containment boundary:
walls, doors, security gates, badge scanning, Job Order assignment, per-plane
verification, and clearance-band enforcement.

**This is a scaffold. Nothing is implemented.** It was created by S-024
(native-socket Foundry) as the honest structural placeholder for the fourth
Hall, so the Foundry's directory shape names all four Halls even though only
three have working source today.

If you were looking for a running system, there isn't one yet — read
`BLUEPRINT.md` for what it's meant to become and the open questions blocking a
first real slice, or `AGENTS.md` for how to pick up the first ticket here.

## Why This Exists Now, Empty

Kayden decided (S-024, 2026-07-25/26) that the Forge, the Assay, and the Ward
fold into `KaydenClark/Foundry` as native tracked source rather than remote
components installed by a manifest, and that the Gatehouse should be created
the same way — native from the start, never a separate repository. Creating
the directory and its control docs now, honestly labeled as unimplemented, is
cheaper and less misleading than leaving the fourth Hall as a name in
`LEXICON.md` with no home in the tree at all.
