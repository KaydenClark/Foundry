# Foundry Reference Drawings

Human-facing plates for understanding the Foundry. These are explanatory
drawings, not live deployment or health views.

`FND` is the drawing-series identifier for **Foundry** reference plates. The
number is sequential: FND-01 preserves the original concept; FND-02 is its
current-architecture successor. The identifier is not a runtime component,
capability, or status code.

## Drawing Index

| Drawing | What it shows |
|---|---|
| [`foundry-schematic-FND-01.html`](foundry-schematic-FND-01.html) | The original 2026-07-20 drafting plate: two host buildings, conversational doors, three wired helpers, a Git cord, and the L0-L3 light dimmer. It is preserved as design history rather than rewritten to match the later architecture. |
| [`foundry-schematic-FND-01.pdf`](foundry-schematic-FND-01.pdf) | The existing print/share rendering of FND-01. |
| [`foundry-schematic-FND-02.html`](foundry-schematic-FND-02.html) | The 2026-08-02 current-state plate: one portable product, four native Halls, socket contracts, optional installed Modules, generic Projects/Wiki, reusable Roles/Captain/tools, private instance boundaries, and the Forge-to-Assay publication line. |
| [`foundry-schematic-FND-02.pdf`](foundry-schematic-FND-02.pdf) | The print/share rendering of FND-02. |

FND-02 describes architecture and ownership. It deliberately uses generic
Module and instance labels because the Foundry product is public; populated
project/memory data, credentials, local paths, and private task state do not
belong in the drawing.

## Rendering

HTML is canonical. Regenerate a PDF after changing its matching HTML:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf=foundry-schematic-FND-02.pdf \
  foundry-schematic-FND-02.html
```

FND-01's existing PDF is intentionally retained with the original plate. A new
architectural revision receives the next FND number instead of silently
rewriting an earlier drawing.
