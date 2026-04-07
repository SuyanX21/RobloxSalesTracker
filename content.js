(function initSalesTrackerBootstrap() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    function initSalesTracker() {
        if (
            !ST.getGroupIdFromUrl ||
            !ST.createInitialState ||
            !ST.createDefaultSettings ||
            !ST.createStorageController ||
            !ST.createDashboard ||
            !ST.updateDashboard ||
            !ST.createScanTransactions ||
            !ST.callRobloxApiJson ||
            !ST.isSameDayInTimezone ||
            !ST.getDateKeyInTimezone ||
            !ST.robuxToCurrency
        ) {
            console.error('Sales Tracker: Missing required modules.');
            return;
        }

        var groupId = ST.getGroupIdFromUrl();
        if (!groupId) {
            return;
        }

        var tracker = {
            groupId: groupId,
            state: ST.createInitialState('new'),
            collectedTransactions: [],
            settingsCache: ST.createDefaultSettings()
        };

        var storage = ST.createStorageController(tracker, {
            callRobloxApiJson: ST.callRobloxApiJson
        });

        var updateDashboard = function updateDashboard() {
            ST.updateDashboard(tracker, {
                loadSettings: storage.loadSettings,
                robuxToCurrency: ST.robuxToCurrency
            });
        };

        var scanTransactions = ST.createScanTransactions(tracker, {
            callRobloxApiJson: ST.callRobloxApiJson,
            loadSettings: storage.loadSettings,
            saveState: storage.saveState,
            saveTransactionsForAnalytics: storage.saveTransactionsForAnalytics,
            updateDashboard: updateDashboard,
            resetState: storage.resetState,
            prunePast7DaysCounters: storage.prunePast7DaysCounters,
            fetchGroupCurrency: storage.fetchGroupCurrency,
            isSameDayInTimezone: ST.isSameDayInTimezone,
            getDateKeyInTimezone: ST.getDateKeyInTimezone
        });

        var createDashboard = function createDashboard() {
            return ST.createDashboard(tracker, {
                loadSettings: storage.loadSettings,
                sanitizeHtml: ST.DOMPurify && ST.DOMPurify.sanitize,
                resetState: storage.resetState,
                saveState: storage.saveState,
                updateDashboard: updateDashboard,
                onScanNew: function onScanNew() {
                    scanTransactions(false);
                },
                onScanFull: function onScanFull() {
                    scanTransactions(true);
                }
            });
        };

        storage.loadState();
        storage.initializeSettings(updateDashboard);
        storage.installSettingsListener(updateDashboard);

        console.log('Sales Tracker initialized for group:', groupId);

        if (!document.getElementById('sales-dashboard')) {
            var dashboard = createDashboard();
            document.body.appendChild(dashboard);
            updateDashboard();
        } else {
            updateDashboard();
        }

        scanTransactions();
        setInterval(scanTransactions, 60000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSalesTracker);
    } else {
        initSalesTracker();
    }
})();
