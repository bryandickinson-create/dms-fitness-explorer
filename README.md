# DMS Fitness Explorer: Raf — v2

Refreshed explorer for deep mutational scanning data on the Ras–Raf interface.

## What's new

- **Title & branding** — renamed throughout to *DMS Fitness Explorer: Raf*
- **Modern dark scientific theme** — viridis-aligned palette, sticky glass nav, glowing scaffold display
- **Live side-chain mutation in the 3D viewer** — selecting any non-WT amino acid replaces the side chain atoms with a Dunbrack rotamer at C81, K84, A85, or V88
- **New visualizations**
  - Sequence logo (per position, height = mean fitness contribution)
  - Mean fitness grouped by AA biochemical property
  - Variant-vs-WT fitness Δ histogram (log10 ratio against CKAV wildtype)
- **Improved scaffold display** — variable positions glow blue when WT, gold when mutated; click to clear that filter
- **Re-themed every existing chart** for the dark palette (heatmaps, distributions, pairwise epistasis, top/bottom lists)

## Files

```
index.html             — markup, new section layout, updated <script> tags
styles.css             — full dark-theme rewrite
js/
  app.js               — orchestration; now renders scaffold reactively, registers new viz modules
  data-loader.js       — unchanged
  data-processor.js    — unchanged
  ui-selector.js       — new chip layout matching dark theme; per-position WT label
  ui-table.js          — uses new tag classes
  viz-heatmap.js       — viridis colorscale, dark grid lines
  viz-charts.js        — distributions/histogram dark-themed
  viz-logo.js          — NEW · sequence logo
  viz-property.js      — NEW · property-grouped bar chart
  viz-delta.js         — NEW · variant-vs-WT delta histogram
  viz-structure.js     — adds mutant side-chain placement
  sidechain-library.js — NEW · 20-AA rotamer library + canonical-frame placement
data/
  fitness_data.csv     — unchanged
```

## Side-chain mutation algorithm

When the user filters position 9, 12, 13, or 16 to a non-WT amino acid:

1. The 3Dmol viewer reads the residue's backbone N, CA, C atoms (cached at load).
2. `SidechainLibrary.placeSideChain(aa, N, CA, C)` builds a rigid-body transform from the canonical reference frame (where every AA's side chain coordinates are stored) into the residue's actual frame.
3. The new side chain atoms are emitted as a synthetic PDB block and added as a separate model with `viewer.addModel`.
4. The original residue's side chain atoms (CB onward) are hidden — only its backbone is shown — so the mutant side chain doesn't overlap the WT atoms.

Side-chain coordinates were generated with PeptideBuilder using its Dunbrack-derived default rotamers. This is the same approach PyMOL's mutagenesis wizard uses by default. See `build/build_rotamers_final.py` if you want to regenerate the library.

## Running locally

GitHub Pages (or any static server) works out of the box. To smoke-test locally:

```bash
cd dms-fitness-explorer
python3 -m http.server 8000
# open http://localhost:8000
```

(The CSV is loaded over HTTP, so opening `index.html` directly via `file://` is blocked by browser CORS — use a local server.)

## Deployment

Files are organized exactly the same way as v1, so dropping them into your existing repo and pushing should publish via GitHub Pages with no other changes.
