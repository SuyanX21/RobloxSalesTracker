(function initSalesTrackerUtilsModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    ST.getGroupIdFromUrl = function getGroupIdFromUrl() {
        var match = window.location.href.match(/[?&]id=(\d+)/);
        if (!match) {
            match = window.location.href.match(/groups\/(\d+)/);
        }
        console.log('Sales Tracker: Group ID from URL:', match ? match[1] : null);
        return match ? match[1] : null;
    };

    ST.isSameDayInTimezone = function isSameDayInTimezone(date, timezone) {
        try {
            var options = { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric' };
            var nowStr = new Date().toLocaleDateString('en-US', options);
            var dateStr = date.toLocaleDateString('en-US', options);
            return nowStr === dateStr;
        } catch (e) {
            return date.toDateString() === new Date().toDateString();
        }
    };

    ST.robuxToCurrency = function robuxToCurrency(robux, currency) {
        if (!robux || robux < 1) {
            return '';
        }

        var usd = (robux / 10000) * 38;
        var eur = (robux / 10000) * 32.5;

        if (currency === 'USD') {
            return '$' + usd.toFixed(2) + ' USD';
        }
        if (currency === 'EUR') {
            return 'EUR ' + eur.toFixed(2);
        }
        return '$' + usd.toFixed(2) + ' USD';
    };

    ST.createInitialState = function createInitialState(scanType) {
        return {
            today: { count: 0, robux: 0 },
            past7Days: { count: 0, robux: 0 },
            allTime: { count: 0, robux: 0 },
            groupBalance: 0,
            actualPendingRobux: 0,
            lastCursor: '',
            isScanning: false,
            lastResetDate: new Date().toDateString(),
            oldestSaleDate: null,
            mostRecentTransactionTimestamp: null,
            pending24h: { count: 0, robux: 0 },
            pending72h: { count: 0, robux: 0 },
            totalPending: { count: 0, robux: 0 },
            scanType: scanType || 'new',
            processedIds: new Set()
        };
    };

    ST.createDefaultSettings = function createDefaultSettings() {
        return {
            showConversion: true,
            currency: 'USD',
            showNotifications: false,
            darkMode: false,
            timeZone: 'UTC'
        };
    };
})();
