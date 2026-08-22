// Settings and Device-Wide Stats Controller
document.addEventListener('DOMContentLoaded', function() {
    initTabs();
    initSettingsForm();
    initStatsTabActions();
});

// Tab Navigation
function initTabs() {
    var tabSettingsBtn = document.getElementById('tab-btn-settings');
    var tabStatsBtn = document.getElementById('tab-btn-stats');
    var tabSettingsContent = document.getElementById('tab-content-settings');
    var tabStatsContent = document.getElementById('tab-content-stats');

    function switchTab(activeTab) {
        if (activeTab === 'stats') {
            tabSettingsBtn.classList.remove('active');
            tabStatsBtn.classList.add('active');
            tabSettingsContent.classList.remove('active');
            tabStatsContent.classList.add('active');
            loadDeviceStats();
        } else {
            tabStatsBtn.classList.remove('active');
            tabSettingsBtn.classList.add('active');
            tabStatsContent.classList.remove('active');
            tabSettingsContent.classList.add('active');
        }
    }

    if (tabSettingsBtn) {
        tabSettingsBtn.addEventListener('click', function() { switchTab('settings'); });
    }
    if (tabStatsBtn) {
        tabStatsBtn.addEventListener('click', function() { switchTab('stats'); });
    }
}

// Load and Save Settings
function initSettingsForm() {
    var showNotifEl = document.getElementById('showNotifications');
    var notifModeContainer = document.getElementById('notification-mode-container');
    var notifEachEl = document.getElementById('notif-mode-each');
    var notifEvery10El = document.getElementById('notif-mode-every10');
    var darkModeEl = document.getElementById('darkMode');
    var showConversionEl = document.getElementById('showConversion');
    var currencyEl = document.getElementById('currency');
    var timeZoneEl = document.getElementById('timeZone');
    var settingsForm = document.getElementById('settings-form');
    var statusEl = document.getElementById('status');

    function updateNotifContainerVisibility() {
        if (notifModeContainer) {
            notifModeContainer.style.display = showNotifEl.checked ? 'block' : 'none';
        }
    }

    if (showNotifEl) {
        showNotifEl.addEventListener('change', updateNotifContainerVisibility);
    }

    // Test Notification Button Handler
    var testNotifBtn = document.getElementById('test-notification-btn');
    var testNotifStatus = document.getElementById('test-notif-status');

    if (testNotifBtn) {
        testNotifBtn.addEventListener('click', function() {
            if (testNotifStatus) {
                testNotifStatus.textContent = 'Triggering test notification...';
                testNotifStatus.style.color = '#ffb800';
            }

            var sampleAsset = 'Dominus Empyreus';
            var sampleAmount = 25000;
            var isBatch = notifEvery10El && notifEvery10El.checked;

            var title = isBatch
                ? '🎯 10 New Sales! (Test Alert)'
                : '💰 New Sale: ' + sampleAsset;
            var message = isBatch
                ? 'Milestone reached: +10 sales (+R$ 15,400 earned)'
                : '+R$ ' + sampleAmount.toLocaleString() + ' • Roblox Sales Tracker';

            var fallbackIcon = chrome.runtime.getURL('images/icon128.png');

            if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
                chrome.notifications.create('', {
                    type: 'basic',
                    iconUrl: fallbackIcon,
                    title: title,
                    message: message,
                    priority: 2
                }, function(notifId) {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        if (testNotifStatus) {
                            testNotifStatus.textContent = '❌ Error: ' + chrome.runtime.lastError.message;
                            testNotifStatus.style.color = '#ff6b6b';
                        }
                    } else {
                        if (testNotifStatus) {
                            testNotifStatus.textContent = '✓ Notification dispatched! Check your desktop.';
                            testNotifStatus.style.color = '#00b06f';
                            setTimeout(function() {
                                testNotifStatus.textContent = '';
                            }, 4000);
                        }
                    }
                });
            } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    type: 'salestrack_SHOW_NOTIFICATION',
                    title: title,
                    message: message
                }, function(res) {
                    if (testNotifStatus) {
                        testNotifStatus.textContent = '✓ Notification sent to background worker!';
                        testNotifStatus.style.color = '#00b06f';
                        setTimeout(function() {
                            testNotifStatus.textContent = '';
                        }, 4000);
                    }
                });
            } else if (typeof Notification !== 'undefined') {
                Notification.requestPermission().then(function(permission) {
                    if (permission === 'granted') {
                        new Notification(title, { body: message });
                        if (testNotifStatus) {
                            testNotifStatus.textContent = '✓ Web notification shown!';
                            testNotifStatus.style.color = '#00b06f';
                        }
                    } else {
                        if (testNotifStatus) {
                            testNotifStatus.textContent = '⚠️ Notification permission denied in browser.';
                            testNotifStatus.style.color = '#ffa726';
                        }
                    }
                });
            } else {
                if (testNotifStatus) {
                    testNotifStatus.textContent = '⚠️ Notifications not supported in this environment.';
                    testNotifStatus.style.color = '#ffa726';
                }
            }
        });
    }

    // Load persisted settings
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['showNotifications', 'notificationMode', 'darkMode', 'showConversion', 'currency', 'timeZone'], function(result) {
            if (showNotifEl) showNotifEl.checked = result.showNotifications === true;
            if (result.notificationMode === 'every10') {
                if (notifEvery10El) notifEvery10El.checked = true;
            } else {
                if (notifEachEl) notifEachEl.checked = true;
            }
            if (darkModeEl) darkModeEl.checked = result.darkMode === true;
            if (showConversionEl) showConversionEl.checked = result.showConversion !== false;
            if (currencyEl) currencyEl.value = result.currency || 'USD';
            if (timeZoneEl) timeZoneEl.value = result.timeZone || 'UTC';

            updateNotifContainerVisibility();
        });
    }

    // Save settings on submit
    if (settingsForm) {
        settingsForm.addEventListener('submit', function(e) {
            e.preventDefault();

            var selectedMode = 'each';
            if (notifEvery10El && notifEvery10El.checked) {
                selectedMode = 'every10';
            }

            var settingsPayload = {
                showNotifications: showNotifEl ? showNotifEl.checked : false,
                notificationMode: selectedMode,
                darkMode: darkModeEl ? darkModeEl.checked : false,
                showConversion: showConversionEl ? showConversionEl.checked : true,
                currency: currencyEl ? currencyEl.value : 'USD',
                timeZone: timeZoneEl ? timeZoneEl.value : 'UTC'
            };

            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set(settingsPayload, function() {
                    if (statusEl) {
                        statusEl.textContent = '✓ Settings successfully saved!';
                        statusEl.style.color = '#00b06f';
                        setTimeout(function() {
                            statusEl.textContent = '';
                        }, 3000);
                    }
                });
            }
        });
    }
}

