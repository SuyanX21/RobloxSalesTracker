(function() {
    async function loadSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['timeZone'], function(result) {
                    window.AnalyticsState.getSettings().timeZone = window.AnalyticsUtils.normalizeTimeZone(result.timeZone);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    function handleJsonLoad() {
        var input = document.getElementById('jsonInput');
        if (!input) return;
        
        var status = document.getElementById('jsonStatus');
        var text = input.value.trim();
        if (!text) {
            if (status) status.textContent = 'Paste a JSON array first.';
            return;
        }

        try {
            var parsed = JSON.parse(text);
            var toMerge = [];
            
            if (Array.isArray(parsed)) {
                toMerge = parsed;
            } else if (parsed && Array.isArray(parsed.transactions)) {
                toMerge = parsed.transactions;
            } else if (parsed && Array.isArray(parsed.data)) {
                toMerge = parsed.data;
            } else {
                throw new Error('JSON must be an array or contain a "data" or "transactions" array.');
            }

            var state = window.AnalyticsState.getState();
            var before = state.transactions.length;
            state.transactions = window.AnalyticsUtils.mergeTransactions(state.transactions, toMerge);
            window.AnalyticsState.saveCachedTransactions(state.transactions);
            var added = Math.max(0, state.transactions.length - before);
            if (status) {
                status.textContent = 'Loaded successfully. ' + added.toLocaleString() + ' new rows merged.';
                status.style.color = '#00b06f';
            }
            window.AnalyticsMain.render();
        } catch (error) {
            if (status) {
                status.textContent = 'Invalid JSON: ' + error.message;
                status.style.color = '#d65a5a';
            }
        }
    }

    function render() {
        const state = window.AnalyticsState.getState();
        const settings = window.AnalyticsState.getSettings();
        
        const transactionsByGroup = state.transactionsByGroup || {};
        const analyticsByGroup = window.AnalyticsCore.processAnalyticsByGroup(transactionsByGroup, settings.timeZone);
        const availableGroupIds = Object.keys(analyticsByGroup);
        
        state.analyticsByGroup = analyticsByGroup;
        
        if ((!state.currentGroupId || !analyticsByGroup[state.currentGroupId]) && availableGroupIds.length > 0) {
            state.currentGroupId = availableGroupIds[0];
        }
        
        if (state.showAggregate || !state.currentGroupId) {
            state.analytics = analyticsByGroup[availableGroupIds[0]] || null;
        } else {
            state.analytics = analyticsByGroup[state.currentGroupId] || analyticsByGroup[availableGroupIds[0]] || null;
        }
        
        window.AnalyticsUI.renderStats();
        window.AnalyticsUI.renderHeatmap();
        window.AnalyticsUI.renderAssetFilters();
        window.AnalyticsUI.renderTable();
        window.AnalyticsUI.renderChart();
    }

    function bindEvents() {
        const fetchBtn = document.getElementById('fetchLatestBtn');
        if (fetchBtn) {
            fetchBtn.addEventListener('click', async function() {
                var button = this;
                button.disabled = true;
                button.textContent = 'Loading...';
                window.AnalyticsUI.setStatus('Loading all group caches...');

                try {
                    await window.AnalyticsState.readCachedTransactions();
                    render();
                    window.AnalyticsUI.setStatus(Object.keys(window.AnalyticsState.getState().transactionsByGroup).length + ' groups loaded');
                } catch (error) {
                    console.error(error);
                    window.AnalyticsUI.setStatus('Error loading caches', true);
                } finally {
                    button.disabled = false;
                    button.textContent = 'Refresh Groups';
                }
            });
        }

        const exportBtn = document.getElementById('exportCsvBtn');
        if (exportBtn) exportBtn.addEventListener('click', window.AnalyticsUI.triggerCsvDownload);
        const loadBtn = document.getElementById('loadJsonBtn');
        if (loadBtn) loadBtn.addEventListener('click', handleJsonLoad);

        const searchInput = document.getElementById('assetSearch');
        if (searchInput) searchInput.addEventListener('input', function(event) {
            window.AnalyticsState.getState().searchQuery = event.target.value || '';
            window.AnalyticsUI.renderTable();
        });

        const whalesCheckbox = document.getElementById('whalesOnly');
        if (whalesCheckbox) whalesCheckbox.addEventListener('change', function(event) {
            window.AnalyticsState.getState().whalesOnly = Boolean(event.target.checked);
            window.AnalyticsUI.renderTable();
        });

        document.querySelectorAll('.sort-btn').forEach(function(button) {
            button.addEventListener('click', function() {
                var state = window.AnalyticsState.getState();
                var key = button.dataset.sort;
                if (!key) return;
                if (state.sortKey === key) {
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortKey = key;
                    state.sortDir = 'desc';
                }
                window.AnalyticsUI.renderTable();
            });
        });

        window.addEventListener('resize', window.AnalyticsUI.renderChart);
    }

    async function boot() {
        await loadSettings();
        bindEvents();
        await window.AnalyticsState.readCachedTransactions();
        render();
    }

    window.processAnalytics = window.AnalyticsCore.processAnalytics;
    window.salestrackDashboard = {
        setTransactions: function(transactions) {},
        mergeTransactions: window.AnalyticsUtils.mergeTransactions,
        processAnalytics: window.AnalyticsCore.processAnalytics,
    };

    window.AnalyticsMain = {
        boot,
        render
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

