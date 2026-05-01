(function initSalesTrackerStorageModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    ST.createStorageController = function createStorageController(tracker, deps) {
        var trackerScopeType = tracker.scopeType === 'user' ? 'user' : 'group';
        var trackerEntityId = String(tracker.entityId || tracker.groupId || tracker.userId || '');

        function getStateCacheKey() {
            return 'sales_tracker_' + trackerScopeType + '_' + trackerEntityId;
        }

        function getAnalyticsCacheKey() {
            return trackerEntityId ? ('salestrack_cache_' + trackerScopeType + '_' + trackerEntityId) : 'salestrack_cache';
        }

        function getTransactionsEndpoint(cursorValue) {
            var cursor = cursorValue ? '&cursor=' + cursorValue : '';
            if (trackerScopeType === 'user') {
                return '/v2/users/' + trackerEntityId + '/transactions?limit=100&transactionType=Sale' + cursor;
            }
            return '/v2/groups/' + trackerEntityId + '/transactions?limit=100&transactionType=Sale' + cursor;
        }

        function normalizeTimeZone(timeZone) {
            var candidate = (typeof timeZone === 'string' && timeZone) ? timeZone : 'UTC';
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
                return candidate;
            } catch (e) {
                return 'UTC';
            }
        }

        function toFiniteNumber(value, fallback) {
            var num = Number(value);
            return isFinite(num) ? num : fallback;
        }

        function normalizeCounter(counter) {
            if (!counter || typeof counter !== 'object') {
                return { count: 0, robux: 0 };
            }
            return {
                count: Math.max(0, Math.floor(toFiniteNumber(counter.count, 0))),
                robux: toFiniteNumber(counter.robux, 0)
            };
        }

        function normalizeProcessedIds(value) {
            var input = [];

            if (value instanceof Set) {
                input = Array.from(value);
            } else if (Array.isArray(value)) {
                input = value;
            }

            var clean = [];
            for (var i = 0; i < input.length; i++) {
                if (input[i] === null || typeof input[i] === 'undefined') {
                    continue;
                }
                clean.push(String(input[i]));
            }

            return new Set(clean.slice(0, 10000));
        }

        function normalizeLoadedState(parsed) {
            var scanType = parsed && parsed.scanType === 'full' ? 'full' : 'new';
            var base = ST.createInitialState(scanType);

            if (!parsed || typeof parsed !== 'object') {
                return base;
            }

            base.today = normalizeCounter(parsed.today);
            base.past7Days = normalizeCounter(parsed.past7Days);
            base.allTime = normalizeCounter(parsed.allTime);
            base.pending24h = normalizeCounter(parsed.pending24h);
            base.pending72h = normalizeCounter(parsed.pending72h);
            base.totalPending = normalizeCounter(parsed.totalPending);

            base.groupBalance = toFiniteNumber(parsed.groupBalance, 0);
            base.actualPendingRobux = toFiniteNumber(parsed.actualPendingRobux, 0);
            base.lastCursor = typeof parsed.lastCursor === 'string' ? parsed.lastCursor : '';
            base.lastResetDate = typeof parsed.lastResetDate === 'string' ? parsed.lastResetDate : base.lastResetDate;
            base.lastResetTimeZone = typeof parsed.lastResetTimeZone === 'string' ? parsed.lastResetTimeZone : base.lastResetTimeZone;
            base.lastPruneTime = Math.max(0, toFiniteNumber(parsed.lastPruneTime, 0));
            base.scanType = parsed.scanType === 'full' ? 'full' : 'new';
            base.processedIds = normalizeProcessedIds(parsed.processedIds);

            var rawMostRecentTs = parsed.mostRecentTransactionTimestamp;
            var mostRecentTs = (rawMostRecentTs === null || rawMostRecentTs === '')
                ? null
                : toFiniteNumber(rawMostRecentTs, null);
            base.mostRecentTransactionTimestamp = (mostRecentTs !== null && mostRecentTs >= 0) ? mostRecentTs : null;

            var oldestDate = parsed.oldestSaleDate ? new Date(parsed.oldestSaleDate) : null;
            base.oldestSaleDate = (oldestDate && !isNaN(oldestDate.getTime())) ? oldestDate.toISOString() : null;

            return base;
        }

        function loadSettings() {
            return tracker.settingsCache;
        }

        function initializeSettings(onUpdated) {
            return new Promise(function (resolve) {
                if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)) {
                    if (typeof onUpdated === 'function') {
                        onUpdated();
                    }
                    resolve();
                    return;
                }

                chrome.storage.local.get(['showConversion', 'currency', 'showNotifications', 'darkMode', 'timeZone'], function (result) {
                    var nextTimeZone = normalizeTimeZone(result.timeZone);
                    var previousResetTimeZone =
                        tracker.state && typeof tracker.state.lastResetTimeZone === 'string'
                            ? tracker.state.lastResetTimeZone
                            : nextTimeZone;

                    tracker.settingsCache = {
                        showConversion: result.showConversion !== false,
                        currency: result.currency || 'USD',
                        showNotifications: result.showNotifications === true,
                        darkMode: result.darkMode === true,
                        timeZone: nextTimeZone
                    };

                    // Reset "today" only when the persisted tracking timezone actually changed.
                    if (previousResetTimeZone !== nextTimeZone) {
                        tracker.state.lastResetDate = '';
                        tracker.state.lastResetTimeZone = nextTimeZone;
                    } else if (!tracker.state.lastResetTimeZone) {
                        tracker.state.lastResetTimeZone = nextTimeZone;
                    }

                    if (typeof onUpdated === 'function') {
                        onUpdated();
                    }
                    resolve();
                });
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
            var saved = null;

            try {
                saved = localStorage.getItem(getStateCacheKey());
            } catch (error) {
                console.warn('Sales Tracker: Failed to read saved state from localStorage.', error);
                return;
            }

            if (!saved) {
                return;
            }

            try {
                var parsed = JSON.parse(saved);
                tracker.state = normalizeLoadedState(parsed);
                tracker.state.isScanning = false;

                // Recalculate persisted 7-day totals after reload, but defer one tick so
                // any immediate scan can set isScanning first and avoid overlapping API work.
                setTimeout(function () {
                    prunePast7DaysCounters().catch(function (error) {
                        console.error(error);
                    });
                }, 0);
            } catch (error) {
                console.warn('Sales Tracker: Failed to parse saved state, resetting.', error);
                tracker.state = ST.createInitialState('new');
            }
        }

        function resetState(newType) {
            tracker.state = ST.createInitialState(newType || 'new');
        }

        function saveState() {
            var stateToSave = Object.assign({}, tracker.state, {
                processedIds: Array.from(tracker.state.processedIds || new Set())
            });

            try {
                localStorage.setItem(getStateCacheKey(), JSON.stringify(stateToSave));
            } catch (error) {
                console.warn('Sales Tracker: Failed to write local state cache.', error);
            }

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                var payload = {};
                payload[getStateCacheKey()] = stateToSave;
                try {
                    chrome.storage.local.set(payload);
                } catch (error) {
                    console.warn('Sales Tracker: Failed to mirror state to chrome.storage.', error);
                }
            }
        }

        function saveTransactionsForAnalytics() {
            if (tracker.collectedTransactions.length === 0) {
                return;
            }

            var groupId = trackerScopeType === 'group' ? trackerEntityId : ('user-' + trackerEntityId);
            var groupName = trackerScopeType === 'group' ? (tracker.groupName || 'Unknown Group') : (tracker.displayName || 'User Sales');
            var cacheKey = getAnalyticsCacheKey();

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

                var taggedTxs = tracker.collectedTransactions.map(function(tx) {
                    return Object.assign({}, tx, {
                        groupId: groupId,
                        groupName: groupName
                    });
                });

                var merged = taggedTxs.slice();
                var existingIds = new Set(taggedTxs.map(function (tx) {
                    return tx.id;
                }));

                for (var i = 0; i < existingTx.length; i++) {
                    var tx = existingTx[i];
                    if (tx.groupId !== groupId || !existingIds.has(tx.id)) {
                        merged.push(tx);
                    }
                }

                merged.sort(function (a, b) {
                    return new Date(b.created) - new Date(a.created);
                });

                var trimmed = merged.slice(0, 10000);

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    var payload = {};
                    payload[cacheKey] = trimmed;
                    chrome.storage.local.set(payload, function () {
                        console.log('Sales Tracker: Saved', trimmed.length, 'transactions to', cacheKey, 'for analytics');
                    });
                } else {
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(trimmed));
                        console.log('Sales Tracker: Saved', trimmed.length, 'transactions to', cacheKey, 'for analytics');
                    } catch (error) {
                        console.warn('Sales Tracker: Failed to save transactions for analytics:', error);
                    }
                }

                tracker.collectedTransactions = [];
            }

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get([cacheKey], function (result) {
                    doSave(result[cacheKey] ? JSON.stringify(result[cacheKey]) : null);
                });
            } else {
                var existing = localStorage.getItem(cacheKey);
                doSave(existing);
            }
        }

        async function fetchGroupCurrency() {
            try {
                var endpoint = trackerScopeType === 'user'
                    ? '/v1/user/currency'
                    : '/v1/groups/' + trackerEntityId + '/currency';
                var data = await deps.callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });
                if (data && typeof data.robux === 'number') {
                    tracker.state.groupBalance = data.robux;
                    tracker.state.actualPendingRobux = data.pendingRobux || 0;
                    console.log('Sales Tracker: Updated ' + trackerScopeType + ' currency:', data);
                }
            } catch (error) {
                console.warn('Sales Tracker: Failed to fetch ' + trackerScopeType + ' currency:', error);
            }
        }

        async function prunePast7DaysCounters() {
            if (tracker.state.isScanning) {
                console.log('Sales Tracker: Skipping 7-day prune during active scan.');
                return;
            }

            if (tracker.state.isPruningPast7Days) {
                console.log('Sales Tracker: Skipping 7-day prune (already running).');
                return;
            }

            // Only prune if it's been more than 15 minutes since last prune to save API calls
            var now = Date.now();
            if (tracker.state.lastPruneTime && (now - tracker.state.lastPruneTime < 15 * 60 * 1000)) {
                console.log('Sales Tracker: Skipping 7-day prune (too recent)');
                return;
            }

            tracker.state.isPruningPast7Days = true;
            try {
                console.log('Sales Tracker: Pruning past7Days counters...');
                var sevenDaysAgoTimestamp = Date.now() - (7 * 24 * 60 * 60 * 1000);

                var tempPast7Days = { count: 0, robux: 0 };
                var cursor = '';
                var pageCount = 0;
                var maxPages = 50;
                var hitOlderThan7Days = false;
                var consecutiveRateLimitHits = 0;
                var maxRateLimitHits = 5;

                try {
                    while (pageCount < maxPages) {
                        var endpoint = getTransactionsEndpoint(cursor);
                        var data = null;

                        try {
                            data = await deps.callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });
                            consecutiveRateLimitHits = 0;
                        } catch (error) {
                            if (error && error.status === 429) {
                                consecutiveRateLimitHits += 1;
                                if (consecutiveRateLimitHits >= maxRateLimitHits) {
                                    console.log('Sales Tracker: Stopping 7-day prune after repeated rate limits.');
                                    return;
                                }

                                var waitMs = Math.min(3000 * consecutiveRateLimitHits, 12000);
                                console.log('Sales Tracker: Prune rate limited, waiting ' + (waitMs / 1000) + ' seconds...');
                                await new Promise(function (resolve) {
                                    setTimeout(resolve, waitMs);
                                });
                                continue;
                            }
                            throw error;
                        }

                        if (!data || !Array.isArray(data.data)) {
                            break;
                        }

                        if (data.data.length === 0) {
                            if (!data.nextPageCursor) {
                                break;
                            }
                            cursor = data.nextPageCursor;
                            pageCount += 1;
                            await new Promise(function (resolve) {
                                setTimeout(resolve, 300);
                            });
                            continue;
                        }

                        for (var i = 0; i < data.data.length; i++) {
                            var txn = data.data[i];
                            if (!txn.currency || typeof txn.currency.amount !== 'number') {
                                continue;
                            }

                            var amount = txn.currency.amount;
                            if (amount < 0) {
                                continue;
                            }

                            var txnDate = new Date(txn.created);
                            var txnTimestamp = txnDate.getTime();
                            if (!isFinite(txnTimestamp)) {
                                continue;
                            }

                            if (txnTimestamp >= sevenDaysAgoTimestamp) {
                                tempPast7Days.count += 1;
                                tempPast7Days.robux += amount;
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
                console.log('Past7Days recalculated:', tempPast7Days.count + ' sales, R$ ' + tempPast7Days.robux.toLocaleString());
            } finally {
                tracker.state.isPruningPast7Days = false;
            }
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
