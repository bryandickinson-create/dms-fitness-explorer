/* =================================================================
   Viz Property — Mean fitness grouped by AA biochemical property
   For each variable position, draws a horizontal grouped bar chart
   of mean fitness for each property class (hydrophobic, aromatic,
   polar, positive, negative, special).
   ================================================================= */

const VizProperty = (function () {
    'use strict';

    const POSITIONS = [9, 12, 13, 16];
    const PDB_RESI = { 9: 81, 12: 84, 13: 85, 16: 88 };
    const WT_AA   = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };

    const PROPERTY_ORDER = ['hydrophobic', 'aromatic', 'polar', 'positive', 'negative', 'special'];
    const PROPERTY_LABEL = {
        'hydrophobic': 'Hydrophobic',
        'aromatic':    'Aromatic',
        'polar':       'Polar',
        'positive':    'Positive',
        'negative':    'Negative',
        'special':     'Special (P)'
    };
    const PROPERTY_COLOR = {
        'hydrophobic': '#4a90d9',
        'aromatic':    '#9b59b6',
        'polar':       '#27ae60',
        'positive':    '#e74c3c',
        'negative':    '#e67e22',
        'special':     '#95a5a6'
    };

    const plotlyConfig = { responsive: true, displayModeBar: false };

    function init() { App.subscribe(render); }

    function render(state) {
        const container = 'property-plot';
        if (!document.getElementById(container)) return;

        // Per-position, per-property: aggregate mean fitness weighted by count
        const dataByPos = {};
        for (const pos of POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            const propAgg = {};  // prop -> {sum,count}
            for (const aa of Object.keys(marginals)) {
                if (aa === '*') continue;  // exclude stop
                const prop = DataProcessor.AA_PROPERTIES[aa];
                if (!PROPERTY_ORDER.includes(prop)) continue;
                if (!propAgg[prop]) propAgg[prop] = { sum: 0, count: 0 };
                propAgg[prop].sum += marginals[aa].mean * marginals[aa].count;
                propAgg[prop].count += marginals[aa].count;
            }
            const result = {};
            for (const prop of PROPERTY_ORDER) {
                if (propAgg[prop] && propAgg[prop].count > 0) {
                    result[prop] = {
                        mean: propAgg[prop].sum / propAgg[prop].count,
                        count: propAgg[prop].count
                    };
                }
            }
            dataByPos[pos] = result;
        }

        // Build grouped bar chart: x = position; one trace per property
        const traces = PROPERTY_ORDER.map(prop => {
            return {
                type: 'bar',
                name: PROPERTY_LABEL[prop],
                x: POSITIONS.map(p => WT_AA[p] + PDB_RESI[p]),
                y: POSITIONS.map(p => dataByPos[p][prop] ? dataByPos[p][prop].mean : null),
                marker: { color: PROPERTY_COLOR[prop] },
                hovertemplate: '<b>' + PROPERTY_LABEL[prop] + '</b><br>%{x}<br>Mean fitness: %{y:.3f}<extra></extra>'
            };
        });

        const layout = {
            margin: { t: 20, b: 50, l: 55, r: 10 },
            barmode: 'group',
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#cfd6e6', family: 'Inter, sans-serif', size: 11 },
            xaxis: { tickfont: { color: '#cfd6e6' }, gridcolor: 'rgba(255,255,255,0.05)' },
            yaxis: {
                title: { text: 'Mean fitness', font: { color: '#cfd6e6', size: 11 } },
                tickfont: { color: '#cfd6e6' },
                gridcolor: 'rgba(255,255,255,0.07)',
                zeroline: false
            },
            legend: {
                orientation: 'h',
                x: 0, y: -0.15,
                font: { size: 10, color: '#cfd6e6' }
            }
        };

        Plotly.react(container, traces, layout, plotlyConfig);
    }

    return { init };
})();