// Device Stats Initialization
function initStatsTabActions() {
    var refreshBtn = document.getElementById('refresh-stats-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            refreshBtn.textContent = 'Refreshing...';
            loadDeviceStats().then(function() {
                refreshBtn.textContent = '✓ Refreshed!';
                setTimeout(function() {
                    refreshBtn.textContent = '🔄 Refresh Stats';
                }, 1200);
            });
        });
    }

    var openAnalyticsBtn = document.getElementById('open-analytics-from-stats-btn');
    if (openAnalyticsBtn) {
        openAnalyticsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                window.open(chrome.runtime.getURL('analytics.html'), '_blank');
            } else {
                window.open('analytics.html', '_blank');
            }
        });
    }
}

// Convert Robux to Real Money string
function formatRobuxToCurrency(robux, currency) {
    if (!robux || robux < 1) return '$0.00 USD';
    var usd = (robux / 10000) * 38;
    var eur = (robux / 10000) * 32.5;

    if (currency === 'EUR') {
        return '€' + eur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
    }
    return '$' + usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
}

// Load and aggregate device statistics from storage
function loadDeviceStats() {
    return new Promise(function(resolve) {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            renderComputedStats(buildStatsFromItems({}));
            resolve();
            return;
        }

        chrome.storage.local.get(null, function(items) {
            var stats = buildStatsFromItems(items || {});
            renderComputedStats(stats);
            resolve();
        });
    });
}

