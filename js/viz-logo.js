/* =================================================================
   Viz Logo — Sequence-logo style chart per variable position
   For each position, shows a stacked column where each AA letter's
   height is proportional to its mean fitness contribution.
   ================================================================= */

const VizLogo = (function () {
    'use strict';

    const POSITIONS = [9, 12, 13, 16];
    const PDB_RESI = { 9: 81, 12: 84, 13: 85, 16: 88 };
    const WT_AA = { 9: 'C', 12: 'K', 13: 'A', 16: 'V' };

    // AA colors by biochemical class (matches global palette)
    const AA_COLORS = {
        // Hydrophobic
        'G': '#7da7ff', 'A': '#7da7ff', 'V': '#7da7ff', 'L': '#7da7ff',
        'I': '#7da7ff', 'M': '#7da7ff',
        // Aromatic
        'F': '#c084fc', 'W': '#c084fc', 'Y': '#c084fc',
        // Polar
        'S': '#4ade80', 'T': '#4ade80', 'N': '#4ade80', 'Q': '#4ade80', 'C': '#4ade80',
        // Positive
        'K': '#f87171', 'R': '#f87171', 'H': '#f87171',
        // Negative
        'D': '#fb923c', 'E': '#fb923c',
        // Special
        'P': '#a3a3a3',
        // Stop
        '*': '#ef4444'
    };

    function init() {
        App.subscribe(render);
    }

    function render(state) {
        const container = document.getElementById('sequence-logo');
        if (!container) return;

        // For each position, get marginals and sort AAs by mean fitness desc
        const columns = [];
        for (const pos of POSITIONS) {
            const marginals = DataProcessor.computeConditionalMarginals(pos, state.filteredIndices);
            const entries = [];
            for (const aa of Object.keys(marginals)) {
                if (state.hideStops && aa === '*') continue;
                const m = marginals[aa];
                if (m.count === 0) continue;
                entries.push({
                    aa,
                    mean: m.mean,
                    count: m.count,
                    selected: state.filters[pos] === aa,
                    isWT: aa === WT_AA[pos]
                });
            }
            entries.sort((a, b) => b.mean - a.mean);
            columns.push({ pos, entries });
        }

        // Find global min/max for normalization (per-column normalization)
        // We size letters by mean fitness (clipped at 0).
        const html = columns.map(col => {
            const maxMean = Math.max(...col.entries.map(e => Math.max(0, e.mean)), 0.01);
            const totalMean = col.entries.reduce((s, e) => s + Math.max(0, e.mean), 0);

            const stack = col.entries.map(e => {
                const h = totalMean > 0 ? (Math.max(0, e.mean) / totalMean) * 100 : 0;
                if (h < 0.5) return '';
                const color = AA_COLORS[e.aa] || '#888';
                const cls = 'logo-letter' + (e.selected ? ' selected' : '') + (e.isWT ? ' wt' : '');
                const title = `${e.aa} → mean fitness ${e.mean.toFixed(3)} (n=${e.count.toLocaleString()})`;
                return `<span class="${cls}" style="color:${color};height:${h}%;font-size:${Math.max(8, h*1.5)}px" title="${title}" data-pos="${col.pos}" data-aa="${e.aa}">${e.aa}</span>`;
            }).join('');

            const wtLabel = WT_AA[col.pos];
            const pdbResi = PDB_RESI[col.pos];

            return `
                <div class="logo-column" data-pos="${col.pos}">
                    <div class="logo-stack">${stack}</div>
                    <div class="logo-position">
                        <span class="logo-pos-num">${wtLabel}${pdbResi}</span>
                        <span class="logo-pos-pdb">Raf · DMS pos ${col.pos}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="logo-grid">${html}</div>
            <div class="logo-caption">Letter height = relative mean fitness contribution of each AA at that position (under current filters). Click a letter to toggle filter.</div>`;

        // Click letters to filter
        container.querySelectorAll('.logo-letter').forEach(el => {
            el.addEventListener('click', () => {
                const pos = parseInt(el.dataset.pos);
                const aa = el.dataset.aa;
                App.setFilter(pos, aa);
            });
        });
    }

    return { init };
})();
