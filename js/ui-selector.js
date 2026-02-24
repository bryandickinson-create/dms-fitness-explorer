/* =================================================================
   UI Selector — Position selector bar with AA chips
   ================================================================= */

const UISelector = (function () {
    'use strict';

    const container = document.getElementById('selector-container');
    const filterSummary = document.getElementById('filter-summary');

    function init() {
        renderChips();
        App.subscribe(update);
    }

    function renderChips() {
        container.innerHTML = '';

        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            const row = document.createElement('div');
            row.className = 'position-row';

            const label = document.createElement('span');
            label.className = 'position-label';
            label.textContent = 'Pos ' + pos;
            row.appendChild(label);

            const chipsDiv = document.createElement('div');
            chipsDiv.className = 'aa-chips';
            chipsDiv.id = 'chips-' + pos;

            const aas = DataProcessor.aasAtPosition[pos];
            for (const aa of aas) {
                const chip = document.createElement('button');
                chip.className = 'aa-chip';
                chip.textContent = aa;
                chip.dataset.pos = pos;
                chip.dataset.aa = aa;

                // Add property class
                const prop = DataProcessor.AA_PROPERTIES[aa] || 'special';
                chip.classList.add(prop);

                if (aa === '*') {
                    chip.classList.add('stop-codon');
                }

                chip.addEventListener('click', () => {
                    App.setFilter(parseInt(pos), aa);
                });

                chip.title = `${DataProcessor.AA_NAMES[aa] || aa} (${aa}) at position ${pos}`;
                chipsDiv.appendChild(chip);
            }

            row.appendChild(chipsDiv);

            // Clear button for this position
            const clearBtn = document.createElement('span');
            clearBtn.className = 'position-clear';
            clearBtn.textContent = 'clear';
            clearBtn.addEventListener('click', () => {
                App.clearFilter(parseInt(pos));
            });
            row.appendChild(clearBtn);

            container.appendChild(row);
        }
    }

    function update(state) {
        // Update chip selected states
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            const chips = document.querySelectorAll(`#chips-${pos} .aa-chip`);
            chips.forEach(chip => {
                const isSelected = state.filters[pos] === chip.dataset.aa;
                chip.classList.toggle('selected', isSelected);

                // Hide stop codons if toggle is on
                if (chip.dataset.aa === '*' && state.hideStops) {
                    chip.classList.add('hidden');
                } else {
                    chip.classList.remove('hidden');
                }
            });
        }

        // Update filter summary
        updateSummary(state);
    }

    function updateSummary(state) {
        const activeFilters = [];
        for (const pos of DataProcessor.VARIABLE_POSITIONS) {
            if (state.filters[pos] != null) {
                const aa = state.filters[pos];
                const name = DataProcessor.AA_NAMES[aa] || aa;
                activeFilters.push(
                    `<span class="filter-tag">Pos ${pos} = ${name} (${aa})</span>`
                );
            }
        }

        const count = App.getMatchingCount().toLocaleString();

        if (activeFilters.length === 0) {
            filterSummary.innerHTML = `Showing all <span class="count">${count}</span> sequences`;
        } else {
            filterSummary.innerHTML = `
                ${activeFilters.join(' ')}
                &mdash; <span class="count">${count}</span> matching sequences
            `;
        }
    }

    return { init };
})();
