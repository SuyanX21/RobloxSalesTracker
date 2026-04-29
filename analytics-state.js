(function() {
    const CACHE_KEY = 'salestrack_cache';
    const DAY_MS = 24 * 60 * 60 * 1000;

    const state = {
        transactions: [],
        analytics: null,
        sortKey: 'grossRobux',
        sortDir: 'desc',
        activeAssetKeys: null,
        searchQuery: '',
        whalesOnly: false,
        transactionsByGroup: {},
        analyticsByGroup: {},
        currentGroupId: null,
        showAggregate: true,
    };

    const settings = {
        timeZone: 'UTC'
    };

    window.AnalyticsState = {
        getState: () => state,
        getSettings: () => settings,
        setTransactions: (txs) => { state.transactions = txs; },
        updateAnalytics: (analytics) => { state.analytics = analytics; },
        getFilteredAssets: getFilteredAssets,
        sortAssets: sortAssets,

        getTransactionsByGroup: () => state.transactionsByGroup,
        getAnalyticsByGroup: () => state.analyticsByGroup,
        setCurrentGroupId: (groupId) => { 
            state.currentGroupId = groupId; 
            window.AnalyticsMain && window.AnalyticsMain.render && window.AnalyticsMain.render(); 
        },
        toggleAggregate: () => { 
            state.showAggregate = !state.showAggregate; 
            window.AnalyticsMain && window.AnalyticsMain.render && window.AnalyticsMain.render(); 
        },
    };


    function getFilteredAssets() {
        const currentState = state;
        if (!currentState.analytics) return [];

        const query = currentState.searchQuery.trim().toLowerCase();
        return currentState.analytics.assetMatrix.filter((row) => {
            if (currentState.activeAssetKeys && !currentState.activeAssetKeys.has(row.assetKey)) return false;
            if (currentState.whalesOnly && !row.isWhale) return false;
            if (query && !row.assetName.toLowerCase().includes(query)) return false;
            return true;
        });
    }

    function sortAssets(rows) {
        const currentState = state;
        const sorted = [...rows];
        const direction = currentState.sortDir === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            const aValue = a[currentState.sortKey];
            const bValue = b[currentState.sortKey];

            if (typeof aValue === 'string' || typeof bValue === 'string') {
                return direction * String(aValue).localeCompare(String(bValue));
            }
            return direction * ((aValue || 0) - (bValue || 0));
        });
        return sorted;
    }

    async function readCachedTransactions() {
        return new Promise(function(resolve) {
            const currentState = state;
            currentState.transactionsByGroup = {};
            currentState.analyticsByGroup = {};
            currentState.currentGroupId = null;
            currentState.showAggregate = true;

            function loadAllGroupCaches(result) {
                for (var key in result) {
                    if (key.match(/^salestrack_cache_\w+$/)) {
                        try {
                            var raw = result[key];
                            if (!raw) continue;
                            var parsed = raw;
                            if (typeof raw === 'string') parsed = JSON.parse(raw);
                            var groupId = key.replace('salestrack_cache_', '');
                            currentState.transactionsByGroup[groupId] = window.AnalyticsUtils.normalizeTransactions(parsed);
                        } catch (e) {
                            console.warn('Failed to parse', key, ':', e);
                        }
                    }
                }
            }

            function loadAllGroupCachesFromLocalStorage() {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (key.match(/^salestrack_cache_\w+$/)) {
                        try {
                            var raw = localStorage.getItem(key);
                            if (!raw) continue;
                            var parsed = JSON.parse(raw);
                            var groupId = key.replace('salestrack_cache_', '');
                            currentState.transactionsByGroup[groupId] = window.AnalyticsUtils.normalizeTransactions(parsed);
                        } catch (e) {
                            console.warn('Failed to parse', key, ':', e);
                        }
                    }
                }
            }

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(null, function(result) {
                    loadAllGroupCaches(result);
                    resolve();
                });
            } else {
                loadAllGroupCachesFromLocalStorage();
                resolve();
            }
        });
    }

    function saveCachedTransactions(transactions) {
        function doSave(data) {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ salestrack_cache: data });
                } else if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                }
            } catch (error) {
                console.warn('Failed to save to salestrack_cache:', error);
            }
        }
        
        if (transactions && Array.isArray(transactions)) {
            doSave(transactions);
        }
    }

    window.AnalyticsState.readCachedTransactions = readCachedTransactions;
    window.AnalyticsState.saveCachedTransactions = saveCachedTransactions;

})();
