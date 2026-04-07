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

    ST.getDateKeyInTimezone = function getDateKeyInTimezone(date, timezone) {
        var dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return '';
        }

        try {
            var parts = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone || 'UTC',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(dateObj);

            var year = '';
            var month = '';
            var day = '';

            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'year') {
                    year = parts[i].value;
                } else if (parts[i].type === 'month') {
                    month = parts[i].value;
                } else if (parts[i].type === 'day') {
                    day = parts[i].value;
                }
            }

            if (year && month && day) {
                return year + '-' + month + '-' + day;
            }
        } catch (e) {
            // Fall back to UTC date key below.
        }

        return dateObj.toISOString().slice(0, 10);
    };

    ST.isSameDayInTimezone = function isSameDayInTimezone(date, timezone) {
        var nowKey = ST.getDateKeyInTimezone(new Date(), timezone);
        var dateKey = ST.getDateKeyInTimezone(date, timezone);
        return !!nowKey && nowKey === dateKey;
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
            lastResetDate: ST.getDateKeyInTimezone(new Date(), 'UTC'),
            lastResetTimeZone: 'UTC',
            oldestSaleDate: null,
            mostRecentTransactionTimestamp: null,
            pending24h: { count: 0, robux: 0 },
            pending72h: { count: 0, robux: 0 },
            totalPending: { count: 0, robux: 0 },
            scanType: scanType || 'new',
            lastPruneTime: 0,
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
