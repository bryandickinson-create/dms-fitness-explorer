/* =================================================================
   App — State management, orchestration, URL hash sync
   ================================================================= */

const App = (function () {
    'use strict';

    const state = {
        filters: { 9: null, 12: null, 13: null, 16: null },
        filteredIndices: null,
        sortBy: 'slope',
        sortDir: 'desc',
        searchQuery: '',
        hideStops: false,
        colorScale: 'log'
    };

    const listeners = [];

    function subscribe(fn) { listeners.push(fn); }

    function notify() {
        for (const fn of listeners) fn(state);
        saveHash();
    }

    function setFilter(pos, aa) {
        if (state.filters[pos] === aa) state.filters[pos] = null;
        else state.filters[pos] = aa;
        state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        notify();
    }

    function clearFilter(pos) {
        state.filters[pos] = null;
        state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        notify();
    }

    function clearAllFilters() {
        for (const pos of DataProcessor.VARIABLE_POSITIONS) state.filters[pos] = null;
        state.filteredIndices = null;
        notify();
    }

    function setSort(sortBy, sortDir) { state.sortBy = sortBy; state.sortDir = sortDir; notify(); }
    function setSearch(query) { state.searchQuery = query; notify(); }
    function setHideStops(hide) { state.hideStops = hide; notify(); }
    function setColorScale(scale) { state.colorScale = scale; notify(); }

    function getActiveFilterCount() { return Object.values(state.filters).filter(v => v != null).length; }
    function getMatchingCount() {
        if (state.filteredIndices === null) return DataProcessor.totalCount;
        return state.filteredIndices.size;
    }

    function saveHash() {
        const parts = [];
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos] != null) parts.push(pos + ':' + encodeURIComponent(state.filters[pos]));
        }
        const filterStr = parts.join(',');
        const hash = filterStr ? 'filters=' + filterStr : '';
        if (hash) history.replaceState(null, '', '#' + hash);
        else history.replaceState(null, '', window.location.pathname);
    }

    function loadHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const filterStr = params.get('filters');
        if (filterStr) {
            for (const pair of filterStr.split(',')) {
                const [pos, aa] = pair.split(':');
                const posNum = parseInt(pos);
                if (DataProcessor.VARIABLE_POSITIONS.includes(posNum) && aa) {
                    state.filters[posNum] = decodeURIComponent(aa);
                }
            }
            state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        }
    }

    // Render scaffold display showing the 25-AA peptide with WT letters
    // at fixed positions and current selection at variable positions
    function renderScaffold() {
        const container = document.getElementById('scaffold-display');
        if (!container) return;

        // Wildtype Raf RBD residues 72-96 = "VRNGMSLHDCLMKAGLVRGLQPECC"
        // (residue 81=C, 84=K, 85=A, 88=V — the variable positions)
        const fullSeq = 'VRNGMSLHDCLMKALKVRGLQPECC';
        const varSet = new Set(DataProcessor.VARIABLE_POSITIONS);
        const WT_AT_POS = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };

        let html = '';
        for (let i = 0; i < fullSeq.length; i++) {
            const isVar = varSet.has(i);
            if (isVar) {
                const wt = WT_AT_POS[i];
                const sel = state.filters[i];
                const display = sel || wt;
                const isMutant = sel && sel !== wt;
                const cls = 'scaffold-aa variable' + (isMutant ? ' is-mutant' : '');
                html += `<span class="${cls}" data-pos="${i}" title="Position ${i} (PDB ${ {9:81,12:84,13:85,16:88}[i] })">${display}</span>`;
            } else {
                html += `<span class="scaffold-aa fixed">${fullSeq[i]}</span>`;
            }
        }
        container.innerHTML = html;

        // Click variable positions to clear that filter
        container.querySelectorAll('.scaffold-aa.variable').forEach(el => {
            el.addEventListener('click', () => {
                const pos = parseInt(el.dataset.pos);
                clearFilter(pos);
            });
        });
    }

    function renderSummary() {
        const container = document.getElementById('data-summary');
        if (!container) return;
        const total = DataProcessor.totalCount.toLocaleString();
        const stopCount = DataProcessor.sequences.filter(s => s.hasStop).length.toLocaleString();
        const posCount = DataProcessor.VARIABLE_POSITIONS.length;
        container.innerHTML = `
            <span class="stat"><span class="stat-value">${total}</span><span class="stat-label">sequences</span></span>
            <span class="stat"><span class="stat-value">${posCount}</span><span class="stat-label">variable positions</span></span>
            <span class="stat"><span class="stat-value">${DataProcessor.minSlope.toFixed(2)} – ${DataProcessor.maxSlope.toFixed(1)}</span><span class="stat-label">fitness range</span></span>
            <span class="stat"><span class="stat-value">${stopCount}</span><span class="stat-label">with stop codons</span></span>
        `;
    }

    // Subscribe scaffold to state updates so selected AAs render in the scaffold
    subscribe(renderScaffold);

    function init() {
        DataLoader.load(() => {
            renderScaffold();
            renderSummary();
            loadHash();

            // Initialize all UI components
            UISelector.init();
            VizHeatmap.init();
            VizCharts.init();
            VizLogo.init();
            VizProperty.init();
            VizDelta.init();
            VizStructure.init();
            UITable.init();

            document.getElementById('clear-all-btn').addEventListener('click', clearAllFilters);
            document.getElementById('hide-stops-toggle').addEventListener('change', function () {
                setHideStops(this.checked);
            });
            document.querySelectorAll('#scale-toggle .btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    document.querySelectorAll('#scale-toggle .btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    setColorScale(this.dataset.scale);
                });
            });
            document.getElementById('sort-select').addEventListener('change', function () {
                const [field, dir] = this.value.split('-');
                setSort(field, dir);
            });
            let searchTimeout;
            document.getElementById('seq-search').addEventListener('input', function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => setSearch(this.value.trim()), 200);
            });
            document.getElementById('export-btn').addEventListener('click', exportCSV);

            // Smooth scroll nav highlighting
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', function () {
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    this.classList.add('active');
                });
            });

            notify();
        });
    }

    function exportCSV() {
        const data = DataProcessor.getFilteredSequences(
            state.filteredIndices, state.sortBy, state.sortDir,
            state.searchQuery, state.hideStops
        );
        const csvData = data.map(s => ({
            Rank: s.rank, 'Protein Seq': s.seq,
            C81: s.p9, K84: s.p12, A85: s.p13, V88: s.p16,
            Slope: s.slope
        }));
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const POS_TO_RAF = { 9: 81, 12: 84, 13: 85, 16: 88 };
        let name = 'dms_filtered';
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos]) name += `_${POS_TO_RAF[pos]}-${state.filters[pos]}`;
        }
        a.href = url; a.download = name + '.csv'; a.click();
        URL.revokeObjectURL(url);
    }

    window.addEventListener('hashchange', () => {
        for (const pos of DataProcessor.VARIABLE_POSITIONS) state.filters[pos] = null;
        loadHash();
        notify();
    });

    return {
        state, subscribe,
        setFilter, clearFilter, clearAllFilters,
        setSort, setSearch, setHideStops, setColorScale,
        getActiveFilterCount, getMatchingCount, init
    };
})();

document.addEventListener('DOMContentLoaded', App.init);
