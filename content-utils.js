(function initSalesTrackerUtilsModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

ST.getGroupIdFromUrl = function getGroupIdFromUrl() {
        var match = window.location.href.match(/[?&]id=(\d+)/);
        if (!match) {
            match = window.location.href.match(/groups\/(\d+)/);
        }
        if (!match) {
            match = window.location.href.match(/[?&]groupId=(\d+)/);
        }
        if (match && match[1]) {
            console.log('Sales Tracker: Group ID from URL:', match[1]);
        }
        return match ? match[1] : null;
    };

ST.getPageContext = function getPageContext() {
        var path = window.location.pathname;
        if (path === '/transactions' || path.indexOf('/transactions') === 0) {
            return 'transactions';
        }
        if (path.indexOf('/communities/') !== -1 || path.indexOf('/groups/') !== -1) {
            return 'groups';
        }
        return 'unknown';
    };

    ST.getUserIdFromPage = function getUserIdFromPage() {
        var match = window.location.href.match(/[?&]userId=(\d+)/);
        if (match) {
            return match[1];
        }
        var profileLink = document.querySelector('a[href*="/users/"], [data-user-id]');
        if (profileLink) {
            var href = profileLink.href || profileLink.getAttribute('href');
            var userMatch = href && href.match(/\/users\/(\d+)/);
            if (userMatch) {
                return userMatch[1];
            }
            var dataUserId = profileLink.getAttribute('data-user-id');
            if (dataUserId) {
                return dataUserId;
            }
        }
        var userIdElement = document.querySelector('[data-user-id], [data-userid]');
        if (userIdElement) {
            return userIdElement.getAttribute('data-user-id') || userIdElement.getAttribute('data-userid');
        }
        return null;
    };

    ST.getTransactionPageUserId = function getTransactionPageUserId() {
        var userId = ST.getUserIdFromPage();
        if (userId) {
            return userId;
        }

        if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
            try {
                var resources = performance.getEntriesByType('resource');
                for (var i = resources.length - 1; i >= 0; i--) {
                    var resource = resources[i];
                    var resourceName = resource && resource.name ? resource.name : '';
                    var userTransactionsMatch = resourceName.match(/\/v2\/users\/(\d+)\/transactions/i);
                    if (userTransactionsMatch && userTransactionsMatch[1]) {
                        return userTransactionsMatch[1];
                    }
                }
            } catch (e) {
                // Ignore performance API access issues and continue returning null.
            }
        }

        return null;
    };

    ST.getTransactionPageGroupFilter = function getTransactionPageGroupFilter() {
        var groupSelect = document.querySelector('select[name="groupId"], select[id*="group"], select[class*="group"]');
        if (groupSelect && groupSelect.value) {
            return groupSelect.value;
        }
        try {
            var params = new URLSearchParams(window.location.search);
            var paramGroupId = params.get('groupId') || params.get('groupid') || params.get('groupID');
            if (paramGroupId && /^\d+$/.test(paramGroupId)) {
                return paramGroupId;
            }
        } catch (e) {
            // Ignore URL parsing failures and continue fallback checks.
        }
        var match = window.location.href.match(/[?&]groupId=(\d+)/i);
        if (match && match[1]) {
            return match[1];
        }

        var groupDataElement = document.querySelector('[data-group-id], [data-groupid], [data-group-id-value]');
        if (groupDataElement) {
            var dataGroupId =
                groupDataElement.getAttribute('data-group-id')
                || groupDataElement.getAttribute('data-groupid')
                || groupDataElement.getAttribute('data-group-id-value');
            if (dataGroupId && /^\d+$/.test(dataGroupId)) {
                return dataGroupId;
            }
        }

        var groupLink = document.querySelector('a[href*="/groups/"]');
        if (groupLink && groupLink.href) {
            var groupLinkMatch = groupLink.href.match(/\/groups\/(\d+)/);
            if (groupLinkMatch && groupLinkMatch[1]) {
                return groupLinkMatch[1];
            }
        }

        // Roblox's newer transactions UI is React-based and may not expose a native <select>.
        // If a group transactions request was made already, recover the group id from resource URLs.
        if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
            try {
                var resources = performance.getEntriesByType('resource');
                for (var i = resources.length - 1; i >= 0; i--) {
                    var resource = resources[i];
                    var resourceName = resource && resource.name ? resource.name : '';
                    var resourceMatch = resourceName.match(/\/v2\/groups\/(\d+)\/transactions/i);
                    if (resourceMatch && resourceMatch[1]) {
                        return resourceMatch[1];
                    }
                }
            } catch (e2) {
                // Ignore performance API access issues and continue returning null.
            }
        }

        return null;
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
