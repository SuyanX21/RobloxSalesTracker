(function initSalesTrackerScannerModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    ST.createScanTransactions = function createScanTransactions(tracker, deps) {
        return async function scanTransactions(requestedFullScan) {
            var state = tracker.state;
            var today = new Date().toDateString();

            if (state.lastResetDate !== today) {
                state.today = { count: 0, robux: 0 };
                state.lastResetDate = today;
                deps.saveState();
            }

            if (state.isScanning) {
                return;
            }

            var settings = deps.loadSettings();
            var newlyProcessedIds = [];

            // Explicit button requests should override current scan type.
            var requestedNewScan = (requestedFullScan === false || requestedFullScan === 'new');
            var requestedFullMode = (requestedFullScan === true || requestedFullScan === 'full');
            var isFullScan = requestedFullMode || (!requestedNewScan && state.scanType === 'full');

            if (requestedFullMode) {
                // Full scan starts from a clean state.
                deps.resetState('full');
                state = tracker.state;
                isFullScan = true;
                deps.saveState();
            } else if (requestedNewScan || !isFullScan) {
                // For regular/new scans, ensure we start from the newest page.
                state.scanType = 'new';
                state.lastCursor = '';
            }

            state.isScanning = true;
            deps.updateDashboard();

            // Fetch actual currency balance and pending Robux from Roblox API
            if (typeof deps.fetchGroupCurrency === 'function') {
                await deps.fetchGroupCurrency();
            }

            try {
                var hasNextPage = true;
                var sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
                var scanStartMostRecentTimestamp = state.mostRecentTransactionTimestamp;
                var maxTransactionTimestampSeen = scanStartMostRecentTimestamp;
                var oldestDate = state.oldestSaleDate ? new Date(state.oldestSaleDate) : null;

                while (hasNextPage) {
                    try {
                        var cursor = state.lastCursor ? '&cursor=' + state.lastCursor : '';
                        var endpoint = '/v2/groups/' + tracker.groupId + '/transactions?limit=100&transactionType=Sale' + cursor;

                        console.log('Sales Tracker: Fetching (' + state.scanType + '):', endpoint);
                        var data = await deps.callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });

                        // Handle API ghost cursors (empty arrays with additional cursor pages).
                        if (!data || !data.data) {
                            console.log('Sales Tracker: Invalid data from API');
                            state.lastCursor = '';
                            hasNextPage = false;
                            break;
                        }

                        if (data.data.length === 0) {
                            if (data.nextPageCursor) {
                                console.log('Sales Tracker: Empty page but cursor exists, continuing...');
                                state.lastCursor = data.nextPageCursor;
                                continue;
                            }

                            console.log('Sales Tracker: No more transactions (End of history)');
                            state.lastCursor = '';
                            hasNextPage = false;
                            break;
                        }

                        var processedCountInThisPage = 0;
                        var shouldStopScan = false;
                        var hitsOnThisPage = 0;
                        var now = new Date();

                        for (var i = 0; i < data.data.length; i++) {
                            var transaction = data.data[i];
                            if (!transaction.currency || typeof transaction.currency.amount !== 'number') {
                                continue;
                            }

                            // Use a robust unique ID (Roblox ID or fallback to timestamp + amount + asset ID).
                            var txId = transaction.id
                                ? String(transaction.id)
                                : 'fb_' + transaction.created + '_' + transaction.currency.amount + '_' + (transaction.details ? transaction.details.id : '');

                            // Check if this transaction was already processed in this session or previous ones.
                            var isAlreadyProcessed =
                                (state.processedIds && state.processedIds.has(txId)) ||
                                newlyProcessedIds.indexOf(txId) !== -1;

                            // In scan-new mode, mark scan stop but finish processing this page first.
                            if (!isFullScan && isAlreadyProcessed) {
                                shouldStopScan = true;
                                hitsOnThisPage++;
                                continue;
                            }

                            // Never count the same ID twice.
                            if (isAlreadyProcessed) {
                                continue;
                            }

                            var amount = transaction.currency.amount;
                            if (amount <= 0 && isFullScan) {
                                continue;
                            }

                            var transactionDate = new Date(transaction.created);
                            var transactionTimestamp = transactionDate.getTime();

                            if (maxTransactionTimestampSeen === null || transactionTimestamp > maxTransactionTimestampSeen) {
                                maxTransactionTimestampSeen = transactionTimestamp;
                            }

                            if (!oldestDate || transactionDate < oldestDate) {
                                oldestDate = transactionDate;
                            }

                            state.allTime.count++;
                            state.allTime.robux += amount;

                            if (transactionDate >= sevenDaysAgo) {
                                state.past7Days.count++;
                                state.past7Days.robux += amount;
                            }

                            if (deps.isSameDayInTimezone(transactionDate, settings.timeZone)) {
                                state.today.count++;
                                state.today.robux += amount;
                            }

                            var releaseDate = new Date(transactionDate);
                            releaseDate.setDate(releaseDate.getDate() + 30);
                            var timeUntilRelease = releaseDate - now;
                            var hoursUntilRelease = timeUntilRelease / (1000 * 60 * 60);

                            if (timeUntilRelease > 0) {
                                state.totalPending.count++;
                                state.totalPending.robux += amount;

                                if (hoursUntilRelease <= 24) {
                                    state.pending24h.count++;
                                    state.pending24h.robux += amount;
                                }

                                if (hoursUntilRelease <= 72) {
                                    state.pending72h.count++;
                                    state.pending72h.robux += amount;
                                }
                            }

                            tracker.collectedTransactions.push({
                                id: txId,
                                created: transaction.created,
                                currency: { amount: amount },
                                details: {
                                    id: transaction.details && transaction.details.id ? String(transaction.details.id) : '',
                                    name: transaction.details && transaction.details.name ? transaction.details.name : 'Unknown Asset',
                                    type: transaction.details && transaction.details.type ? transaction.details.type : 'Unknown'
                                }
                            });

                            newlyProcessedIds.push(txId);
                            processedCountInThisPage++;
                        }

                        if (shouldStopScan) {
                            console.log('Sales Tracker: Hit ' + hitsOnThisPage + ' already-processed IDs on this page. Stopping scan after finishing this page.');
                            hasNextPage = false;
                            state.lastCursor = '';
                        } else if (data.nextPageCursor) {
                            state.lastCursor = data.nextPageCursor;
                            await new Promise(function (resolve) {
                                setTimeout(resolve, 500);
                            });
                        } else {
                            state.lastCursor = '';
                            hasNextPage = false;
                        }

                        console.log('Sales Tracker: Processed ' + processedCountInThisPage + ' NEW transactions on this page');

                        if (oldestDate) {
                            state.oldestSaleDate = oldestDate.toISOString();
                        }
                        if (maxTransactionTimestampSeen !== null) {
                            state.mostRecentTransactionTimestamp = maxTransactionTimestampSeen;
                        }

                        deps.updateDashboard();
                        deps.saveState();
                    } catch (error) {
                        if (error.status === 429) {
                            console.log('Sales Tracker: Rate limited, waiting 10 seconds...');
                            await new Promise(function (resolve) {
                                setTimeout(resolve, 10000);
                            });
                            continue;
                        }

                        console.error('Sales Tracker Error:', error);
                        hasNextPage = false;
                    }
                }

                deps.saveTransactionsForAnalytics();

                // Ensure it only switches back to "new" when full scan is actually done.
                if (state.scanType === 'full' && !state.lastCursor) {
                    console.log('Sales Tracker: Full scan completely finished. Reverting to Scan New.');
                    state.scanType = 'new';
                }
            } finally {
                // Update the master list of processed IDs, keeping newest first.
                if (newlyProcessedIds.length > 0) {
                    var combinedIds = newlyProcessedIds.concat(Array.from(state.processedIds || new Set()));
                    state.processedIds = new Set(combinedIds.slice(0, 10000));
                }

                state.isScanning = false;

                // Only run heavy 7-day pruning when necessary to avoid rate limiting.
                if (newlyProcessedIds.length > 0 || (isFullScan && !state.lastCursor)) {
                    await deps.prunePast7DaysCounters();
                }

                deps.updateDashboard();
                deps.saveState();
            }
        };
    };
})();
