/* =================================================================
   Data Loader — PapaParse CSV loading with progress
   ================================================================= */

const DataLoader = (function () {
    'use strict';

    const overlay = document.getElementById('loading-overlay');
    const statusEl = document.getElementById('loading-status');
    const progressEl = document.getElementById('loading-progress');

    function setStatus(msg) {
        if (statusEl) statusEl.textContent = msg;
    }

    function setProgress(pct) {
        if (progressEl) progressEl.style.width = pct + '%';
    }

    function hideOverlay() {
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 600);
        }
    }

    function load(callback) {
        setStatus('Downloading CSV data...');
        setProgress(10);

        Papa.parse('data/fitness_data.csv', {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function (results) {
                setStatus('Building search indices...');
                setProgress(60);

                // Use setTimeout to let the UI update (rAF doesn't fire in background tabs)
                setTimeout(() => {
                    DataProcessor.init(results.data);
                    setStatus('Rendering visualizations...');
                    setProgress(90);

                    setTimeout(() => {
                        try {
                            callback();
                        } catch (err) {
                            console.error('Init error:', err);
                        }
                        setProgress(100);
                        setTimeout(hideOverlay, 300);
                    }, 50);
                }, 50);
            },
            error: function (err) {
                setStatus('Error loading data: ' + err.message);
                console.error('PapaParse error:', err);
            }
        });
    }

    return { load };
})();
