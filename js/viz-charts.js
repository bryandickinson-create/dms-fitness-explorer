/* =================================================================
   Viz Charts — Distributions, histograms, top/bottom (dark themed)
   ================================================================= */

const VizCharts = (function () {
    'use strict';

    const plotlyConfig = { responsive: true, displayModeBar: false };
    const POSITIONS = DataProcessor.VARIABLE_POSITIONS;

    // PDB residue mapping (DMS index -> Raf residue number in 4G0N)
    const PDB_RESI = { 9: 81, 12: 84, 13: 85, 16: 88 };
    const WT_AA   = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };

    // Per-position accent colors (matches dark scientific palette)
    const POS_COLORS = {
        9:  '#7da7ff',   // electric blue
        12: '#5fb1b8',   // teal
        13: '#fde725',   // viridis-yellow
        16: '#c084fc'    // violet
    };

    function init() { App.subscribe(render); }

    function render(state) {
        renderDistributions(state);
        renderHistogram(state);
        renderTopBottom(state);
    }

    function renderDistributions(state) {
        const container = 'distribution-plot';
        const traces = [];

        for (const pos of POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            const aas = DataProcessor.aasAtPosition[pos];
            const aaStats = [];
            for (const aa of aas) {
                if (state.hideStops && aa === '*') continue;
                const stats = marginals[aa];
                if (!stats || stats.count === 0) continue;
                aaStats.push({ aa, mean: stats.mean, count: stats.count });
            }
            aaStats.sort((a, b) => b.mean - a.mean);

            traces.push({
                type: 'bar',
                x: aaStats.map(s => s.aa),
                y: aaStats.map(s => s.mean),
                name: WT_AA[pos] + PDB_RESI[pos],
                marker: {
                    color: aaStats.map(s =>
                        state.filters[pos] === s.aa ? POS_COLORS[pos] : POS_COLORS[pos] + '50'
                    )
                },
                hovertext: aaStats.map(s =>
                    '<b>' + DataProcessor.AA_NAMES[s.aa] + ' (' + s.aa + ')</b> at ' + WT_AA[pos] + PDB_RESI[pos] + '<br>'
                    + 'Mean: ' + s.mean.toFixed(3) + '<br>N = ' + s.count.toLocaleString()
                ),
                hoverinfo: 'text',
                xaxis: 'x' + (POSITIONS.indexOf(pos) + 1),
                yaxis: 'y' + (POSITIONS.indexOf(pos) + 1)
            });
        }

        const layout = {
            margin: { t: 25, b: 30, l: 50, r: 10 },
            showlegend: false,
            grid: { rows: 4, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6' },
            annotations: []
        };

        for (let i = 0; i < POSITIONS.length; i++) {
            const pos = POSITIONS[i];
            const axisIdx = i + 1;
            const xKey = 'xaxis' + (axisIdx === 1 ? '' : axisIdx);
            const yKey = 'yaxis' + (axisIdx === 1 ? '' : axisIdx);
            layout[xKey] = {
                tickfont: { size: 9, family: 'JetBrains Mono', color: '#cfd6e6' },
                gridcolor: 'rgba(255,255,255,0.05)'
            };
            layout[yKey] = {
                tickfont: { size: 9, color: '#cfd6e6' },
                gridcolor: 'rgba(255,255,255,0.07)'
            };
            layout.annotations.push({
                text: '<b>' + WT_AA[pos] + PDB_RESI[pos] + '</b>',
                xref: 'x' + axisIdx + ' domain',
                yref: 'y' + axisIdx + ' domain',
                x: 0, y: 1.1, showarrow: false,
                font: { size: 11, color: POS_COLORS[pos] }
            });
        }
        Plotly.react(container, traces, layout, plotlyConfig);
    }

    function renderHistogram(state) {
        const container = 'fitness-histogram';
        const allSlopes = DataProcessor.getAllSlopes(null);
        const filteredSlopes = DataProcessor.getAllSlopes(state.filteredIndices);

        const traces = [{
            type: 'histogram',
            x: allSlopes.map(v => Math.log10(Math.max(v, 0.001))),
            name: 'All sequences',
            opacity: 0.55,
            marker: { color: '#3b528b' },
            nbinsx: 80
        }];

        const hasFilter = state.filteredIndices !== null;
        if (hasFilter) {
            traces.push({
                type: 'histogram',
                x: filteredSlopes.map(v => Math.log10(Math.max(v, 0.001))),
                name: 'Filtered',
                opacity: 0.85,
                marker: { color: '#fde725' },
                nbinsx: 80,
                yaxis: 'y2'
            });
        }

        const layout = {
            margin: { t: 20, b: 50, l: 55, r: hasFilter ? 55 : 20 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6' },
            xaxis: {
                title: { text: 'log<sub>10</sub>(Fitness)', font: { color: '#cfd6e6', size: 12 } },
                tickfont: { color: '#cfd6e6', size: 10 },
                gridcolor: 'rgba(255,255,255,0.07)'
            },
            yaxis: {
                title: { text: hasFilter ? 'All (count)' : 'Count', font: { color: '#cfd6e6', size: 11 } },
                tickfont: { color: '#cfd6e6', size: 10 },
                gridcolor: 'rgba(255,255,255,0.07)'
            },
            barmode: 'overlay',
            showlegend: hasFilter,
            legend: { x: 0.65, y: 0.95, font: { size: 10, color: '#cfd6e6' } }
        };
        if (hasFilter) {
            layout.yaxis2 = {
                title: { text: 'Filtered (count)', font: { size: 11, color: '#cfd6e6' }, standoff: 5 },
                tickfont: { color: '#cfd6e6', size: 10 },
                overlaying: 'y', side: 'right',
                showgrid: false
            };
        }
        Plotly.react(container, traces, layout, plotlyConfig);
    }

    function renderTopBottom(state) {
        const { top, bottom } = DataProcessor.getTopBottom(20, state.filteredIndices);
        renderRankedList('top-sequences', top);
        renderRankedList('bottom-sequences', bottom);
    }

    function renderRankedList(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = items.map(s => {
            const seqHtml = highlightVariablePositions(s.seq);
            return '<div class="ranked-item">' +
                '<span class="ranked-rank">#' + s.rank + '</span>' +
                '<span class="ranked-seq">' + seqHtml + '</span>' +
                '<span class="ranked-fitness">' + s.slope.toFixed(2) + '</span>' +
                '</div>';
        }).join('');
    }

    function highlightVariablePositions(seq) {
        const varSet = new Set(DataProcessor.VARIABLE_POSITIONS);
        let html = '';
        for (let i = 0; i < seq.length; i++) {
            html += varSet.has(i)
                ? '<span class="var-aa">' + seq[i] + '</span>'
                : seq[i];
        }
        return html;
    }

    return { init };
})();
