/* =================================================================
   Viz Structure — 3Dmol.js viewer with fitness-based coloring
   PDB 4G0N: H-Ras (Chain A) bound to CRAF RBD (Chain B)
   DMS peptide: Chain B residues 72–96
   Variable positions: C81, K84, A85, V88
   Features: fitness surface, Ras contacts, hover, click-to-focus
   ================================================================= */

const VizStructure = (function () {
    'use strict';

    const PDB_ID = '4G0N';

    const RAF_CHAIN = 'B';
    const RAS_CHAIN = 'A';
    const CONTACT_DISTANCE = 4.0;

    // DMS position index → PDB residue number
    const VARIABLE_MAP = {
        9: 81,   // C81
        12: 84,  // K84
        13: 85,  // A85
        16: 88   // V88
    };

    const VARIABLE_RESI = Object.values(VARIABLE_MAP); // [81, 84, 85, 88]

    // Wildtype AAs at variable positions
    const WT_AA = { 81: 'C', 84: 'K', 85: 'A', 88: 'V' };

    // Viridis-inspired color scale
    function fitnessToColor(value, min, max) {
        if (value == null || max === min) return { r: 150, g: 150, b: 150 };
        const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

        const colors = [
            { r: 68, g: 1, b: 84 },
            { r: 59, g: 82, b: 139 },
            { r: 33, g: 145, b: 140 },
            { r: 94, g: 201, b: 98 },
            { r: 253, g: 231, b: 37 }
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

    function rgbToInt(c) {
        return (c.r << 16) | (c.g << 8) | c.b;
    }

    // Module state
    let viewer = null;
    let isLoaded = false;
    let contactResidues = [];
    let contactResNames = {};  // { resi: resn }
    let prevFilters = { 9: null, 12: null, 13: null, 16: null };

    async function init() {
        try {
            const container = document.getElementById('viewer-3dmol');
            viewer = $3Dmol.createViewer(container, {
                backgroundColor: '#1a1a2e',
                antialias: true
            });

            $3Dmol.download('pdb:' + PDB_ID, viewer, {}, function () {
                isLoaded = true;

                // Discover Ras contact residues (once)
                discoverContacts();

                // Wire controls
                document.getElementById('structure-reset-btn').addEventListener('click', resetView);
                document.getElementById('structure-color-mode').addEventListener('change', function () {
                    updateVisuals(App.state);
                });

                // Subscribe to state changes
                App.subscribe(updateVisuals);

                // Initial render
                updateVisuals(App.state);

                // Zoom to show the interface
                resetView();
            });

            // Resize handling
            const resizeObserver = new ResizeObserver(function () {
                if (viewer) viewer.resize();
            });
            resizeObserver.observe(container);
        } catch (err) {
            console.error('3Dmol initialization error:', err);
            document.getElementById('viewer-3dmol').innerHTML =
                '<div style="color:#999;padding:40px;text-align:center;">' +
                'Unable to load 3D structure viewer.<br>Check your internet connection.</div>';
        }
    }

    function discoverContacts() {
        // Find Ras residues within 4A of the variable positions on Raf
        var contactAtoms = viewer.selectedAtoms({
            chain: RAS_CHAIN,
            within: {
                distance: CONTACT_DISTANCE,
                sel: { chain: RAF_CHAIN, resi: VARIABLE_RESI }
            }
        });

        var contactSet = new Set();
        for (var i = 0; i < contactAtoms.length; i++) {
            contactSet.add(contactAtoms[i].resi);
            if (!contactResNames[contactAtoms[i].resi]) {
                contactResNames[contactAtoms[i].resi] = contactAtoms[i].resn;
            }
        }
        contactResidues = Array.from(contactSet).sort(function (a, b) { return a - b; });
    }

    function applyBaseStyles() {
        // Layer 1: Base cartoon for both chains
        viewer.setStyle(
            { chain: RAS_CHAIN },
            { cartoon: { color: '#c8c8c8', opacity: 0.85 } }
        );
        viewer.setStyle(
            { chain: RAF_CHAIN },
            { cartoon: { color: '#5a9fa6' } }
        );
        // Ligands/heteroatoms
        viewer.setStyle(
            { hetflag: true },
            { stick: { radius: 0.12 } }
        );
    }

    function updateVisuals(state) {
        if (!isLoaded || !viewer) return;

        var colorMode = document.getElementById('structure-color-mode').value;

        // Compute fitness stats
        var positionStats = {};
        var globalMin = Infinity;
        var globalMax = -Infinity;

        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            var marginals = DataProcessor.computeConditionalMarginals(dmsPos, state.filteredIndices);
            positionStats[dmsPos] = marginals;

            var aaKeys = Object.keys(marginals);
            for (var j = 0; j < aaKeys.length; j++) {
                var val = colorMode === 'tolerance'
                    ? marginals[aaKeys[j]].count
                    : marginals[aaKeys[j]].mean;
                if (val < globalMin) globalMin = val;
                if (val > globalMax) globalMax = val;
            }
        }

        // Build color overrides
        var colorMap = {};     // { resi: 0xRRGGBB }
        var overrides = [];    // For legend

        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            var pdbRes = VARIABLE_MAP[dmsPos];
            var marginals = positionStats[dmsPos];
            var selectedAA = state.filters[dmsPos];

            var value;
            if (selectedAA && marginals[selectedAA]) {
                value = colorMode === 'tolerance'
                    ? marginals[selectedAA].count
                    : marginals[selectedAA].mean;
            } else {
                var sum = 0, count = 0;
                var aaKeys = Object.keys(marginals);
                for (var j = 0; j < aaKeys.length; j++) {
                    sum += (colorMode === 'tolerance'
                        ? marginals[aaKeys[j]].count
                        : marginals[aaKeys[j]].mean);
                    count++;
                }
                value = count > 0 ? sum / count : 0;
            }

            var rgb = fitnessToColor(value, globalMin, globalMax);
            colorMap[pdbRes] = rgbToInt(rgb);
            overrides.push({
                residue: pdbRes,
                hexColor: colorToHex(rgb),
                value: value,
                dmsPos: dmsPos
            });
        }

        // --- Rebuild visual layers ---

        // Layer 1: Base cartoon (resets all previous addStyle overlays)
        applyBaseStyles();

        // Layer 2: Fitness-colored cartoon on variable residues
        for (var i = 0; i < overrides.length; i++) {
            viewer.addStyle(
                { chain: RAF_CHAIN, resi: overrides[i].residue },
                { cartoon: { color: overrides[i].hexColor } }
            );
        }

        // Layer 3: Side chain sticks for variable positions
        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            var pdbRes = VARIABLE_MAP[dmsPos];
            var selectedAA = state.filters[dmsPos];
            var hexInt = colorMap[pdbRes];
            var hexStr = '#' + hexInt.toString(16).padStart(6, '0');

            if (selectedAA) {
                // Active filter: prominent sticks
                viewer.addStyle(
                    { chain: RAF_CHAIN, resi: pdbRes },
                    { stick: { color: hexStr, radius: 0.18 } }
                );
            } else {
                // No filter: thin sticks for context
                viewer.addStyle(
                    { chain: RAF_CHAIN, resi: pdbRes },
                    { stick: { color: hexStr, radius: 0.10 } }
                );
            }
        }

        // Layer 4: Ras contact highlights
        if (contactResidues.length > 0) {
            viewer.addStyle(
                { chain: RAS_CHAIN, resi: contactResidues },
                { cartoon: { color: '#e8d5a0', opacity: 1.0 } }
            );
            viewer.addStyle(
                { chain: RAS_CHAIN, resi: contactResidues },
                { stick: { color: '#e8d5a0', radius: 0.10 } }
            );
        }

        // Layer 5: Fitness surface on variable residues
        viewer.removeAllSurfaces();
        viewer.addSurface($3Dmol.SurfaceType.VDW, {
            opacity: 0.50,
            colorscheme: { prop: 'resi', map: colorMap }
        }, { chain: RAF_CHAIN, resi: VARIABLE_RESI }, { chain: RAF_CHAIN });

        // Layer 6: Labels
        viewer.removeAllLabels();

        // Variable position labels
        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            var pdbRes = VARIABLE_MAP[dmsPos];
            var selectedAA = state.filters[dmsPos];
            var displayAA = selectedAA || WT_AA[pdbRes];

            viewer.addLabel(
                displayAA + pdbRes,
                {
                    fontSize: 12,
                    fontColor: 'white',
                    backgroundColor: 'black',
                    backgroundOpacity: 0.6,
                    showBackground: true,
                    inFront: true,
                    screenOffset: { x: 0, y: -18 }
                },
                { chain: RAF_CHAIN, resi: pdbRes, atom: 'CA' }
            );
        }

        // Ras contact labels (smaller, subtler)
        for (var i = 0; i < contactResidues.length; i++) {
            var resi = contactResidues[i];
            var resn = contactResNames[resi] || '';
            viewer.addLabel(
                resn + resi,
                {
                    fontSize: 9,
                    fontColor: '#e8d5a0',
                    backgroundColor: 'black',
                    backgroundOpacity: 0.4,
                    showBackground: true,
                    inFront: true
                },
                { chain: RAS_CHAIN, resi: resi, atom: 'CA' }
            );
        }

        // Layer 7: Hover handlers
        setupHoverHandlers();

        // Layer 8: Click handlers
        setupClickHandlers();

        // Zoom to focused position if filter just changed
        zoomToFocusedPosition(state);

        // Render
        viewer.render();

        // Update legend (DOM only)
        updateLegend(state, positionStats, globalMin, globalMax, colorMode);
    }

    function setupHoverHandlers() {
        var tooltip = document.getElementById('structure-tooltip');

        viewer.setHoverable(
            {},
            true,
            function (atom) {
                if (!atom) return;
                var chain = atom.chain === RAF_CHAIN ? 'Raf' : 'Ras';
                var extra = '';
                if (atom.chain === RAF_CHAIN && VARIABLE_RESI.indexOf(atom.resi) !== -1) {
                    extra = ' [DMS variable]';
                } else if (atom.chain === RAS_CHAIN && contactResidues.indexOf(atom.resi) !== -1) {
                    extra = ' [Ras contact]';
                }
                tooltip.textContent = chain + ' ' + atom.resn + atom.resi + '.' + atom.atom + extra;
                tooltip.classList.add('visible');
            },
            function () {
                tooltip.classList.remove('visible');
            }
        );
    }

    function setupClickHandlers() {
        // Variable positions: click to zoom
        viewer.setClickable(
            { chain: RAF_CHAIN, resi: VARIABLE_RESI },
            true,
            function (atom) {
                if (atom) {
                    viewer.zoomTo({ chain: RAF_CHAIN, resi: atom.resi }, 500);
                    viewer.render();
                }
            }
        );

        // Ras contacts: click to zoom
        if (contactResidues.length > 0) {
            viewer.setClickable(
                { chain: RAS_CHAIN, resi: contactResidues },
                true,
                function (atom) {
                    if (atom) {
                        viewer.zoomTo({ chain: RAS_CHAIN, resi: atom.resi }, 500);
                        viewer.render();
                    }
                }
            );
        }
    }

    function zoomToFocusedPosition(state) {
        var changedPos = null;
        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            if (state.filters[dmsPos] !== null && prevFilters[dmsPos] !== state.filters[dmsPos]) {
                changedPos = dmsPos;
            }
        }

        // Save for next comparison
        prevFilters = {};
        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var p = DataProcessor.VARIABLE_POSITIONS[i];
            prevFilters[p] = state.filters[p];
        }

        if (changedPos !== null) {
            var pdbRes = VARIABLE_MAP[changedPos];
            viewer.zoomTo({ chain: RAF_CHAIN, resi: pdbRes }, 600);
        }
    }

    function resetView() {
        if (!viewer) return;
        // Show the full interface: Raf chain + nearby Ras contacts
        var allResi = VARIABLE_RESI.concat(contactResidues);
        viewer.zoomTo({
            or: [
                { chain: RAF_CHAIN },
                { chain: RAS_CHAIN, resi: contactResidues.length > 0 ? contactResidues : [1] }
            ]
        });
        viewer.render();
    }

    function updateLegend(state, positionStats, globalMin, globalMax, colorMode) {
        var container = document.getElementById('structure-residues');
        if (!container) return;

        var html = '';

        for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
            var dmsPos = DataProcessor.VARIABLE_POSITIONS[i];
            var pdbRes = VARIABLE_MAP[dmsPos];
            var marginals = positionStats[dmsPos];
            var selectedAA = state.filters[dmsPos];
            var wtAA = WT_AA[pdbRes];

            var displayAA, value, label;
            if (selectedAA && marginals[selectedAA]) {
                displayAA = selectedAA;
                value = colorMode === 'tolerance'
                    ? marginals[selectedAA].count
                    : marginals[selectedAA].mean;
                label = DataProcessor.AA_NAMES[selectedAA] + ' (filtered)';
            } else {
                displayAA = wtAA;
                var sum = 0, count = 0;
                var aaKeys = Object.keys(marginals);
                for (var j = 0; j < aaKeys.length; j++) {
                    sum += (colorMode === 'tolerance'
                        ? marginals[aaKeys[j]].count
                        : marginals[aaKeys[j]].mean);
                    count++;
                }
                value = count > 0 ? sum / count : 0;
                label = DataProcessor.AA_NAMES[wtAA] + ' (WT, avg)';
            }

            var color = fitnessToColor(value, globalMin, globalMax);
            var hexColor = colorToHex(color);
            var valLabel = colorMode === 'tolerance'
                ? value.toLocaleString() + ' seqs'
                : value.toFixed(2);

            html += '<div class="legend-residue variable clickable" data-chain="' + RAF_CHAIN + '" data-resi="' + pdbRes + '">' +
                '<span class="legend-residue-pos">' + pdbRes + '</span>' +
                '<span class="legend-residue-swatch" style="background:' + hexColor + '"></span>' +
                '<span class="legend-residue-aa">' + displayAA + '</span>' +
                '<span class="legend-residue-name">' + label + '</span>' +
                '<span class="legend-residue-fitness">' + valLabel + '</span>' +
                '</div>';
        }

        container.innerHTML = html;

        // Contact residues section
        var contactContainer = document.getElementById('contact-residues-list');
        if (contactContainer && contactResidues.length > 0) {
            var contactHtml = '';
            for (var i = 0; i < contactResidues.length; i++) {
                var resi = contactResidues[i];
                var resn = contactResNames[resi] || '';
                contactHtml += '<div class="legend-residue contact clickable" data-chain="' + RAS_CHAIN + '" data-resi="' + resi + '">' +
                    '<span class="legend-residue-pos">' + resi + '</span>' +
                    '<span class="legend-residue-swatch" style="background:#e8d5a0"></span>' +
                    '<span class="legend-residue-aa">' + resn + '</span>' +
                    '<span class="legend-residue-name">Ras Chain A</span>' +
                    '</div>';
            }
            contactContainer.innerHTML = contactHtml;
        }

        // Clickable legend items for zoom
        var clickables = document.querySelectorAll('.legend-residue.clickable');
        for (var i = 0; i < clickables.length; i++) {
            clickables[i].addEventListener('click', function () {
                var chain = this.getAttribute('data-chain');
                var resi = parseInt(this.getAttribute('data-resi'));
                viewer.zoomTo({ chain: chain, resi: resi }, 500);
                viewer.render();
            });
        }

        // Update info text
        var infoEl = document.getElementById('structure-info');
        if (infoEl) {
            var activeFilters = [];
            for (var i = 0; i < DataProcessor.VARIABLE_POSITIONS.length; i++) {
                var pos = DataProcessor.VARIABLE_POSITIONS[i];
                if (state.filters[pos]) {
                    activeFilters.push('Pos ' + VARIABLE_MAP[pos] + '=' + state.filters[pos]);
                }
            }
            var filterText = activeFilters.length > 0
                ? 'Filters active: ' + activeFilters.join(', ')
                : 'No filters active \u2014 showing average fitness across all variants';

            infoEl.innerHTML =
                'Raf RBD (Chain B, residues 72\u201396) at the Ras binding interface.<br>' +
                'Variable positions colored by ' + (colorMode === 'tolerance' ? 'AA count' : 'mean fitness') + '.<br>' +
                '<em>' + filterText + '</em>';
        }
    }

    return { init: init };
})();
