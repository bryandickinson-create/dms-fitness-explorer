/* =================================================================
   Data Processor — Index building, filtering, and statistics
   ================================================================= */

const DataProcessor = (function () {
    'use strict';

    // Variable positions in the 25-AA sequence (0-indexed)
    const VARIABLE_POSITIONS = [9, 12, 13, 16];
    const POS_KEYS = ['p9', 'p12', 'p13', 'p16'];

    // Scaffold: VRNGMSLHD_LM__LK_RGLQPECC
    const SCAFFOLD = 'VRNGMSLHD_LM__LK_RGLQPECC';

    // Biochemical amino acid ordering
    const AA_ORDER = [
        'G', 'A', 'V', 'L', 'I', 'M',  // Hydrophobic
        'F', 'W', 'Y',                    // Aromatic
        'S', 'T', 'N', 'Q', 'C',          // Polar
        'K', 'R', 'H',                    // Positive
        'D', 'E',                          // Negative
        'P',                               // Special
        '*'                                // Stop
    ];

    // AA property classification
    const AA_PROPERTIES = {
        'G': 'hydrophobic', 'A': 'hydrophobic', 'V': 'hydrophobic',
        'L': 'hydrophobic', 'I': 'hydrophobic', 'M': 'hydrophobic',
        'F': 'aromatic', 'W': 'aromatic', 'Y': 'aromatic',
        'S': 'polar', 'T': 'polar', 'N': 'polar', 'Q': 'polar', 'C': 'polar',
        'K': 'positive', 'R': 'positive', 'H': 'positive',
        'D': 'negative', 'E': 'negative',
        'P': 'special',
        '*': 'stop'
    };

    // Three-letter AA names
    const AA_NAMES = {
        'G': 'Gly', 'A': 'Ala', 'V': 'Val', 'L': 'Leu', 'I': 'Ile', 'M': 'Met',
        'F': 'Phe', 'W': 'Trp', 'Y': 'Tyr',
        'S': 'Ser', 'T': 'Thr', 'N': 'Asn', 'Q': 'Gln', 'C': 'Cys',
        'K': 'Lys', 'R': 'Arg', 'H': 'His',
        'D': 'Asp', 'E': 'Glu',
        'P': 'Pro',
        '*': 'Stop'
    };

    // Stored data
    let sequences = [];       // Array of { p9, p12, p13, p16, slope, rank, seq, hasStop }
    let indexByPosition = {};  // { pos: { aa: [indices] } }
    let aasAtPosition = {};    // { pos: [sorted AAs present] }
    let totalCount = 0;
    let maxSlope = 0;
    let minSlope = Infinity;
    let percentile1 = 0;
    let percentile10 = 0;

    function init(rawData) {
        sequences = [];
        indexByPosition = {};
        aasAtPosition = {};

        for (const pos of VARIABLE_POSITIONS) {
            indexByPosition[pos] = {};
        }

        // Parse raw data into compact representation
        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row['Protein Seq'] || row['Slope'] == null) continue;

            const seq = row['Protein Seq'];
            const slope = parseFloat(row['Slope']);
            if (isNaN(slope)) continue;

            const p9 = seq[9] || '';
            const p12 = seq[12] || '';
            const p13 = seq[13] || '';
            const p16 = seq[16] || '';
            const hasStop = p9 === '*' || p12 === '*' || p13 === '*' || p16 === '*';

            const idx = sequences.length;
            sequences.push({
                p9, p12, p13, p16,
                slope,
                rank: parseInt(row['Rank']) || (i + 1),
                seq,
                hasStop
            });

            if (slope > maxSlope) maxSlope = slope;
            if (slope < minSlope) minSlope = slope;

            // Build position index
            for (const pos of VARIABLE_POSITIONS) {
                const aa = seq[pos];
                if (!indexByPosition[pos][aa]) {
                    indexByPosition[pos][aa] = [];
                }
                indexByPosition[pos][aa].push(idx);
            }
        }

        totalCount = sequences.length;

        // Sort AAs at each position using biochemical ordering
        for (const pos of VARIABLE_POSITIONS) {
            const aas = Object.keys(indexByPosition[pos]);
            aasAtPosition[pos] = AA_ORDER.filter(aa => aas.includes(aa));
        }

        // Compute percentile thresholds
        const sortedSlopes = sequences.map(s => s.slope).sort((a, b) => b - a);
        percentile1 = sortedSlopes[Math.floor(totalCount * 0.01)] || 0;
        percentile10 = sortedSlopes[Math.floor(totalCount * 0.10)] || 0;
    }

    function getFilteredIndices(filters) {
        let result = null;
        for (const pos of VARIABLE_POSITIONS) {
            const aa = filters[pos];
            if (aa == null) continue;
            const matching = indexByPosition[pos][aa];
            if (!matching) return new Set();
            if (result === null) {
                result = new Set(matching);
            } else {
                const newResult = new Set();
                for (const idx of matching) {
                    if (result.has(idx)) newResult.add(idx);
                }
                result = newResult;
            }
        }
        return result; // null means "all"
    }

    function computeConditionalMarginals(pos, filteredIndices) {
        // For a given position, compute mean fitness for each AA
        // considering only sequences matching filteredIndices
        const results = {};
        const aas = aasAtPosition[pos];

        for (const aa of aas) {
            const aaIndices = indexByPosition[pos][aa];
            let sum = 0;
            let sumSq = 0;
            let count = 0;
            const values = [];

            for (const idx of aaIndices) {
                if (filteredIndices !== null && !filteredIndices.has(idx)) continue;
                const slope = sequences[idx].slope;
                sum += slope;
                sumSq += slope * slope;
                count++;
                values.push(slope);
            }

            if (count > 0) {
                const mean = sum / count;
                const variance = (sumSq / count) - (mean * mean);
                values.sort((a, b) => a - b);
                const median = count % 2 === 0
                    ? (values[count / 2 - 1] + values[count / 2]) / 2
                    : values[Math.floor(count / 2)];

                results[aa] = {
                    mean,
                    median,
                    std: Math.sqrt(Math.max(0, variance)),
                    count,
                    values
                };
            }
        }

        return results;
    }

    function computePairwiseStats(posA, posB, filteredIndices) {
        // Compute mean fitness for each AA combination at posA x posB
        const accumulator = {};

        const allIndices = filteredIndices !== null
            ? filteredIndices
            : new Set(sequences.map((_, i) => i));

        for (const idx of allIndices) {
            const s = sequences[idx];
            const aaA = s['p' + posA];
            const aaB = s['p' + posB];
            const key = aaA + '|' + aaB;

            if (!accumulator[key]) {
                accumulator[key] = { sum: 0, count: 0, aaA, aaB };
            }
            accumulator[key].sum += s.slope;
            accumulator[key].count++;
        }

        // Convert to structured result
        const result = {};
        for (const key of Object.keys(accumulator)) {
            const entry = accumulator[key];
            result[key] = {
                aaA: entry.aaA,
                aaB: entry.aaB,
                mean: entry.sum / entry.count,
                count: entry.count
            };
        }

        return result;
    }

    function getFilteredSequences(filteredIndices, sortBy, sortDir, searchQuery, hideStops) {
        let indices;
        if (filteredIndices !== null) {
            indices = Array.from(filteredIndices);
        } else {
            indices = sequences.map((_, i) => i);
        }

        let result = indices.map(i => sequences[i]);

        // Apply stop filter
        if (hideStops) {
            result = result.filter(s => !s.hasStop);
        }

        // Apply search
        if (searchQuery) {
            const q = searchQuery.toUpperCase();
            result = result.filter(s => {
                // Search in variable positions concatenated
                const varAAs = s.p9 + s.p12 + s.p13 + s.p16;
                if (varAAs.includes(q)) return true;
                // Search in full sequence
                if (s.seq.includes(q)) return true;
                // Search by rank number
                if (String(s.rank).includes(q)) return true;
                return false;
            });
        }

        // Sort
        const dir = sortDir === 'asc' ? 1 : -1;
        if (sortBy === 'slope') {
            result.sort((a, b) => (a.slope - b.slope) * dir);
        } else if (sortBy === 'rank') {
            result.sort((a, b) => (a.rank - b.rank) * dir);
        } else if (sortBy === 'p9' || sortBy === 'p12' || sortBy === 'p13' || sortBy === 'p16') {
            result.sort((a, b) => {
                if (a[sortBy] < b[sortBy]) return -1 * dir;
                if (a[sortBy] > b[sortBy]) return 1 * dir;
                return 0;
            });
        }

        return result;
    }

    function computePositionEntropy(filteredIndices) {
        const entropies = {};
        for (const pos of VARIABLE_POSITIONS) {
            const marginals = computeConditionalMarginals(pos, filteredIndices);
            let totalCount = 0;
            for (const aa of Object.keys(marginals)) {
                totalCount += marginals[aa].count;
            }

            let entropy = 0;
            for (const aa of Object.keys(marginals)) {
                const p = marginals[aa].count / totalCount;
                if (p > 0) {
                    entropy -= p * Math.log2(p);
                }
            }

            entropies[pos] = {
                entropy,
                maxEntropy: Math.log2(Object.keys(marginals).length),
                numAAs: Object.keys(marginals).length
            };
        }
        return entropies;
    }

    function getTopBottom(n, filteredIndices) {
        let data;
        if (filteredIndices !== null) {
            data = Array.from(filteredIndices).map(i => sequences[i]);
        } else {
            data = [...sequences];
        }

        data.sort((a, b) => b.slope - a.slope);
        return {
            top: data.slice(0, n),
            bottom: data.slice(-n).reverse()
        };
    }

    function getAllSlopes(filteredIndices) {
        if (filteredIndices !== null) {
            return Array.from(filteredIndices).map(i => sequences[i].slope);
        }
        return sequences.map(s => s.slope);
    }

    // Public API
    return {
        VARIABLE_POSITIONS,
        POS_KEYS,
        SCAFFOLD,
        AA_ORDER,
        AA_PROPERTIES,
        AA_NAMES,

        init,
        getFilteredIndices,
        computeConditionalMarginals,
        computePairwiseStats,
        getFilteredSequences,
        computePositionEntropy,
        getTopBottom,
        getAllSlopes,

        get sequences() { return sequences; },
        get totalCount() { return totalCount; },
        get maxSlope() { return maxSlope; },
        get minSlope() { return minSlope; },
        get percentile1() { return percentile1; },
        get percentile10() { return percentile10; },
        get aasAtPosition() { return aasAtPosition; },
        get indexByPosition() { return indexByPosition; }
    };
})();
