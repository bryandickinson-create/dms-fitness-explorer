/* =================================================================
   Viz Structure — Mol* 3D viewer with fitness-based coloring
   PDB 4G0N: H-Ras (Chain A) bound to CRAF RBD (Chain B)
   DMS peptide: Chain B residues 72–96
   Variable positions: C81, K84, A85, V88
   Uses MolViewSpec (MVS) builder for per-residue coloring
   ================================================================= */

const VizStructure = (function () {
    'use strict';

    const PDB_ID = '4G0N';
    const PDB_URL = `https://files.rcsb.org/download/${PDB_ID}.cif`;

    // Variable DMS positions → PDB residue numbers
    const VARIABLE_MAP = {
        9: 81,   // C81
        12: 84,  // K84
        13: 85,  // A85
        16: 88   // V88
    };

    // Wildtype AAs at variable positions (from PDB)
    const WT_AA = { 81: 'C', 84: 'K', 85: 'A', 88: 'V' };

    // Viridis-inspired color scale for fitness mapping
    function fitnessToColor(value, min, max) {
        if (value == null || max === min) return { r: 150, g: 150, b: 150 };
        const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

        // Viridis approximation: purple → teal → green → yellow
        const colors = [
            { r: 68, g: 1, b: 84 },       // 0.0 - dark purple
            { r: 59, g: 82, b: 139 },      // 0.25
            { r: 33, g: 145, b: 140 },     // 0.5 - teal
            { r: 94, g: 201, b: 98 },      // 0.75
            { r: 253, g: 231, b: 37 }      // 1.0 - yellow
        ];

        const idx = t * (colors.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.min(lo + 1, colors.length - 1);
        const f = idx - lo;

        return {
            r: Math.round(colors[lo].r + f * (colors[hi].r - colors[lo].r)),
            g: Math.round(colors[lo].g + f * (colors[hi].g - colors[lo].g)),
            b: Math.round(colors[lo].b + f * (colors[hi].b - colors[lo].b))
        };
    }

    function colorToHex(c) {
        return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    let viewer = null;
    let isLoaded = false;
    let colorUpdatePending = false;

    async function init() {
        try {
            viewer = await molstar.Viewer.create('molstar-viewer', {
                layoutIsExpanded: false,
                layoutShowControls: false,
                layoutShowRemoteState: false,
                layoutShowSequence: false,
                layoutShowLog: false,
                layoutShowLeftPanel: false,
                viewportShowExpand: false,
                viewportShowSelectionMode: false,
                viewportShowAnimation: false,
                pdbProvider: 'rcsb',
                emdbProvider: 'rcsb',
            });

            // Load initial structure via MVS with default gray coloring
            await loadStructureWithColors([]);
            isLoaded = true;

            // Wire up controls
            document.getElementById('structure-reset-btn').addEventListener('click', () => {
                if (viewer && viewer.plugin) {
                    viewer.plugin.managers.camera.reset();
                }
            });

            document.getElementById('structure-color-mode').addEventListener('change', () => {
                updateColors(App.state);
            });

            App.subscribe(updateColors);
            updateColors(App.state);
        } catch (err) {
            console.error('Mol* initialization error:', err);
            document.getElementById('molstar-viewer').innerHTML =
                '<div style="color:#999;padding:40px;text-align:center;">' +
                'Unable to load 3D structure viewer.<br>Check your internet connection.</div>';
        }
    }

    async function loadStructureWithColors(colorOverrides) {
        if (!viewer || !viewer.plugin) return;

        const plugin = viewer.plugin;

        try {
            const mvs = molstar.PluginExtensions.mvs;
            const builder = mvs.MVSData.createBuilder();

            const structure = builder
                .download({ url: PDB_URL })
                .parse({ format: 'mmcif' })
                .modelStructure();

            // Chain A (Ras) — light gray cartoon
            const chainA = structure.component({ selector: { label_asym_id: 'A' } });
            chainA.representation({ type: 'cartoon' }).color({ color: '#c8c8c8' });

            // Chain B (Raf RBD, the DMS peptide) — base teal cartoon
            const chainBRepr = structure
                .component({ selector: { label_asym_id: 'B' } })
                .representation({ type: 'cartoon' });

            // Base color for chain B
            chainBRepr.color({ color: '#5a9fa6' });

            // Apply per-residue fitness coloring on the variable positions
            for (const override of colorOverrides) {
                chainBRepr.color({
                    selector: {
                        label_asym_id: 'B',
                        beg_label_seq_id: override.residue,
                        end_label_seq_id: override.residue
                    },
                    color: override.hexColor
                });
            }

            // Show variable residues as ball-and-stick too for emphasis
            for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
                const pdbRes = VARIABLE_MAP[dmsPos];
                const override = colorOverrides.find(o => o.residue === pdbRes);
                const resColor = override ? override.hexColor : '#5a9fa6';

                const residueComp = structure.component({
                    selector: {
                        label_asym_id: 'B',
                        beg_label_seq_id: pdbRes,
                        end_label_seq_id: pdbRes
                    }
                });
                residueComp.representation({ type: 'ball_and_stick' })
                    .color({ color: resColor });
            }

            // Ligands
            structure
                .component({ selector: 'ligand' })
                .representation({ type: 'ball_and_stick' });

            const mvsData = builder.getState();
            await mvs.loadMVS(plugin, mvsData, {
                sanityChecks: true,
                replaceExisting: true
            });
        } catch (err) {
            console.error('MVS structure loading error:', err);
            // Fallback: load structure without custom coloring
            if (!isLoaded) {
                try {
                    await viewer.loadPdb(PDB_ID);
                    isLoaded = true;
                } catch (e) {
                    console.error('Fallback PDB load also failed:', e);
                }
            }
        }
    }

    // Debounce color updates since MVS reloads the structure
    let colorDebounceTimer = null;

    function updateColors(state) {
        if (!viewer) return;

        const colorMode = document.getElementById('structure-color-mode').value;

        // Compute fitness stats for each variable position
        const positionStats = {};
        let globalMin = Infinity;
        let globalMax = -Infinity;

        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(dmsPos, state.filteredIndices);
            positionStats[dmsPos] = marginals;

            for (const aa of Object.keys(marginals)) {
                const val = colorMode === 'tolerance'
                    ? marginals[aa].count
                    : marginals[aa].mean;
                if (val < globalMin) globalMin = val;
                if (val > globalMax) globalMax = val;
            }
        }

        // Update the legend panel (instant — no debounce)
        updateLegend(state, positionStats, globalMin, globalMax, colorMode);

        // Build color overrides
        const colorOverrides = [];
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const marginals = positionStats[dmsPos];
            const selectedAA = state.filters[dmsPos];

            let value;
            if (selectedAA && marginals[selectedAA]) {
                value = colorMode === 'tolerance'
                    ? marginals[selectedAA].count
                    : marginals[selectedAA].mean;
            } else {
                let sum = 0, count = 0;
                for (const aa of Object.keys(marginals)) {
                    const v = colorMode === 'tolerance'
                        ? marginals[aa].count
                        : marginals[aa].mean;
                    sum += v;
                    count++;
                }
                value = count > 0 ? sum / count : 0;
            }

            const color = fitnessToColor(value, globalMin, globalMax);
            colorOverrides.push({
                residue: pdbRes,
                hexColor: colorToHex(color),
                value: value
            });
        }

        // Debounce the MVS reload to avoid rapid rebuilds
        clearTimeout(colorDebounceTimer);
        colorDebounceTimer = setTimeout(() => {
            loadStructureWithColors(colorOverrides);
        }, isLoaded ? 300 : 0);
    }

    function updateLegend(state, positionStats, globalMin, globalMax, colorMode) {
        const container = document.getElementById('structure-residues');
        if (!container) return;

        let html = '';

        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const marginals = positionStats[dmsPos];
            const selectedAA = state.filters[dmsPos];
            const wtAA = WT_AA[pdbRes];

            let displayAA, value, label;
            if (selectedAA && marginals[selectedAA]) {
                displayAA = selectedAA;
                value = colorMode === 'tolerance'
                    ? marginals[selectedAA].count
                    : marginals[selectedAA].mean;
                label = `${DataProcessor.AA_NAMES[selectedAA]} (filtered)`;
            } else {
                displayAA = wtAA;
                let sum = 0, count = 0;
                for (const aa of Object.keys(marginals)) {
                    const v = colorMode === 'tolerance'
                        ? marginals[aa].count
                        : marginals[aa].mean;
                    sum += v;
                    count++;
                }
                value = count > 0 ? sum / count : 0;
                label = `${DataProcessor.AA_NAMES[wtAA]} (WT, avg)`;
            }

            const color = fitnessToColor(value, globalMin, globalMax);
            const hexColor = colorToHex(color);
            const valLabel = colorMode === 'tolerance'
                ? value.toLocaleString() + ' seqs'
                : value.toFixed(2);

            html += `
                <div class="legend-residue variable">
                    <span class="legend-residue-pos">${pdbRes}</span>
                    <span class="legend-residue-swatch" style="background:${hexColor}"></span>
                    <span class="legend-residue-aa">${displayAA}</span>
                    <span class="legend-residue-name">${label}</span>
                    <span class="legend-residue-fitness">${valLabel}</span>
                </div>
            `;
        }

        container.innerHTML = html;

        // Update info text
        const infoEl = document.getElementById('structure-info');
        if (infoEl) {
            const activeFilters = [];
            for (const pos of DataProcessor.VARIABLE_POSITIONS) {
                if (state.filters[pos]) {
                    activeFilters.push(`Pos ${VARIABLE_MAP[pos]}=${state.filters[pos]}`);
                }
            }
            const filterText = activeFilters.length > 0
                ? `Filters active: ${activeFilters.join(', ')}`
                : 'No filters active — showing average fitness across all variants';

            infoEl.innerHTML =
                `Raf RBD (Chain B, residues 72–96) at the Ras binding interface.<br>` +
                `Variable positions colored by ${colorMode === 'tolerance' ? 'AA count' : 'mean fitness'}.<br>` +
                `<em>${filterText}</em>`;
        }
    }

    return { init };
})();
