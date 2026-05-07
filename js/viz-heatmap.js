/* =================================================================
   Viz Heatmap — Marginal fitness heatmap + pairwise epistasis (dark)
   ================================================================= */

const VizHeatmap = (function () {
    'use strict';

    const POSITIONS = DataProcessor.VARIABLE_POSITIONS;
    const plotlyConfig = { responsive: true, displayModeBar: false };

    // PDB residue mapping
    const PDB_RESI = { 9: 81, 12: 84, 13: 85, 16: 88 };
    const WT_AA   = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };
    const posLabel = (p) => WT_AA[p] + PDB_RESI[p];

    // Viridis colorscale for dark theme
    const COLOR_SCALE = [
        [0.00, '#440154'],
        [0.25, '#3b528b'],
        [0.50, '#21918c'],
        [0.75, '#5ec962'],
        [1.00, '#fde725']
    ];

    function init() { App.subscribe(render); }

    function render(state) {
        renderMarginalHeatmap(state);
        renderPairwiseHeatmaps(state);
    }

    function transformValue(val, scale, allValues) {
        if (val == null || val === 0) return null;
        if (scale === 'log') return Math.log10(Math.max(val, 0.001));
        if (scale === 'rank') {
            if (!allValues || allValues.length === 0) return val;
            const sorted = [...allValues].filter(v => v != null).sort((a, b) => a - b);
            const idx = sorted.findIndex(v => v >= val);
            return idx >= 0 ? (idx / sorted.length) * 100 : 50;
        }
        return val;
    }

    function getColorbarTitle(scale) {
        if (scale === 'log') return 'log<sub>10</sub>(Fitness)';
        if (scale === 'rank') return 'Percentile';
        return 'Fitness';
    }

    function renderMarginalHeatmap(state) {
        const container = 'marginal-heatmap';
        const scale = state.colorScale;

        const allMeanValues = [];
        const positionData = {};
        for (const pos of POSITIONS) {
            positionData[pos] = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            for (const aa of Object.keys(positionData[pos])) {
                allMeanValues.push(positionData[pos][aa].mean);
            }
        }

        const allAAs = DataProcessor.AA_ORDER.filter(aa =>
            POSITIONS.some(pos => positionData[pos][aa])
        );
        const displayAAs = state.hideStops ? allAAs.filter(aa => aa !== '*') : allAAs;

        const z = [], text = [], hovertext = [];

        for (const aa of displayAAs) {
            const zRow = [], textRow = [], hoverRow = [];
            for (const pos of POSITIONS) {
                const stats = positionData[pos][aa];
                if (!stats) {
                    zRow.push(null); textRow.push(''); hoverRow.push('N/A');
                } else {
                    zRow.push(transformValue(stats.mean, scale, allMeanValues));
                    textRow.push(stats.mean.toFixed(1));
                    const name = DataProcessor.AA_NAMES[aa] || aa;
                    const isFiltered = state.filters[pos] === aa;
                    const filterIcon = isFiltered ? ' [SELECTED]' : '';
                    hoverRow.push(
                        '<b>' + name + ' (' + aa + ')</b> at ' + posLabel(pos) + filterIcon + '<br>' +
                        'Mean: ' + stats.mean.toFixed(3) + '<br>' +
                        'Median: ' + stats.median.toFixed(3) + '<br>' +
                        'Std: ' + stats.std.toFixed(3) + '<br>' +
                        'N = ' + stats.count.toLocaleString()
                    );
                }
            }
            z.push(zRow); text.push(textRow); hovertext.push(hoverRow);
        }

        const annotations = [];
        for (let r = 0; r < displayAAs.length; r++) {
            for (let c = 0; c < POSITIONS.length; c++) {
                if (state.filters[POSITIONS[c]] === displayAAs[r]) {
                    annotations.push({
                        x: c, y: r, text: '◆',
                        showarrow: false,
                        font: { size: 16, color: '#fde725' }
                    });
                }
            }
        }

        const trace = {
            type: 'heatmap',
            z, x: POSITIONS.map(p => posLabel(p)), y: displayAAs,
            text, texttemplate: '%{text}',
            textfont: { size: 10, color: 'rgba(255,255,255,0.85)' },
            hovertext, hoverinfo: 'text',
            colorscale: COLOR_SCALE,
            colorbar: {
                title: { text: getColorbarTitle(scale), font: { size: 11, color: '#cfd6e6' } },
                tickfont: { color: '#cfd6e6' },
                thickness: 14, len: 0.85, outlinewidth: 0
            },
            xgap: 3, ygap: 2,
            zmin: scale === 'rank' ? 0 : undefined,
            zmax: scale === 'rank' ? 100 : undefined
        };

        const layout = {
            margin: { t: 20, b: 40, l: 45, r: 90 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6' },
            xaxis: { side: 'bottom', tickfont: { size: 11, family: 'Inter', color: '#cfd6e6' } },
            yaxis: {
                tickfont: { size: 11, family: 'JetBrains Mono', color: '#cfd6e6' },
                autorange: 'reversed'
            },
            annotations
        };

        Plotly.react(container, [trace], layout, plotlyConfig);

        const plotEl = document.getElementById(container);
        plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_click');
        plotEl.on('plotly_click', function (data) {
            const point = data.points[0];
            const posIdx = point.pointIndex[1];
            const aaIdx = point.pointIndex[0];
            App.setFilter(POSITIONS[posIdx], displayAAs[aaIdx]);
        });
    }

    function renderPairwiseHeatmaps(state) {
        const pairs = [[9,12],[9,13],[9,16],[12,13],[12,16],[13,16]];
        for (const [posA, posB] of pairs) renderPairwise(posA, posB, state);
    }

    function renderPairwise(posA, posB, state) {
        const containerId = 'pw-' + posA + '-' + posB;
        const scale = state.colorScale;
        const pairData = DataProcessor.computePairwiseStats(posA, posB, state.filteredIndices);

        let aasA = DataProcessor.aasAtPosition[posA];
        let aasB = DataProcessor.aasAtPosition[posB];
        if (state.hideStops) {
            aasA = aasA.filter(a => a !== '*');
            aasB = aasB.filter(a => a !== '*');
        }

        const z = [], hovertext = [];
        const allMeans = Object.values(pairData).map(d => d.mean);

        for (let j = 0; j < aasB.length; j++) {
            const zRow = [], hoverRow = [];
            for (let i = 0; i < aasA.length; i++) {
                const key = aasA[i] + '|' + aasB[j];
                const entry = pairData[key];
                if (entry) {
                    zRow.push(transformValue(entry.mean, scale, allMeans));
                    hoverRow.push(
                        '<b>' + posLabel(posA) + '=' + aasA[i] + ', ' + posLabel(posB) + '=' + aasB[j] + '</b><br>' +
                        'Mean fitness: ' + entry.mean.toFixed(3) + '<br>' +
                        'N = ' + entry.count.toLocaleString()
                    );
                } else {
                    zRow.push(null); hoverRow.push('No data');
                }
            }
            z.push(zRow); hovertext.push(hoverRow);
        }

        const otherFilters = [];
        for (const pos of POSITIONS) {
            if (pos !== posA && pos !== posB && state.filters[pos]) {
                otherFilters.push(posLabel(pos) + '=' + state.filters[pos]);
            }
        }
        const condText = otherFilters.length > 0 ? ' | ' + otherFilters.join(', ') : '';

        const trace = {
            type: 'heatmap',
            z, x: aasA, y: aasB,
            hovertext, hoverinfo: 'text',
            colorscale: COLOR_SCALE,
            showscale: false,
            xgap: 2, ygap: 2,
            zmin: scale === 'rank' ? 0 : undefined,
            zmax: scale === 'rank' ? 100 : undefined
        };

        const layout = {
            title: {
                text: posLabel(posA) + ' vs ' + posLabel(posB) + condText,
                font: { size: 12, family: 'Inter', color: '#cfd6e6' }
            },
            margin: { t: 35, b: 30, l: 30, r: 10 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6' },
            xaxis: {
                title: { text: posLabel(posA), font: { size: 10, color: '#cfd6e6' } },
                tickfont: { size: 9, family: 'JetBrains Mono', color: '#cfd6e6' }
            },
            yaxis: {
                title: { text: posLabel(posB), font: { size: 10, color: '#cfd6e6' } },
                tickfont: { size: 9, family: 'JetBrains Mono', color: '#cfd6e6' }
            }
        };

        Plotly.react(containerId, [trace], layout, plotlyConfig);

        const plotEl = document.getElementById(containerId);
        plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_click');
        plotEl.on('plotly_click', function (data) {
            const point = data.points[0];
            App.setFilter(posA, aasA[point.pointIndex[1]]);
        });
    }

    return { init };
})();
