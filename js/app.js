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

    function subscribe(fn) {
        listeners.push(fn);
    }

    function notify() {
        for (const fn of listeners) {
            fn(state);
        }
        saveHash();
    }

    function setFilter(pos, aa) {
        if (state.filters[pos] === aa) {
            // Toggle off
            state.filters[pos] = null;
        } else {
            state.filters[pos] = aa;
        }
        state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        notify();
    }

    function clearFilter(pos) {
        state.filters[pos] = null;
        state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        notify();
    }

    function clearAllFilters() {
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            state.filters[pos] = null;
        }
        state.filteredIndices = null;
        notify();
    }

    function setSort(sortBy, sortDir) {
        state.sortBy = sortBy;
        state.sortDir = sortDir;
        notify();
    }

    function setSearch(query) {
        state.searchQuery = query;
        notify();
    }

    function setHideStops(hide) {
        state.hideStops = hide;
        notify();
    }

    function setColorScale(scale) {
        state.colorScale = scale;
        notify();
    }

    function getActiveFilterCount() {
        return Object.values(state.filters).filter(v => v != null).length;
    }

    function getMatchingCount() {
        if (state.filteredIndices === null) return DataProcessor.totalCount;
        return state.filteredIndices.size;
    }

    // URL hash sync
    function saveHash() {
        const parts = [];
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos] != null) {
                parts.push(pos + ':' + encodeURIComponent(state.filters[pos]));
            }
        }
        const filterStr = parts.join(',');
        const hash = filterStr ? 'filters=' + filterStr : '';
        if (hash) {
            history.replaceState(null, '', '#' + hash);
        } else {
            history.replaceState(null, '', window.location.pathname);
        }
    }

    function loadHash() {
        const hash = window.location.hash.slice(1);
        if (!hash) return;

        const params = new URLSearchParams(hash);
        const filterStr = params.get('filters');
        if (filterStr) {
            const pairs = filterStr.split(',');
            for (const pair of pairs) {
                const [pos, aa] = pair.split(':');
                const posNum = parseInt(pos);
                if (DataProcessor.VARIABLE_POSITIONS.includes(posNum) && aa) {
                    state.filters[posNum] = decodeURIComponent(aa);
                }
            }
            state.filteredIndices = DataProcessor.getFilteredIndices(state.filters);
        }
    }

    // Render scaffold display
    function renderScaffold() {
        const container = document.getElementById('scaffold-display');
        if (!container) return;

        const fullSeq = 'VRNGMSLHDXLMXXLKXRGLQPECC';
        const varSet = new Set(DataProcessor.VARIABLE_POSITIONS);

        let html = '';
        for (let i = 0; i < fullSeq.length; i++) {
            const isVar = varSet.has(i);
            const cls = isVar ? 'variable' : 'fixed';
            const letter = isVar ? '?' : fullSeq[i];
            const posAttr = isVar ? `data-pos="${i}"` : '';
            html += `<span class="scaffold-aa ${cls}" ${posAttr}>${letter}</span>`;
        }
        container.innerHTML = html;
    }

    // Render data summary
    function renderSummary() {
        const container = document.getElementById('data-summary');
        if (!container) return;

        const total = DataProcessor.totalCount.toLocaleString();
        const stopCount = DataProcessor.sequences.filter(s => s.hasStop).length.toLocaleString();
        const posCount = DataProcessor.VARIABLE_POSITIONS.length;

        container.innerHTML = `
            <span class="stat"><span class="stat-value">${total}</span> sequences</span>
            <span class="stat"><span class="stat-value">${posCount}</span> variable positions</span>
            <span class="stat">Fitness range: <span class="stat-value">${DataProcessor.minSlope.toFixed(3)}</span> — <span class="stat-value">${DataProcessor.maxSlope.toFixed(1)}</span></span>
            <span class="stat"><span class="stat-value">${stopCount}</span> with stop codons</span>
        `;
    }

    // Initialize
    function init() {
        DataLoader.load(() => {
            renderScaffold();
            renderSummary();

            // Load filters from URL hash
            loadHash();

            // Initialize all UI components
            UISelector.init();
            VizHeatmap.init();
            VizCharts.init();
            VizStructure.init();
            UITable.init();

            // Wire up controls
            document.getElementById('clear-all-btn').addEventListener('click', clearAllFilters);

            document.getElementById('hide-stops-toggle').addEventListener('change', function () {
                setHideStops(this.checked);
            });

            // Scale toggle
            document.querySelectorAll('#scale-toggle .btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    document.querySelectorAll('#scale-toggle .btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    setColorScale(this.dataset.scale);
                });
            });

            // Sort select
            document.getElementById('sort-select').addEventListener('change', function () {
                const [field, dir] = this.value.split('-');
                setSort(field, dir);
            });

            // Search
            let searchTimeout;
            document.getElementById('seq-search').addEventListener('input', function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => setSearch(this.value.trim()), 200);
            });

            // Export button
            document.getElementById('export-btn').addEventListener('click', exportCSV);

            // Smooth scroll nav
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', function (e) {
                    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                    this.classList.add('active');
                });
            });

            // Initial render
            notify();
        });
    }

    function exportCSV() {
        const data = DataProcessor.getFilteredSequences(
            state.filteredIndices, state.sortBy, state.sortDir,
            state.searchQuery, state.hideStops
        );

        const csvData = data.map(s => ({
            Rank: s.rank,
            'Protein Seq': s.seq,
            Pos9: s.p9,
            Pos12: s.p12,
            Pos13: s.p13,
            Pos16: s.p16,
            Slope: s.slope
        }));

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        // Build filename with active filters
        let name = 'dms_filtered';
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos]) {
                name += `_pos${pos}-${state.filters[pos]}`;
            }
        }
        a.href = url;
        a.download = name + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Listen for hash changes (back/forward)
    window.addEventListener('hashchange', () => {
        // Reset filters
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            state.filters[pos] = null;
        }
        loadHash();
        notify();
    });

    return {
        state,
        subscribe,
        setFilter,
        clearFilter,
        clearAllFilters,
        setSort,
        setSearch,
        setHideStops,
        setColorScale,
        getActiveFilterCount,
        getMatchingCount,
        init
    };
})();

// Start the app
document.addEventListener('DOMContentLoaded', App.init);
