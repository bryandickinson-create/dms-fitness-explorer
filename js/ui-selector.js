/* =================================================================
   UI Selector — Position selector with AA chips
   ================================================================= */

const UISelector = (function () {
    'use strict';

    // Wildtype residues at variable positions (Raf chain B in 4G0N)
    const WT_AT_POS = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };
    const PDB_RESI = { 9: 81, 12: 84, 13: 85, 16: 88 };

    let container;
    let filterSummary;

    function init() {
        container = document.getElementById('selector-container');
        filterSummary = document.getElementById('filter-summary');
        renderChips();
        App.subscribe(update);
    }

    function renderChips() {
        container.innerHTML = '';
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            const block = document.createElement('div');
            block.className = 'selector-position';
            block.dataset.pos = pos;

            // Header: "C81 · Raf RBD" (residue identity + chain)
            const header = document.createElement('div');
            header.className = 'selector-position-header';
            header.innerHTML =
                '<span class="selector-pos-label">' + WT_AT_POS[pos] + PDB_RESI[pos] + '</span>' +
                '<span class="selector-pos-pdb">DMS pos ' + pos + '</span>';
            block.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'selector-aa-grid';
            grid.id = 'chips-' + pos;

            const aas = DataProcessor.aasAtPosition[pos];
            for (const aa of aas) {
                const chip = document.createElement('button');
                chip.className = 'selector-aa-chip';
                chip.textContent = aa;
                chip.dataset.pos = pos;
                chip.dataset.aa = aa;
                if (aa === WT_AT_POS[pos]) chip.classList.add('wt');
                if (aa === '*') chip.classList.add('stop-codon');
                chip.title = (DataProcessor.AA_NAMES[aa] || aa) + ' (' + aa + ') at ' + WT_AT_POS[pos] + PDB_RESI[pos] +
                    (aa === WT_AT_POS[pos] ? ' — wildtype' : '');
                chip.addEventListener('click', () => App.setFilter(parseInt(pos), aa));
                grid.appendChild(chip);
            }
            block.appendChild(grid);
            container.appendChild(block);
        }
    }

    function update(state) {
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            const chips = document.querySelectorAll('#chips-' + pos + ' .selector-aa-chip');
            chips.forEach(chip => {
                chip.classList.toggle('selected', state.filters[pos] === chip.dataset.aa);
                if (chip.dataset.aa === '*') {
                    chip.style.display = state.hideStops ? 'none' : '';
                }
            });
        }
        updateSummary(state);
    }

    function updateSummary(state) {
        const activeFilters = [];
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos] != null) {
                const aa = state.filters[pos];
                const wt = WT_AT_POS[pos];
                const aaText = aa === wt
                    ? wt + PDB_RESI[pos] + ' (WT)'
                    : wt + PDB_RESI[pos] + ' → ' + aa;
                activeFilters.push('<span class="filter-chip">' + aaText + '</span>');
            }
        }
        const count = App.getMatchingCount().toLocaleString();
        if (activeFilters.length === 0) {
            filterSummary.innerHTML =
                '<span class="filter-summary-text">No filters · showing all <strong>' + count + '</strong> sequences</span>';
        } else {
            filterSummary.innerHTML =
                activeFilters.join(' ') +
                ' <span class="filter-summary-text">— <strong>' + count + '</strong> matching</span>';
        }
    }

    return { init };
})();
