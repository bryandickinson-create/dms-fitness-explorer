/* =================================================================
   Viz Structure — 3Dmol.js viewer with fitness-based coloring
   PDB 4G0N: H-Ras (Chain A) bound to CRAF RBD (Chain B)
   DMS peptide: Chain B residues 72–96
   Variable positions: C81, K84, A85, V88

   Features:
   - fitness coloring on cartoon and surface
   - WT side chain shown by default
   - on AA selection: WT side chain hidden and mutant side chain
     placed using SidechainLibrary (PeptideBuilder rotamer)
   - hover tooltip, click-to-zoom, Ras contact highlights
   ================================================================= */

const VizStructure = (function () {
    'use strict';

    const PDB_ID = '4G0N';
    const RAF_CHAIN = 'B';
    const RAS_CHAIN = 'A';
    const CONTACT_DISTANCE = 4.5;

    // DMS position index → PDB residue number
    const VARIABLE_MAP = { 9: 81, 12: 84, 13: 85, 16: 88 };
    const VARIABLE_RESI = Object.values(VARIABLE_MAP);

    // Wildtype AAs at variable positions (Raf chain B)
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
    function rgbToInt(c) { return (c.r << 16) | (c.g << 8) | c.b; }

    // Module state
    let viewer = null;
    let isLoaded = false;
    let contactResidues = [];          // union of contacts across all 4 variable positions
    let contactsByPos = {};            // { 81: [...], 84: [...], 85: [...], 88: [...] } per-position contacts
    let contactResNames = {};
    let mutantModelIds = [];           // 3Dmol model objects for mutant sidechains
    let backboneCache = {};            // { pdbResi: { N, CA, C } }
    let prevFilters = { 9: null, 12: null, 13: null, 16: null };

    async function init() {
        try {
            const container = document.getElementById('viewer-3dmol');
            viewer = $3Dmol.createViewer(container, {
                backgroundColor: '#0a1020',
                antialias: true
            });

            $3Dmol.download('pdb:' + PDB_ID, viewer, {}, function () {
                isLoaded = true;
                cacheBackboneCoords();
                discoverContacts();

                document.getElementById('structure-reset-btn').addEventListener('click', resetView);
                document.getElementById('structure-color-mode').addEventListener('change', () => updateVisuals(App.state));

                App.subscribe(updateVisuals);
                updateVisuals(App.state);
                resetView();
            });

            const resizeObserver = new ResizeObserver(() => { if (viewer) viewer.resize(); });
            resizeObserver.observe(container);
        } catch (err) {
            console.error('3Dmol initialization error:', err);
            document.getElementById('viewer-3dmol').innerHTML =
                '<div class="viewer-error">Unable to load 3D structure viewer.</div>';
        }
    }

    function cacheBackboneCoords() {
        // Cache N, CA, C atoms for each variable Raf residue
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const resi = VARIABLE_MAP[dmsPos];
            const sel = { chain: RAF_CHAIN, resi: resi, atom: ['N', 'CA', 'C'] };
            const atoms = viewer.selectedAtoms(sel);
            const out = {};
            for (const a of atoms) {
                if (a.atom === 'N')  out.N  = [a.x, a.y, a.z];
                if (a.atom === 'CA') out.CA = [a.x, a.y, a.z];
                if (a.atom === 'C')  out.C  = [a.x, a.y, a.z];
            }
            backboneCache[resi] = out;
        }
    }

    function discoverContacts() {
        // Per-Raf-position contact discovery: for each variable Raf residue,
        // find Ras residues (protein only, no waters/ligands) with any atom
        // within CONTACT_DISTANCE
        const unionSet = new Set();
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const atoms = viewer.selectedAtoms({
                chain: RAS_CHAIN,
                hetflag: false,    // exclude waters and ligands
                within: { distance: CONTACT_DISTANCE, sel: { chain: RAF_CHAIN, resi: pdbRes } }
            });
            const set = new Set();
            for (const a of atoms) {
                if (a.resn === 'HOH') continue;  // belt & suspenders
                set.add(a.resi);
                unionSet.add(a.resi);
                if (!contactResNames[a.resi]) contactResNames[a.resi] = a.resn;
            }
            contactsByPos[pdbRes] = Array.from(set).sort((a, b) => a - b);
        }
        contactResidues = Array.from(unionSet).sort((a, b) => a - b);
    }

    // Get the union of Ras contact residues for the currently-filtered Raf positions.
    // When no filter is active, returns null (caller should fall back to default behavior).
    function activeContacts(state) {
        const set = new Set();
        let any = false;
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[dmsPos]) {
                any = true;
                const list = contactsByPos[VARIABLE_MAP[dmsPos]] || [];
                for (const r of list) set.add(r);
            }
        }
        return any ? Array.from(set).sort((a, b) => a - b) : null;
    }

    function applyBaseStyles() {
        // Base cartoon for Ras (gray) and Raf (teal)
        viewer.setStyle({ chain: RAS_CHAIN }, { cartoon: { color: '#9aa0b3', opacity: 0.85 } });
        viewer.setStyle({ chain: RAF_CHAIN }, { cartoon: { color: '#5fb1b8' } });
        // Hetero: thin sticks (e.g. GTP analog, Mg)
        viewer.setStyle({ hetflag: true }, { stick: { radius: 0.12 } });
    }

    function removeMutantModels() {
        // Remove any previously added mutant side-chain models
        if (mutantModelIds.length > 0) {
            for (const m of mutantModelIds) {
                try { viewer.removeModel(m); } catch (e) { /* ignore */ }
            }
            mutantModelIds = [];
        }
    }

    function placeMutantSidechain(dmsPos, aa, hexColor) {
        if (aa === '*') return;  // no side chain for stop
        const pdbRes = VARIABLE_MAP[dmsPos];
        const wt = WT_AA[pdbRes];
        if (aa === wt) return;   // same as WT — show original side chain instead
        if (aa === 'G') return;  // glycine: no side chain to place

        const bb = backboneCache[pdbRes];
        if (!bb || !bb.N || !bb.CA || !bb.C) return;

        const atoms = SidechainLibrary.placeSideChain(aa, bb.N, bb.CA, bb.C);
        if (atoms.length === 0) return;

        const resn = SidechainLibrary.getThreeLetter(aa);
        const pdbStr = SidechainLibrary.atomsToPdb(atoms, RAF_CHAIN, pdbRes, resn);

        const newModel = viewer.addModel(pdbStr, 'pdb');
        mutantModelIds.push(newModel);
        // Render side chain as colored sticks
        viewer.setStyle({ model: newModel }, {
            stick: { color: hexColor, radius: 0.20 },
            sphere: { color: hexColor, radius: 0.30, atoms: atoms.filter(a => a.name === 'NZ' || a.name === 'OH').map(a => a.name) }
        });
    }

    function updateVisuals(state) {
        if (!isLoaded || !viewer) return;
        const colorMode = document.getElementById('structure-color-mode').value;

        // Compute fitness stats per position
        const positionStats = {};
        let globalMin = Infinity, globalMax = -Infinity;

        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(dmsPos, state.filteredIndices);
            positionStats[dmsPos] = marginals;
            for (const aa of Object.keys(marginals)) {
                const val = colorMode === 'tolerance' ? marginals[aa].count : marginals[aa].mean;
                if (val < globalMin) globalMin = val;
                if (val > globalMax) globalMax = val;
            }
        }

        // Per-position display info (color and selected/representative AA)
        const colorMap = {};
        const overrides = [];
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const marginals = positionStats[dmsPos];
            const selectedAA = state.filters[dmsPos];

            let value;
            if (selectedAA && marginals[selectedAA]) {
                value = colorMode === 'tolerance' ? marginals[selectedAA].count : marginals[selectedAA].mean;
            } else {
                let sum = 0, count = 0;
                for (const aa of Object.keys(marginals)) {
                    sum += colorMode === 'tolerance' ? marginals[aa].count : marginals[aa].mean;
                    count++;
                }
                value = count > 0 ? sum / count : 0;
            }
            const rgb = fitnessToColor(value, globalMin, globalMax);
            colorMap[pdbRes] = rgbToInt(rgb);
            overrides.push({ residue: pdbRes, hexColor: colorToHex(rgb), value, dmsPos });
        }

        // --- Rebuild visual layers ---

        applyBaseStyles();
        removeMutantModels();

        // Color cartoon at variable residues by fitness
        for (const o of overrides) {
            viewer.addStyle({ chain: RAF_CHAIN, resi: o.residue }, { cartoon: { color: o.hexColor } });
        }

        // For each variable position, decide: show WT side chain or mutant
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const selectedAA = state.filters[dmsPos];
            const wtAA = WT_AA[pdbRes];
            const hexInt = colorMap[pdbRes];
            const hexStr = '#' + hexInt.toString(16).padStart(6, '0');

            const showMutant = selectedAA && selectedAA !== wtAA && selectedAA !== '*' && selectedAA !== 'G';

            if (showMutant) {
                // Hide WT side chain (atoms beyond CA), show only backbone
                viewer.addStyle(
                    { chain: RAF_CHAIN, resi: pdbRes, atom: ['N','CA','C','O'] },
                    { stick: { color: hexStr, radius: 0.10 } }
                );
                // Place mutant side chain as separate model
                placeMutantSidechain(dmsPos, selectedAA, hexStr);
            } else {
                // Show full WT side chain
                const radius = selectedAA ? 0.18 : 0.10;
                viewer.addStyle(
                    { chain: RAF_CHAIN, resi: pdbRes },
                    { stick: { color: hexStr, radius } }
                );
            }
        }

        // Ras contact highlights:
        //   Default (no filter): cartoon highlight on union of contacts, thin sticks
        //   Filter active: prominent side-chain sticks on contacts of filtered position(s)
        const focused = activeContacts(state);
        if (contactResidues.length > 0) {
            // Cartoon backbone highlight on all contacts
            viewer.addStyle({ chain: RAS_CHAIN, resi: contactResidues },
                { cartoon: { color: '#e8d5a0', opacity: 1.0 } });

            if (focused !== null) {
                // Subtle context: thin cylinders for non-focused contacts
                const offFocus = contactResidues.filter(r => !focused.includes(r));
                if (offFocus.length > 0) {
                    viewer.addStyle({ chain: RAS_CHAIN, resi: offFocus },
                        { stick: { color: '#7a6a4a', radius: 0.08 } });
                }
                // Prominent sticks on focused-position contacts (full side chain)
                viewer.addStyle({ chain: RAS_CHAIN, resi: focused },
                    { stick: { color: '#ffd166', radius: 0.20 } });
                // Add small spheres on key polar atoms for emphasis
                viewer.addStyle({
                    chain: RAS_CHAIN, resi: focused,
                    atom: ['NZ', 'NE', 'NH1', 'NH2', 'OH', 'OE1', 'OE2', 'OD1', 'OD2', 'NE2', 'ND1', 'ND2', 'OG', 'OG1', 'SG', 'SD']
                }, { sphere: { color: '#ffd166', radius: 0.30 } });
            } else {
                // No filter — uniform thin sticks
                viewer.addStyle({ chain: RAS_CHAIN, resi: contactResidues },
                    { stick: { color: '#e8d5a0', radius: 0.10 } });
            }
        }

        // Surface
        viewer.removeAllSurfaces();
        viewer.addSurface($3Dmol.SurfaceType.VDW, {
            opacity: 0.45,
            colorscheme: { prop: 'resi', map: colorMap }
        }, { chain: RAF_CHAIN, resi: VARIABLE_RESI }, { chain: RAF_CHAIN });

        // Labels
        viewer.removeAllLabels();
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            const pdbRes = VARIABLE_MAP[dmsPos];
            const selectedAA = state.filters[dmsPos];
            const displayAA = selectedAA || WT_AA[pdbRes];
            const isMutant = selectedAA && selectedAA !== WT_AA[pdbRes];
            viewer.addLabel(
                displayAA + pdbRes + (isMutant ? '*' : ''),
                {
                    fontSize: 13,
                    fontColor: 'white',
                    backgroundColor: isMutant ? '#c9356b' : 'black',
                    backgroundOpacity: 0.7,
                    showBackground: true,
                    inFront: true,
                    screenOffset: { x: 0, y: -18 }
                },
                { chain: RAF_CHAIN, resi: pdbRes, atom: 'CA' }
            );
        }
        const focusedLabelSet = new Set(activeContacts(state) || []);
        for (const resi of contactResidues) {
            const resn = contactResNames[resi] || '';
            const isFocused = focusedLabelSet.has(resi);
            viewer.addLabel(resn + resi, {
                fontSize: isFocused ? 11 : 9,
                fontColor: isFocused ? '#ffd166' : '#e8d5a0',
                backgroundColor: 'black',
                backgroundOpacity: isFocused ? 0.7 : 0.4,
                showBackground: true,
                inFront: true
            }, { chain: RAS_CHAIN, resi: resi, atom: 'CA' });
        }

        setupHoverHandlers();
        setupClickHandlers();
        zoomToFocusedPosition(state);
        viewer.render();
        updateLegend(state, positionStats, globalMin, globalMax, colorMode);
    }

    function setupHoverHandlers() {
        const tooltip = document.getElementById('structure-tooltip');
        viewer.setHoverable({}, true,
            function (atom) {
                if (!atom) return;
                const chain = atom.chain === RAF_CHAIN ? 'Raf' : 'Ras';
                let extra = '';
                if (atom.chain === RAF_CHAIN && VARIABLE_RESI.indexOf(atom.resi) !== -1) extra = ' [DMS variable]';
                else if (atom.chain === RAS_CHAIN && contactResidues.indexOf(atom.resi) !== -1) extra = ' [Ras contact]';
                tooltip.textContent = chain + ' ' + atom.resn + atom.resi + '.' + atom.atom + extra;
                tooltip.classList.add('visible');
            },
            function () { tooltip.classList.remove('visible'); }
        );
    }

    function setupClickHandlers() {
        viewer.setClickable({ chain: RAF_CHAIN, resi: VARIABLE_RESI }, true, function (atom) {
            if (atom) { viewer.zoomTo({ chain: RAF_CHAIN, resi: atom.resi }, 500); viewer.render(); }
        });
        if (contactResidues.length > 0) {
            viewer.setClickable({ chain: RAS_CHAIN, resi: contactResidues }, true, function (atom) {
                if (atom) { viewer.zoomTo({ chain: RAS_CHAIN, resi: atom.resi }, 500); viewer.render(); }
            });
        }
    }

    function zoomToFocusedPosition(state) {
        let changedPos = null;
        for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[dmsPos] !== null && prevFilters[dmsPos] !== state.filters[dmsPos]) {
                changedPos = dmsPos;
            }
        }
        prevFilters = {};
        for (const p of DataProcessor.VARIABLE_POSITIONS) prevFilters[p] = state.filters[p];

        if (changedPos !== null) {
            viewer.zoomTo({ chain: RAF_CHAIN, resi: VARIABLE_MAP[changedPos] }, 600);
        }
    }

    function resetView() {
        if (!viewer) return;
        viewer.zoomTo({
            or: [
                { chain: RAF_CHAIN },
                { chain: RAS_CHAIN, resi: contactResidues.length > 0 ? contactResidues : [1] }
            ]
        });
        viewer.render();
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
                value = colorMode === 'tolerance' ? marginals[selectedAA].count : marginals[selectedAA].mean;
                label = DataProcessor.AA_NAMES[selectedAA] +
                    (selectedAA !== wtAA ? ' (mutant)' : ' (WT)');
            } else {
                displayAA = wtAA;
                let sum = 0, count = 0;
                for (const aa of Object.keys(marginals)) {
                    sum += colorMode === 'tolerance' ? marginals[aa].count : marginals[aa].mean;
                    count++;
                }
                value = count > 0 ? sum / count : 0;
                label = DataProcessor.AA_NAMES[wtAA] + ' (WT, avg over filtered)';
            }
            const color = fitnessToColor(value, globalMin, globalMax);
            const hexColor = colorToHex(color);
            const valLabel = colorMode === 'tolerance'
                ? value.toLocaleString() + ' seqs'
                : value.toFixed(2);

            const isMutant = selectedAA && selectedAA !== wtAA;
            html += '<div class="legend-residue variable clickable' + (isMutant ? ' is-mutant' : '') + '" ' +
                'data-chain="' + RAF_CHAIN + '" data-resi="' + pdbRes + '">' +
                '<span class="legend-residue-pos">' + pdbRes + '</span>' +
                '<span class="legend-residue-swatch" style="background:' + hexColor + '"></span>' +
                '<span class="legend-residue-aa">' + displayAA + '</span>' +
                '<span class="legend-residue-name">' + label + '</span>' +
                '<span class="legend-residue-fitness">' + valLabel + '</span>' +
                '</div>';
        }
        container.innerHTML = html;

        const contactContainer = document.getElementById('contact-residues-list');
        if (contactContainer && contactResidues.length > 0) {
            const focused = activeContacts(state);
            const focusedSet = new Set(focused || []);
            let chtml = '';
            for (const resi of contactResidues) {
                const resn = contactResNames[resi] || '';
                // Which Raf positions does this Ras residue touch?
                const touches = [];
                for (const dmsPos of DataProcessor.VARIABLE_POSITIONS) {
                    const pdbRes = VARIABLE_MAP[dmsPos];
                    if ((contactsByPos[pdbRes] || []).includes(resi)) {
                        touches.push(WT_AA[pdbRes] + pdbRes);
                    }
                }
                const isFocused = focusedSet.has(resi);
                const cls = 'legend-residue contact clickable' + (isFocused ? ' is-focused' : '');
                chtml += '<div class="' + cls + '" data-chain="' + RAS_CHAIN + '" data-resi="' + resi + '">' +
                    '<span class="legend-residue-pos">' + resi + '</span>' +
                    '<span class="legend-residue-swatch" style="background:' + (isFocused ? '#ffd166' : '#e8d5a0') + '"></span>' +
                    '<span class="legend-residue-aa">' + resn + '</span>' +
                    '<span class="legend-residue-name">↔ ' + touches.join(', ') + '</span>' +
                    '</div>';
            }
            contactContainer.innerHTML = chtml;
        }

        const clickables = document.querySelectorAll('.legend-residue.clickable');
        for (const el of clickables) {
            el.addEventListener('click', function () {
                const chain = this.getAttribute('data-chain');
                const resi = parseInt(this.getAttribute('data-resi'));
                viewer.zoomTo({ chain, resi }, 500);
                viewer.render();
            });
        }

        const infoEl = document.getElementById('structure-info');
        if (infoEl) {
            const activeFilters = [];
            for (const pos of DataProcessor.VARIABLE_POSITIONS) {
                if (state.filters[pos]) {
                    const wt = WT_AA[VARIABLE_MAP[pos]];
                    const sel = state.filters[pos];
                    activeFilters.push(wt + VARIABLE_MAP[pos] + (sel === wt ? '' : '→' + sel));
                }
            }
            const filterText = activeFilters.length > 0
                ? '<span class="info-emph">Mutations: ' + activeFilters.join(', ') + '</span>'
                : 'No filters active — showing average fitness';

            infoEl.innerHTML =
                '<strong>Raf RBD</strong> (Chain B, residues 72–96) bound to Ras at the canonical interface.<br>' +
                'Variable positions are colored by ' + (colorMode === 'tolerance' ? 'AA tolerance' : 'mean fitness') + '. ' +
                'Selecting a non-WT amino acid replaces the side chain with a Dunbrack rotamer.<br>' +
                filterText;
        }
    }

    return { init };
})();
