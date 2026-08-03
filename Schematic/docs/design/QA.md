# Visual QA — Playable Job Order Run

## Evidence

- Accepted baseline: [`fnd-05-accepted-baseline.png`](fnd-05-accepted-baseline.png)
- Approved six-floor concept: [`run-player-six-floor-concept.png`](run-player-six-floor-concept.png)
- Final desktop render: [`qa-desktop-final.png`](qa-desktop-final.png)
- Trip-state render: [`qa-trip.png`](qa-trip.png)
- Final mobile floor stack: [`qa-mobile-stack.png`](qa-mobile-stack.png)

The app was exercised with the in-app browser at its native 1536 × 1024
desktop viewport and a 375 × 844 mobile viewport. The accepted concept and
final desktop and mobile renders were then inspected directly at original
resolution.

## Fidelity Ledger

| Point | Accepted direction | Final result |
|---|---|---|
| Information architecture | Journey rail, central Factory, run inspector | The same three-region Run Player hierarchy is preserved at desktop size. |
| Governance stack | Six duplicated floor plans, Projection above and Actuality below | All six floors remain simultaneously legible and keep the locked order 06–01. |
| Floor anatomy | Forge, Assay, Ward, Gatehouse, and central workspace on every plane | Each floor repeats the same anatomy; the active plane receives the only strong selection treatment. |
| Runtime state | Active token, worker, authorization, gate, and trace move together | Stepping to Grounding, injecting a trip, resolving it, and replaying update every synchronized view. |
| Visual language | Dark technical-blueprint palette, fine rules, compact labels, amber status | Palette, typography, borders, spacing rhythm, and control density follow the accepted FND-05 baseline. |
| Safety boundary | Simulator must remain visibly separate from Actuality | The boundary is persistent in the app chrome and reinforced on the Actuality floor and inspector. |
| Responsive behavior | Preserve the complete model, not a cropped illustration | At 375 px the navigation, all controls, and complete floor plates fit without horizontal page or stack overflow. |

## Intentional Deviations

- The shipped header says `FND–LIVE` instead of assigning another numbered
  drawing ID. This distinguishes the interactive runtime from the static FND
  drawing series.
- The concept's deep perspective was reduced to a shallow code-native cutaway.
  This keeps labels, controls, and all six floor plans readable at desktop and
  mobile widths.
- `Workbench Feedback Audit` replaces the concept's shorter harness label to
  match the public-safe scenario name used throughout the app.

No material above-the-fold copy mismatch remained after those deliberate
changes. Route labels, transport labels, safety copy, floor names, and active
run facts match the implemented product contract.
