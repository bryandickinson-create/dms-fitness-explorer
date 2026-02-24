/* =================================================================
   UI Table — Sequence explorer with virtual scrolling
   ================================================================= */

const UITable = (function () {
    'use strict';

    const BATCH_SIZE = 50;
    const tbody = document.getElementById('seq-tbody');
    const wrapper = document.getElementById('table-wrapper');
    const sentinel = document.getElementById('table-sentinel');
    const tableInfo = document.getElementById('table-info');

    let sortedData = [];
    let renderedCount = 0;
    let observer = null;

    function init() {
        // Set up intersection observer for virtual scrolling
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && renderedCount < sortedData.length) {
                renderBatch();
            }
        }, { root: wrapper, rootMargin: '200px' });

        observer.observe(sentinel);

        // Column sort click handlers
        document.querySelectorAll('.data-table th.sortable').forEach(th => {
            th.addEventListener('click', function () {
                const field = this.dataset.sort;
                const currentSort = App.state.sortBy;
                const currentDir = App.state.sortDir;

                let newDir = 'desc';
                if (field === currentSort) {
                    newDir = currentDir === 'desc' ? 'asc' : 'desc';
                }

                // Update visual indicator
                document.querySelectorAll('.data-table th').forEach(h => h.classList.remove('active-sort'));
                this.classList.add('active-sort');

                // Update sort select to match
                const select = document.getElementById('sort-select');
                const val = field + '-' + newDir;
                for (const opt of select.options) {
                    if (opt.value === val) {
                        select.value = val;
                        break;
                    }
                }

                App.setSort(field, newDir);
            });
        });

        App.subscribe(render);
    }

    function render(state) {
        sortedData = DataProcessor.getFilteredSequences(
            state.filteredIndices,
            state.sortBy,
            state.sortDir,
            state.searchQuery,
            state.hideStops
        );

        renderedCount = 0;
        tbody.innerHTML = '';

        // Update table info
        const total = DataProcessor.totalCount.toLocaleString();
        const showing = sortedData.length.toLocaleString();
        tableInfo.textContent = `Showing ${showing} of ${total} sequences`;

        renderBatch();
    }

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(renderedCount + BATCH_SIZE, sortedData.length);

        for (let i = renderedCount; i < end; i++) {
            fragment.appendChild(createRow(sortedData[i]));
        }

        tbody.appendChild(fragment);
        renderedCount = end;
    }

    function createRow(seq) {
        const tr = document.createElement('tr');

        // Rank
        const tdRank = document.createElement('td');
        tdRank.textContent = seq.rank;
        tdRank.className = 'aa-cell';
        tr.appendChild(tdRank);

        // Full sequence with highlights
        const tdSeq = document.createElement('td');
        tdSeq.className = 'seq-cell';
        tdSeq.innerHTML = highlightSequence(seq.seq);
        tr.appendChild(tdSeq);

        // Variable position cells
        for (const key of ['p9', 'p12', 'p13', 'p16']) {
            const td = document.createElement('td');
            td.className = 'aa-cell';
            td.textContent = seq[key];
            if (seq[key] === '*') {
                td.style.color = 'var(--color-danger)';
            }
            tr.appendChild(td);
        }

        // Fitness
        const tdFitness = document.createElement('td');
        tdFitness.className = 'fitness-cell';
        tdFitness.textContent = seq.slope.toFixed(3);
        tr.appendChild(tdFitness);

        // Tags
        const tdTags = document.createElement('td');
        tdTags.innerHTML = getTags(seq);
        tr.appendChild(tdTags);

        return tr;
    }

    function highlightSequence(seq) {
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

    function getTags(seq) {
        const tags = [];

        if (seq.slope >= DataProcessor.percentile1) {
            tags.push('<span class="tag tag-top1">Top 1%</span>');
        } else if (seq.slope >= DataProcessor.percentile10) {
            tags.push('<span class="tag tag-top10">Top 10%</span>');
        }

        if (seq.hasStop) {
            tags.push('<span class="tag tag-stop">Stop</span>');
        }

        return tags.join(' ');
    }

    return { init };
})();
