/* =================================================================
   Viz Heatmap — Marginal fitness heatmap + pairwise epistasis
   ================================================================= */

const VizHeatmap = (function () {
    'use strict';

    const POSITIONS = DataProcessor.VARIABLE_POSITIONS;
    const plotlyConfig = { responsive: true, displayModeBar: false };

    // Maroon-compatible color scale
    const COLOR_SCALES = {
        log: 'YlOrRd',
        linear: 'YlOrRd',
        rank: 'YlOrRd'
    };

    function init() {
        App.subscribe(render);
    }

    function render(state) {
        renderMarginalHeatmap(state);
        renderPairwiseHeatmaps(state);
    }

    function transformValue(val, scale, allValues) {
        if (val == null || val === 0) return null;
        if (scale === 'log') {
            return Math.log10(Math.max(val, 0.001));
        } else if (scale === 'rank') {
            // Rank-based: convert to percentile
            if (!allValues || allValues.length === 0) return val;
            const sorted = [...allValues].filter(v => v != null).sort((a, b) => a - b);
            const idx = sorted.findIndex(v => v >= val);
            return idx >= 0 ? (idx / sorted.length) * 100 : 50;
        }
        return val;
    }

    function getColorbarTitle(scale) {
        if (scale === 'log') return 'log10(Fitness)';
        if (scale === 'rank') return 'Percentile';
        return 'Fitness';
    }

    function renderMarginalHeatmap(state) {
        const container = 'marginal-heatmap';
        const scale = state.colorScale;

        // Collect all values for rank-based scaling
        const allMeanValues = [];

        // Compute marginals for each position
        const positionData = {};
        for (const pos of POSITIONS) {
            positionData[pos] = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            for (const aa of Object.keys(positionData[pos])) {
                allMeanValues.push(positionData[pos][aa].mean);
            }
        }

        // Get all AAs that appear across all positions (union), in order
        const allAAs = DataProcessor.AA_ORDER.filter(aa => {
            return POSITIONS.some(pos => positionData[pos][aa]);
        });

        // Filter out stops if needed
        const displayAAs = state.hideStops ? allAAs.filter(aa => aa !== '*') : allAAs;

        // Build z-matrix, text, hovertext
        const z = [];
        const text = [];
        const hovertext = [];

        for (const aa of displayAAs) {
            const zRow = [];
            const textRow = [];
            const hoverRow = [];

            for (const pos of POSITIONS) {
                const stats = positionData[pos][aa];
                if (!stats) {
                    zRow.push(null);
                    textRow.push('');
                    hoverRow.push('N/A — AA not present at this position');
                } else {
                    const displayVal = transformValue(stats.mean, scale, allMeanValues);
                    zRow.push(displayVal);
                    textRow.push(stats.mean.toFixed(1));

                    const name = DataProcessor.AA_NAMES[aa] || aa;
                    const isFiltered = state.filters[pos] === aa;
                    const filterIcon = isFiltered ? ' [SELECTED]' : '';

                    hoverRow.push(
                        `<b>${name} (${aa})</b> at Position ${pos}${filterIcon}<br>` +
                        `Mean: ${stats.mean.toFixed(3)}<br>` +
                        `Median: ${stats.median.toFixed(3)}<br>` +
                        `Std: ${stats.std.toFixed(3)}<br>` +
                        `N = ${stats.count.toLocaleString()}`
                    );
                }
            }
            z.push(zRow);
            text.push(textRow);
            hovertext.push(hoverRow);
        }

        // Build annotations for selected cells
        const annotations = [];
        for (let r = 0; r < displayAAs.length; r++) {
            for (let c = 0; c < POSITIONS.length; c++) {
                if (state.filters[POSITIONS[c]] === displayAAs[r]) {
                    annotations.push({
                        x: c,
                        y: r,
                        text: '&#9670;',
                        showarrow: false,
                        font: { size: 16, color: '#800000' }
                    });
                }
            }
        }

        const trace = {
            type: 'heatmap',
            z: z,
            x: POSITIONS.map(p => 'Pos ' + p),
            y: displayAAs,
            text: text,
            texttemplate: '%{text}',
            textfont: { size: 10 },
            hovertext: hovertext,
            hoverinfo: 'text',
            colorscale: COLOR_SCALES[scale],
            colorbar: {
                title: { text: getColorbarTitle(scale), font: { size: 11 } },
                thickness: 15,
                len: 0.8
            },
            xgap: 3,
            ygap: 2,
            zmin: scale === 'rank' ? 0 : undefined,
            zmax: scale === 'rank' ? 100 : undefined
        };

        const layout = {
            margin: { t: 20, b: 40, l: 40, r: 80 },
            xaxis: { side: 'bottom', tickfont: { size: 11, family: 'Inter' } },
            yaxis: { tickfont: { size: 11, family: 'JetBrains Mono' }, autorange: 'reversed' },
            annotations: annotations,
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)'
        };

        Plotly.react(container, [trace], layout, plotlyConfig);

        // Add click handler for heatmap cells
        const plotEl = document.getElementById(container);
        plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_click');
        plotEl.on('plotly_click', function (data) {
            const point = data.points[0];
            const posIdx = point.pointIndex[1];
            const aaIdx = point.pointIndex[0];
            const pos = POSITIONS[posIdx];
            const aa = displayAAs[aaIdx];
            App.setFilter(pos, aa);
        });
    }

    function renderPairwiseHeatmaps(state) {
        const pairs = [
            [9, 12], [9, 13], [9, 16],
            [12, 13], [12, 16], [13, 16]
        ];

        for (const [posA, posB] of pairs) {
            renderPairwise(posA, posB, state);
        }
    }

    function renderPairwise(posA, posB, state) {
        const containerId = `pw-${posA}-${posB}`;
        const scale = state.colorScale;

        const pairData = DataProcessor.computePairwiseStats(posA, posB, state.filteredIndices);

        // Get AAs for each axis
        let aasA = DataProcessor.aasAtPosition[posA];
        let aasB = DataProcessor.aasAtPosition[posB];

        if (state.hideStops) {
            aasA = aasA.filter(a => a !== '*');
            aasB = aasB.filter(a => a !== '*');
        }

        // Build z-matrix
        const z = [];
        const hovertext = [];
        const allMeans = Object.values(pairData).map(d => d.mean);

        for (let j = 0; j < aasB.length; j++) {
            const zRow = [];
            const hoverRow = [];
            for (let i = 0; i < aasA.length; i++) {
                const key = aasA[i] + '|' + aasB[j];
                const entry = pairData[key];
                if (entry) {
                    const val = transformValue(entry.mean, scale, allMeans);
                    zRow.push(val);
                    hoverRow.push(
                        `<b>Pos ${posA}=${aasA[i]}, Pos ${posB}=${aasB[j]}</b><br>` +
                        `Mean fitness: ${entry.mean.toFixed(3)}<br>` +
                        `N = ${entry.count.toLocaleString()}`
                    );
                } else {
                    zRow.push(null);
                    hoverRow.push('No data');
                }
            }
            z.push(zRow);
            hovertext.push(hoverRow);
        }

        const trace = {
            type: 'heatmap',
            z: z,
            x: aasA,
            y: aasB,
            hovertext: hovertext,
            hoverinfo: 'text',
            colorscale: COLOR_SCALES[scale],
            showscale: false,
            xgap: 2,
            ygap: 2,
            zmin: scale === 'rank' ? 0 : undefined,
            zmax: scale === 'rank' ? 100 : undefined
        };

        // Build title showing which filters are active on OTHER positions
        const otherFilters = [];
        for (const pos of POSITIONS) {
            if (pos !== posA && pos !== posB && state.filters[pos]) {
                otherFilters.push(`P${pos}=${state.filters[pos]}`);
            }
        }
        const condText = otherFilters.length > 0 ? ` | ${otherFilters.join(', ')}` : '';

        const layout = {
            title: {
                text: `Pos ${posA} vs ${posB}${condText}`,
                font: { size: 12, family: 'Inter' }
            },
            margin: { t: 35, b: 30, l: 30, r: 10 },
            xaxis: {
                title: { text: `Pos ${posA}`, font: { size: 10 } },
                tickfont: { size: 9, family: 'JetBrains Mono' }
            },
            yaxis: {
                title: { text: `Pos ${posB}`, font: { size: 10 } },
                tickfont: { size: 9, family: 'JetBrains Mono' }
            },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)'
        };

        Plotly.react(containerId, [trace], layout, plotlyConfig);

        // Click handler for pairwise heatmap
        const plotEl = document.getElementById(containerId);
        plotEl.removeAllListeners && plotEl.removeAllListeners('plotly_click');
        plotEl.on('plotly_click', function (data) {
            const point = data.points[0];
            const aaA = aasA[point.pointIndex[1]];
            const aaB = aasB[point.pointIndex[0]];
            // Set filter for posA (toggle behavior handled inside setFilter)
            App.setFilter(posA, aaA);
        });
    }

    return { init };
})();