// Compute statistics across all storage records
function buildStatsFromItems(items) {
    var transactionMap = new Map();
    var entityStates = [];
    var activeCurrency = items.currency || 'USD';

    // 1. Scan for transaction caches (salestrack_cache_*)
    for (var key in items) {
        if (!key) continue;

        // Transaction caches
        if (key === 'salestrack_cache' || key.startsWith('salestrack_cache_')) {
            var rawTxs = items[key];
            if (typeof rawTxs === 'string') {
                try { rawTxs = JSON.parse(rawTxs); } catch (e) { rawTxs = []; }
            }
            if (Array.isArray(rawTxs)) {
                for (var i = 0; i < rawTxs.length; i++) {
                    var tx = rawTxs[i];
                    if (!tx || !tx.id) continue;
                    var txId = String(tx.id);
                    if (!transactionMap.has(txId)) {
                        transactionMap.set(txId, tx);
                    }
                }
            }
        }

        // Tracker state caches (sales_tracker_*)
        if (key.startsWith('sales_tracker_')) {
            var rawState = items[key];
            if (typeof rawState === 'string') {
                try { rawState = JSON.parse(rawState); } catch (e) { rawState = null; }
            }
            if (rawState && typeof rawState === 'object') {
                var scopeMatch = key.match(/^sales_tracker_(group|user)_(\d+)$/i);
                var scopeType = scopeMatch ? scopeMatch[1] : (rawState.groupId ? 'group' : 'user');
                var entityId = scopeMatch ? scopeMatch[2] : (rawState.groupId || rawState.userId || 'Unknown');

                entityStates.push({
                    key: key,
                    scopeType: scopeType,
                    entityId: entityId,
                    today: rawState.today || { count: 0, robux: 0 },
                    past7Days: rawState.past7Days || { count: 0, robux: 0 },
                    allTime: rawState.allTime || { count: 0, robux: 0 },
                    pending24h: rawState.pending24h || { count: 0, robux: 0 },
                    pending72h: rawState.pending72h || { count: 0, robux: 0 },
                    totalPending: rawState.totalPending || { count: 0, robux: 0 },
                    groupBalance: rawState.groupBalance || 0,
                    actualPendingRobux: rawState.actualPendingRobux || 0
                });
            }
        }
    }

    var allTransactions = Array.from(transactionMap.values());
    var totalTxSalesCount = allTransactions.length;
    var totalTxRobux = 0;
    var largestSale = { amount: 0, name: '—' };
    var assetAggregates = new Map();

    // Aggregate transactions
    for (var t = 0; t < allTransactions.length; t++) {
        var txn = allTransactions[t];
        var amount = (txn.currency && typeof txn.currency.amount === 'number') ? txn.currency.amount : 0;
        if (amount < 0) continue;

        totalTxRobux += amount;

        var assetName = (txn.details && txn.details.name) ? txn.details.name : 'Unknown Item';
        var assetId = (txn.details && txn.details.id) ? String(txn.details.id) : assetName;

        if (amount > largestSale.amount) {
            largestSale.amount = amount;
            largestSale.name = assetName;
        }

        var existingAsset = assetAggregates.get(assetId) || { id: assetId, name: assetName, count: 0, robux: 0 };
        existingAsset.count += 1;
        existingAsset.robux += amount;
        assetAggregates.set(assetId, existingAsset);
    }

    // Aggregate entity state counters
    var stateAllTimeCount = 0;
    var stateAllTimeRobux = 0;
    var todaySalesCount = 0;
    var todayRobux = 0;
    var days7SalesCount = 0;
    var days7Robux = 0;
    var totalPendingRobux = 0;
    var totalGroupBalance = 0;
    var groupCount = 0;
    var userCount = 0;

    for (var e = 0; e < entityStates.length; e++) {
        var ent = entityStates[e];
        stateAllTimeCount += (ent.allTime && ent.allTime.count) || 0;
        stateAllTimeRobux += (ent.allTime && ent.allTime.robux) || 0;

        todaySalesCount += (ent.today && ent.today.count) || 0;
        todayRobux += (ent.today && ent.today.robux) || 0;

        days7SalesCount += (ent.past7Days && ent.past7Days.count) || 0;
        days7Robux += (ent.past7Days && ent.past7Days.robux) || 0;

        totalPendingRobux += ent.actualPendingRobux || (ent.totalPending && ent.totalPending.robux) || 0;
        totalGroupBalance += ent.groupBalance || 0;

        if (ent.scopeType === 'group') {
            groupCount++;
        } else {
            userCount++;
        }
    }

    // Reconcile total sales count and robux between transactions array and tracker state
    var totalSalesCount = Math.max(totalTxSalesCount, stateAllTimeCount);
    var totalGrossRobux = Math.max(totalTxRobux, stateAllTimeRobux);
    var avgSalePrice = totalSalesCount > 0 ? Math.round(totalGrossRobux / totalSalesCount) : 0;

    // Top 5 Assets sorted by gross Robux
    var topAssets = Array.from(assetAggregates.values());
    topAssets.sort(function(a, b) { return b.robux - a.robux; });
    var top5Assets = topAssets.slice(0, 5);

    return {
        currency: activeCurrency,
        totalSalesCount: totalSalesCount,
        totalGrossRobux: totalGrossRobux,
        todaySalesCount: todaySalesCount,
        todayRobux: todayRobux,
        days7SalesCount: days7SalesCount,
        days7Robux: days7Robux,
        totalPendingRobux: totalPendingRobux,
        totalGroupBalance: totalGroupBalance,
        avgSalePrice: avgSalePrice,
        largestSale: largestSale,
        entityStates: entityStates,
        groupCount: groupCount,
        userCount: userCount,
        top5Assets: top5Assets
    };
}

