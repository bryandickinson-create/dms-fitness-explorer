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
                const isFile = location.protocol === 'file:';
                if (isFile) {
                    setStatus('');
                    if (statusEl) {
                        statusEl.innerHTML =
                            '<div style="color:#fbbf24;font-size:13.5px;line-height:1.6;">' +
                            "Browsers won't load CSV files over <code>file://</code> URLs.<br>" +
                            'Please run a local server, e.g.:<br>' +
                            '<code style="display:inline-block;margin-top:6px;background:#1a2238;padding:6px 10px;border-radius:6px;font-size:12px;">python3 -m http.server 8000</code><br>' +
                            'or double-click <strong>start.command</strong> in this folder.' +
                            '</div>';
                    }
                } else {
                    setStatus('Error loading data: ' + (err && err.message ? err.message : 'check console'));
                }
                console.error('PapaParse error:', err);
            }
        });
    }

    return { load };
})();
