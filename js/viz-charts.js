/* =================================================================
   Viz Charts — Distributions, histograms, entropy, top/bottom
   ================================================================= */

const VizCharts = (function () {
    'use strict';

    const plotlyConfig = { responsive: true, displayModeBar: false };
    const POSITIONS = DataProcessor.VARIABLE_POSITIONS;

    function init() {
        App.subscribe(render);
    }

    function render(state) {
        renderDistributions(state);
        renderHistogram(state);
        renderPositionEntropy(state);
        renderTopBottom(state);
    }

    function renderDistributions(state) {
        const container = 'distribution-plot';
        const traces = [];

        // Color palette for positions (maroon-themed)
        const posColors = {
            9: '#800000',
            12: '#5a9fa6',
            13: '#a07d1e',
            16: '#0d8f65'
        };

        for (const pos of POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            const aas = DataProcessor.aasAtPosition[pos];

            // Show top AAs by mean fitness (limit to keep chart readable)
            const aaStats = [];
            for (const aa of aas) {
                if (state.hideStops && aa === '*') continue;
                const stats = marginals[aa];
                if (!stats || stats.count === 0) continue;
                aaStats.push({ aa, mean: stats.mean, count: stats.count });
            }
            aaStats.sort((a, b) => b.mean - a.mean);

            // Show bar chart of mean fitness per AA at this position
            traces.push({
                type: 'bar',
                x: aaStats.map(s => s.aa),
                y: aaStats.map(s => s.mean),
                name: `Pos ${pos}`,
                marker: {
                    color: aaStats.map(s =>
                        state.filters[pos] === s.aa ? posColors[pos] : posColors[pos] + '60'
                    )
                },
                hovertext: aaStats.map(s =>
                    `<b>${DataProcessor.AA_NAMES[s.aa]} (${s.aa})</b> at Pos ${pos}<br>` +
                    `Mean: ${s.mean.toFixed(3)}<br>N = ${s.count.toLocaleString()}`
                ),
                hoverinfo: 'text',
                xaxis: 'x' + (POSITIONS.indexOf(pos) + 1),
                yaxis: 'y' + (POSITIONS.indexOf(pos) + 1)
            });
        }

        // Create subplot layout with 4 subplots (one per position)
        const layout = {
            margin: { t: 30, b: 30, l: 45, r: 10 },
            showlegend: false,
            grid: { rows: 4, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            annotations: []
        };

        for (let i = 0; i < POSITIONS.length; i++) {
            const pos = POSITIONS[i];
            const axisIdx = i + 1;
            const xKey = 'xaxis' + (axisIdx === 1 ? '' : axisIdx);
            const yKey = 'yaxis' + (axisIdx === 1 ? '' : axisIdx);

            layout[xKey] = {
                tickfont: { size: 9, family: 'JetBrains Mono' },
                title: { text: '', font: { size: 9 } }
            };
            layout[yKey] = {
                tickfont: { size: 9 },
                title: { text: '', font: { size: 9 } }
            };

            // Add position label as annotation
            layout.annotations.push({
                text: `<b>Pos ${pos}</b>`,
                xref: 'x' + axisIdx + ' domain',
                yref: 'y' + axisIdx + ' domain',
                x: 0,
                y: 1.12,
                showarrow: false,
                font: { size: 10, color: posColors[pos] }
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
            opacity: 0.5,
            marker: { color: '#ccc' },
            nbinsx: 80
        }];

        if (state.filteredIndices !== null) {
            traces.push({
                type: 'histogram',
                x: filteredSlopes.map(v => Math.log10(Math.max(v, 0.001))),
                name: 'Filtered',
                opacity: 0.7,
                marker: { color: '#800000' },
                nbinsx: 80
            });
        }

        const layout = {
            margin: { t: 20, b: 50, l: 50, r: 20 },
            xaxis: {
                title: { text: 'log10(Fitness)', font: { size: 11 } },
                tickfont: { size: 10 }
            },
            yaxis: {
                title: { text: 'Count', font: { size: 11 } },
                tickfont: { size: 10 }
            },
            barmode: 'overlay',
            showlegend: state.filteredIndices !== null,
            legend: { x: 0.7, y: 0.95, font: { size: 10 } },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)'
        };

        Plotly.react(container, traces, layout, plotlyConfig);
    }

    function renderPositionEntropy(state) {
        const container = 'position-entropy';
        const entropies = DataProcessor.computePositionEntropy(state.filteredIndices);

        const positions = POSITIONS.map(p => 'Pos ' + p);
        const values = POSITIONS.map(p => entropies[p].entropy);
        const maxValues = POSITIONS.map(p => entropies[p].maxEntropy);
        const numAAs = POSITIONS.map(p => entropies[p].numAAs);

        const traces = [
            {
                type: 'bar',
                x: positions,
                y: maxValues,
                name: 'Max entropy',
                marker: { color: 'rgba(128,0,0,0.15)' },
                hovertext: numAAs.map((n, i) => `Max entropy: ${maxValues[i].toFixed(2)} bits (${n} AAs)`),
                hoverinfo: 'text'
            },
            {
                type: 'bar',
                x: positions,
                y: values,
                name: 'Observed entropy',
                marker: { color: '#800000' },
                hovertext: values.map((v, i) => `Entropy: ${v.toFixed(2)} bits (${numAAs[i]} AAs)`),
                hoverinfo: 'text'
            }
        ];

        const layout = {
            margin: { t: 20, b: 40, l: 50, r: 20 },
            yaxis: {
                title: { text: 'Shannon Entropy (bits)', font: { size: 11 } },
                tickfont: { size: 10 }
            },
            xaxis: { tickfont: { size: 11 } },
            barmode: 'overlay',
            showlegend: true,
            legend: { x: 0.55, y: 0.95, font: { size: 10 } },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)'
        };

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
            return `
                <div class="ranked-item">
                    <span class="ranked-rank">#${s.rank}</span>
                    <span class="ranked-seq">${seqHtml}</span>
                    <span class="ranked-fitness">${s.slope.toFixed(2)}</span>
                </div>
            `;
        }).join('');
    }

    function highlightVariablePositions(seq) {
        const varSet = new Set(DataProcessor.VARIABLE_POSITIONS);
        let html = '';
        for (let i = 0; i < seq.length; i++) {
            if (varSet.has(i)) {
                html += `<span class="var-aa">${seq[i]}</span>`;
            } else {
                html += seq[i];
            }
        }
        return html;
    }

    function sampleArray(arr, n) {
        if (arr.length <= n) return arr;
        const result = [];
        const step = arr.length / n;
        for (let i = 0; i < n; i++) {
            result.push(arr[Math.floor(i * step)]);
        }
        return result;
    }

    return { init };
})();