// Render computed statistics into the DOM
function renderComputedStats(stats) {
    var elTotalSales = document.getElementById('stat-total-sales');
    var elTotalRobux = document.getElementById('stat-total-robux');
    var elTotalConversion = document.getElementById('stat-total-conversion');
    var elTodayRobux = document.getElementById('stat-today-robux');
    var elTodayCount = document.getElementById('stat-today-count');
    var elDays7Robux = document.getElementById('stat-days7-robux');
    var elDays7Count = document.getElementById('stat-days7-count');
    var elTotalPending = document.getElementById('stat-total-pending');
    var elTotalBalance = document.getElementById('stat-total-balance');
    var elAvgSale = document.getElementById('stat-avg-sale');
    var elHighestSale = document.getElementById('stat-highest-sale');
    var elHighestSaleName = document.getElementById('stat-highest-sale-name');
    var elEntityCount = document.getElementById('stat-entity-count');
    var elEntitySub = document.getElementById('stat-entity-breakdown-sub');

    if (elTotalSales) elTotalSales.textContent = stats.totalSalesCount.toLocaleString();
    if (elTotalRobux) elTotalRobux.textContent = 'R$ ' + stats.totalGrossRobux.toLocaleString();
    if (elTotalConversion) elTotalConversion.textContent = '≈ ' + formatRobuxToCurrency(stats.totalGrossRobux, stats.currency);

    if (elTodayRobux) elTodayRobux.textContent = 'R$ ' + stats.todayRobux.toLocaleString();
    if (elTodayCount) elTodayCount.textContent = stats.todaySalesCount.toLocaleString() + ' sales today';

    if (elDays7Robux) elDays7Robux.textContent = 'R$ ' + stats.days7Robux.toLocaleString();
    if (elDays7Count) elDays7Count.textContent = stats.days7SalesCount.toLocaleString() + ' sales in 7 days';

    if (elTotalPending) elTotalPending.textContent = 'R$ ' + stats.totalPendingRobux.toLocaleString();
    if (elTotalBalance) elTotalBalance.textContent = 'R$ ' + stats.totalGroupBalance.toLocaleString();
    if (elAvgSale) elAvgSale.textContent = 'R$ ' + stats.avgSalePrice.toLocaleString();

    if (elHighestSale) elHighestSale.textContent = stats.largestSale.amount > 0 ? ('R$ ' + stats.largestSale.amount.toLocaleString()) : 'R$ 0';
    if (elHighestSaleName) elHighestSaleName.textContent = stats.largestSale.name || '—';

    var totalEntities = stats.groupCount + stats.userCount;
    if (elEntityCount) elEntityCount.textContent = totalEntities.toLocaleString();
    if (elEntitySub) elEntitySub.textContent = stats.groupCount + ' group' + (stats.groupCount === 1 ? '' : 's') + ', ' + stats.userCount + ' user account' + (stats.userCount === 1 ? '' : 's');

    // Render Top 5 Assets Table
    var topAssetsTbody = document.getElementById('top-assets-tbody');
    if (topAssetsTbody) {
        if (stats.top5Assets.length === 0) {
            topAssetsTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #8c9298; padding: 20px;">No asset sales data recorded yet.</td></tr>';
        } else {
            var assetsHtml = '';
            for (var a = 0; a < stats.top5Assets.length; a++) {
                var asset = stats.top5Assets[a];
                var pct = stats.totalGrossRobux > 0 ? ((asset.robux / stats.totalGrossRobux) * 100).toFixed(1) : '0.0';
                assetsHtml += '<tr>'
                    + '<td style="font-weight: bold; color: #ffb800;">#' + (a + 1) + '</td>'
                    + '<td style="font-weight: 600; color: #ffffff;">' + escapeHtml(asset.name) + '</td>'
                    + '<td style="text-align: right;">' + asset.count.toLocaleString() + '</td>'
                    + '<td style="text-align: right; font-weight: bold; color: #00b06f;">R$ ' + asset.robux.toLocaleString() + '</td>'
                    + '<td style="text-align: right; color: #8c9298;">' + pct + '%</td>'
                    + '</tr>';
            }
            topAssetsTbody.innerHTML = assetsHtml;
        }
    }

    // Render Tracked Entities Table
    var entitiesTbody = document.getElementById('entities-tbody');
    if (entitiesTbody) {
        if (stats.entityStates.length === 0) {
            entitiesTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #8c9298; padding: 20px;">No tracked groups or users found on this device.</td></tr>';
        } else {
            var entitiesHtml = '';
            for (var e = 0; e < stats.entityStates.length; e++) {
                var ent = stats.entityStates[e];
                var badgeClass = ent.scopeType === 'group' ? 'badge-group' : 'badge-user';
                var badgeText = ent.scopeType === 'group' ? 'Group' : 'User';
                var salesCount = (ent.allTime && ent.allTime.count) || 0;
                var robuxAmount = (ent.allTime && ent.allTime.robux) || 0;
                var balance = ent.groupBalance || 0;

                entitiesHtml += '<tr>'
                    + '<td><span class="badge-scope ' + badgeClass + '">' + badgeText + '</span></td>'
                    + '<td style="font-weight: 600; color: #ffffff;">' + (ent.scopeType === 'group' ? 'Group ID: ' : 'User ID: ') + escapeHtml(ent.entityId) + '</td>'
                    + '<td style="text-align: right;">' + salesCount.toLocaleString() + '</td>'
                    + '<td style="text-align: right; font-weight: bold; color: #00b06f;">R$ ' + robuxAmount.toLocaleString() + '</td>'
                    + '<td style="text-align: right; color: #64b5f6;">R$ ' + balance.toLocaleString() + '</td>'
                    + '</tr>';
            }
            entitiesTbody.innerHTML = entitiesHtml;
        }
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

