/* =================================================================
   Viz Delta — Variant-vs-WT fitness change distribution
   For each variant we compute the fitness ratio against the WT
   sequence (CKAV at variable positions). Shown as a histogram of
   log10(slope/WT_slope) so values < 0 are below WT, > 0 are above.
   ================================================================= */

const VizDelta = (function () {
    'use strict';

    const WT = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };
    const WT_KEY = 'CKAV';

    let wtSlope = null;
    const plotlyConfig = { responsive: true, displayModeBar: false };

    function findWtSlope() {
        if (wtSlope !== null) return wtSlope;
        for (const s of DataProcessor.sequences) {
            if (s.p9 === WT[9] && s.p12 === WT[12] && s.p13 === WT[13] && s.p16 === WT[16]) {
                wtSlope = s.slope;
                return wtSlope;
            }
        }
        // fall back: use median fitness as denominator
        const slopes = DataProcessor.sequences.map(s => s.slope).sort((a,b)=>a-b);
        wtSlope = slopes[Math.floor(slopes.length / 2)] || 1;
        return wtSlope;
    }

    function init() { App.subscribe(render); }

    function render(state) {
        const container = 'delta-plot';
        if (!document.getElementById(container)) return;

        const wt = findWtSlope();
        if (!wt || wt <= 0) return;

        // All sequences (for background) and filtered (for foreground)
        const allDeltas = DataProcessor.sequences
            .filter(s => s.slope > 0 && (!state.hideStops || !s.hasStop))
            .map(s => Math.log10(s.slope / wt));

        const filteredIndices = state.filteredIndices;
        const filteredDeltas = filteredIndices !== null
            ? Array.from(filteredIndices)
                .map(i => DataProcessor.sequences[i])
                .filter(s => s.slope > 0 && (!state.hideStops || !s.hasStop))
                .map(s => Math.log10(s.slope / wt))
            : null;

        const traces = [{
            type: 'histogram',
            x: allDeltas,
            name: 'All variants',
            marker: { color: '#3b528b', line: { width: 0 } },
            opacity: 0.55,
            xbins: { start: -3, end: 3, size: 0.1 }
        }];

        if (filteredDeltas !== null && filteredDeltas.length > 0) {
            traces.push({
                type: 'histogram',
                x: filteredDeltas,
                name: 'Filtered',
                marker: { color: '#fde725' },
                opacity: 0.85,
                xbins: { start: -3, end: 3, size: 0.1 },
                yaxis: 'y2'
            });
        }

        const wtLabel = WT_KEY + '  (slope = ' + wt.toFixed(3) + ')';

        const layout = {
            margin: { t: 30, b: 50, l: 55, r: filteredDeltas ? 55 : 15 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6', family: 'Inter, sans-serif', size: 11 },
            xaxis: {
                title: { text: 'log<sub>10</sub>(variant fitness / WT fitness)', font: { color: '#cfd6e6', size: 12 } },
                tickfont: { color: '#cfd6e6' },
                gridcolor: 'rgba(255,255,255,0.07)',
                zeroline: true,
                zerolinecolor: 'rgba(253,231,37,0.5)',
                zerolinewidth: 2
            },
            yaxis: {
                title: { text: 'All variants (count)', font: { color: '#cfd6e6', size: 11 } },
                tickfont: { color: '#cfd6e6' },
                gridcolor: 'rgba(255,255,255,0.07)'
            },
            barmode: 'overlay',
            showlegend: true,
            legend: { x: 0.02, y: 0.98, font: { color: '#cfd6e6', size: 10 } },
            shapes: [{
                type: 'line', xref: 'x', x0: 0, x1: 0, yref: 'paper', y0: 0, y1: 1,
                line: { color: '#fde725', width: 2, dash: 'dash' }
            }],
            annotations: [{
                xref: 'x', yref: 'paper', x: 0, y: 1.05,
                text: 'WT (' + wtLabel + ')',
                showarrow: false,
                font: { color: '#fde725', size: 10 }
            }]
        };

        if (filteredDeltas) {
            layout.yaxis2 = {
                title: { text: 'Filtered (count)', font: { color: '#cfd6e6', size: 11 }, standoff: 5 },
                tickfont: { color: '#cfd6e6' },
                overlaying: 'y',
                side: 'right',
                gridcolor: 'rgba(255,255,255,0)',
                showgrid: false
            };
        }

        Plotly.react(container, traces, layout, plotlyConfig);

        // Update summary stat
        const summary = document.getElementById('delta-summary');
        if (summary) {
            const data = filteredDeltas || allDeltas;
            const above = data.filter(d => d > 0).length;
            const below = data.filter(d => d < 0).length;
            const median = data.slice().sort((a,b)=>a-b)[Math.floor(data.length/2)] || 0;
            summary.innerHTML =
                '<span class="delta-stat"><span class="delta-stat-value">' + above.toLocaleString() + '</span> above WT</span>' +
                '<span class="delta-stat"><span class="delta-stat-value">' + below.toLocaleString() + '</span> below WT</span>' +
                '<span class="delta-stat">Median Δ log10: <span class="delta-stat-value">' + median.toFixed(2) + '</span></span>';
        }
    }

    return { init };
})();
