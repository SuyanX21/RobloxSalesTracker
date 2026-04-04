(function initSalesTrackerStorageModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    ST.createStorageController = function createStorageController(tracker, deps) {
        function loadSettings() {
            return tracker.settingsCache;
        }

        function initializeSettings(onUpdated) {
            if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) {
                return;
            }

            chrome.storage.local.get(['showConversion', 'currency', 'showNotifications', 'darkMode', 'timeZone'], function (result) {
                tracker.settingsCache = {
                    showConversion: result.showConversion !== false,
                    currency: result.currency || 'USD',
                    showNotifications: result.showNotifications === true,
                    darkMode: result.darkMode === true,
                    timeZone: result.timeZone || 'UTC'
                };

                if (typeof onUpdated === 'function') {
                    onUpdated();
                }
            });
        }

        function installSettingsListener(onUpdated) {
            if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged)) {
                return;
            }

            chrome.storage.onChanged.addListener(function (changes, areaName) {
                if (areaName === 'local' && (changes.showConversion || changes.currency || changes.showNotifications || changes.darkMode || changes.timeZone)) {
                    initializeSettings(onUpdated);
                }
            });
        }

        function loadState() {
            var saved = localStorage.getItem('sales_tracker_' + tracker.groupId);
            if (!saved) {
                return;
            }

            try {
                var parsed = JSON.parse(saved);
                var today = new Date().toDateString();

                if (parsed.lastResetDate !== today) {
                    parsed.today = { count: 0, robux: 0 };
                    parsed.lastResetDate = today;
                }

                parsed.isScanning = false;
                tracker.state = Object.assign({}, tracker.state, parsed);
                tracker.state.processedIds = new Set(tracker.state.processedIds || []);

                // Recalculate persisted 7-day totals after reload.
                prunePast7DaysCounters().catch(function (error) {
                    console.error(error);
                });
            } catch (error) {
                console.warn('Sales Tracker: Failed to parse saved state, resetting.', error);
            }
        }

        function resetState(newType) {
            tracker.state = ST.createInitialState(newType || 'new');
        }

        function saveState() {
            var stateToSave = Object.assign({}, tracker.state, {
                processedIds: Array.from(tracker.state.processedIds || new Set())
            });

            localStorage.setItem('sales_tracker_' + tracker.groupId, JSON.stringify(stateToSave));

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                var payload = {};
                payload['sales_tracker_' + tracker.groupId] = stateToSave;
                chrome.storage.local.set(payload);
            }
        }

        function saveTransactionsForAnalytics() {
            if (tracker.collectedTransactions.length === 0) {
                return;
            }

            function doSave(existingData) {
                var existingTx = [];
                if (existingData) {
                    try {
                        existingTx = JSON.parse(existingData);
                        if (!Array.isArray(existingTx)) {
                            existingTx = [];
                        }
                    } catch (e) {
                        existingTx = [];
                    }
                }

                var merged = tracker.collectedTransactions.slice();
                var existingIds = new Set(tracker.collectedTransactions.map(function (tx) {
                    return tx.id;
                }));

                for (var i = 0; i < existingTx.length; i++) {
                    var tx = existingTx[i];
                    if (!existingIds.has(tx.id)) {
                        merged.push(tx);
                    }
                }

                merged.sort(function (a, b) {
                    return new Date(b.created) - new Date(a.created);
                });

                var trimmed = merged.slice(0, 10000);

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ salestrack_cache: trimmed }, function () {
                        console.log('Sales Tracker: Saved', trimmed.length, 'transactions to salestrack_cache for analytics');
                    });
                } else {
                    try {
                        localStorage.setItem('salestrack_cache', JSON.stringify(trimmed));
                        console.log('Sales Tracker: Saved', trimmed.length, 'transactions to salestrack_cache for analytics');
                    } catch (error) {
                        console.warn('Sales Tracker: Failed to save transactions for analytics:', error);
                    }
                }

                tracker.collectedTransactions = [];
            }

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['salestrack_cache'], function (result) {
                    doSave(result.salestrack_cache ? JSON.stringify(result.salestrack_cache) : null);
                });
            } else {
                var existing = localStorage.getItem('salestrack_cache');
                doSave(existing);
            }
        }

        async function fetchGroupCurrency() {
            try {
                var endpoint = '/v1/groups/' + tracker.groupId + '/currency';
                var data = await deps.callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });
                if (data && typeof data.robux === 'number') {
                    tracker.state.groupBalance = data.robux;
                    tracker.state.actualPendingRobux = data.pendingRobux || 0;
                    console.log('Sales Tracker: Updated group currency:', data);
                }
            } catch (error) {
                console.warn('Sales Tracker: Failed to fetch group currency:', error);
            }
        }

        async function prunePast7DaysCounters() {
            // Only prune if it's been more than 15 minutes since last prune to save API calls
            var now = Date.now();
            if (tracker.state.lastPruneTime && (now - tracker.state.lastPruneTime < 15 * 60 * 1000)) {
                console.log('Sales Tracker: Skipping 7-day prune (too recent)');
                return;
            }

            console.log('Sales Tracker: Pruning past7Days counters...');
            var sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

            var tempPast7Days = { count: 0, robux: 0 };
            var cursor = '';
            var pageCount = 0;
            var maxPages = 50;
            var hitOlderThan7Days = false;

            try {
                while (pageCount < maxPages) {
                    var endpointCursor = cursor ? '&cursor=' + cursor : '';
                    var endpoint = '/v2/groups/' + tracker.groupId + '/transactions?limit=100&transactionType=Sale' + endpointCursor;
                    var data = await deps.callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });

                    if (!(data && data.data && data.data.length)) {
                        break;
                    }

                    for (var i = 0; i < data.data.length; i++) {
                        var txn = data.data[i];
                        if (!txn.currency || typeof txn.currency.amount !== 'number') {
                            continue;
                        }

                        var txnDate = new Date(txn.created);
                        if (txnDate >= sevenDaysAgo) {
                            tempPast7Days.count += 1;
                            tempPast7Days.robux += txn.currency.amount;
                        } else {
                            // If we hit a transaction older than 7 days, we can stop fetching pages.
                            hitOlderThan7Days = true;
                            break;
                        }
                    }

                    if (hitOlderThan7Days || !data.nextPageCursor) {
                        break;
                    }

                    cursor = data.nextPageCursor;
                    pageCount += 1;
                    await new Promise(function (resolve) {
                        setTimeout(resolve, 300);
                    });
                }
            } catch (error) {
                console.warn('Prune past7Days failed:', error);
                return;
            }

            tracker.state.past7Days = tempPast7Days;
            tracker.state.lastPruneTime = Date.now();
            console.log('Past7Days recalculated: ' + tempPast7Days.count + ' sales, R$ ' + tempPast7Days.robux.toLocaleString());
        }

        return {
            loadSettings: loadSettings,
            initializeSettings: initializeSettings,
            installSettingsListener: installSettingsListener,
            loadState: loadState,
            resetState: resetState,
            saveState: saveState,
            saveTransactionsForAnalytics: saveTransactionsForAnalytics,
            prunePast7DaysCounters: prunePast7DaysCounters,
            fetchGroupCurrency: fetchGroupCurrency
        };
    };
})();
