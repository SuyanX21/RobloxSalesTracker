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

    ST.getElapsedDayFraction = function getElapsedDayFraction(date, timezone) {
        var dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            dateObj = new Date();
        }

        try {
            var options = {
                timeZone: timezone || 'UTC',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            };
            var parts = new Intl.DateTimeFormat('en-US', options).formatToParts(dateObj);
            var hour = 0;
            var minute = 0;
            var second = 0;

            for (var i = 0; i < parts.length; i++) {
                if (parts[i].type === 'hour') {
                    hour = parseInt(parts[i].value, 10) % 24;
                } else if (parts[i].type === 'minute') {
                    minute = parseInt(parts[i].value, 10);
                } else if (parts[i].type === 'second') {
                    second = parseInt(parts[i].value, 10);
                }
            }

            var totalSeconds = (hour * 3600) + (minute * 60) + second;
            return Math.min(Math.max(totalSeconds / 86400, 0), 1);
        } catch (e) {
            var utcSeconds = (dateObj.getUTCHours() * 3600) + (dateObj.getUTCMinutes() * 60) + dateObj.getUTCSeconds();
            return Math.min(Math.max(utcSeconds / 86400, 0), 1);
        }
    };

    ST.getDayOfWeekInTimezone = function getDayOfWeekInTimezone(date, timezone) {
        var dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return 0;
        }

        try {
            var dateKey = ST.getDateKeyInTimezone(dateObj, timezone);
            if (dateKey) {
                var parts = dateKey.split('-');
                if (parts.length === 3) {
                    var year = parseInt(parts[0], 10);
                    var month = parseInt(parts[1], 10) - 1;
                    var day = parseInt(parts[2], 10);
                    var utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
                    return utcDate.getUTCDay();
                }
            }
        } catch (e) {}

        return dateObj.getUTCDay();
    };

    ST.getHourInTimezone = function getHourInTimezone(date, timezone) {
        var dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) {
            return 0;
        }

        try {
            var options = { timeZone: timezone || 'UTC', hour12: false, hour: '2-digit' };
            var hourStr = new Intl.DateTimeFormat('en-US', options).format(dateObj);
            return parseInt(hourStr, 10) % 24;
        } catch (e) {
            return dateObj.getUTCHours();
        }
    };

    ST.computeHistoricalPatterns = function computeHistoricalPatterns(transactions, timezone, targetDate) {
        var txList = Array.isArray(transactions) ? transactions : [];
        var refDate = targetDate instanceof Date ? targetDate : new Date(targetDate || Date.now());
        var todayKey = ST.getDateKeyInTimezone(refDate, timezone);
        var targetDow = ST.getDayOfWeekInTimezone(refDate, timezone);

        var dailyTotals = {};
        var weekdayBuckets = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
        var hourlyRevenue = new Array(24).fill(0);
        var totalHistoricalRevenue = 0;

        for (var i = 0; i < txList.length; i++) {
            var tx = txList[i];
            if (!tx || !tx.currency || typeof tx.currency.amount !== 'number') {
                continue;
            }
            var amount = tx.currency.amount;
            if (amount < 0) {
                continue;
            }

            var createdDate = new Date(tx.created);
            if (isNaN(createdDate.getTime())) {
                continue;
            }

            var dayKey = ST.getDateKeyInTimezone(createdDate, timezone);
            if (!dayKey) {
                continue;
            }

            if (dayKey !== todayKey) {
                if (!dailyTotals[dayKey]) {
                    dailyTotals[dayKey] = 0;
                }
                dailyTotals[dayKey] += amount;
            }

            var h = ST.getHourInTimezone(createdDate, timezone);
            hourlyRevenue[h] += amount;
            totalHistoricalRevenue += amount;
        }

        var allDailySums = [];
        for (var dKey in dailyTotals) {
            var dAmount = dailyTotals[dKey];
            allDailySums.push(dAmount);
            var dDateParts = dKey.split('-');
            if (dDateParts.length === 3) {
                var dYear = parseInt(dDateParts[0], 10);
                var dMonth = parseInt(dDateParts[1], 10) - 1;
                var dDay = parseInt(dDateParts[2], 10);
                var dDow = new Date(Date.UTC(dYear, dMonth, dDay, 12, 0, 0)).getUTCDay();
                if (weekdayBuckets[dDow]) {
                    weekdayBuckets[dDow].push(dAmount);
                }
            }
        }

        var targetWeekdaySums = weekdayBuckets[targetDow] || [];
        var weekdayAverage = 0;
        if (targetWeekdaySums.length > 0) {
            var sum = 0;
            for (var w = 0; w < targetWeekdaySums.length; w++) {
                sum += targetWeekdaySums[w];
            }
            weekdayAverage = sum / targetWeekdaySums.length;
        } else if (allDailySums.length > 0) {
            var allSum = 0;
            for (var a = 0; a < allDailySums.length; a++) {
                allSum += allDailySums[a];
            }
            weekdayAverage = allSum / allDailySums.length;
        }

        var hourlyPdf = new Array(24).fill(1 / 24);
        var hourlyCdf = new Array(24).fill(0);

        if (totalHistoricalRevenue > 0) {
            for (var hr = 0; hr < 24; hr++) {
                hourlyPdf[hr] = hourlyRevenue[hr] / totalHistoricalRevenue;
            }
        }

        var runningCdf = 0;
        for (var c = 0; c < 24; c++) {
            runningCdf += hourlyPdf[c];
            hourlyCdf[c] = Math.min(Math.max(runningCdf, 0), 1);
        }
        hourlyCdf[23] = 1.0;

        return {
            weekdayAverage: weekdayAverage,
            hasHistoricalData: allDailySums.length > 0 || totalHistoricalRevenue > 0,
            hourlyPdf: hourlyPdf,
            hourlyCdf: hourlyCdf,
            historicalDayCount: allDailySums.length
        };
    };

    ST.calculateProjectedEodRevenue = function calculateProjectedEodRevenue(tracker, settings) {
        if (!tracker || !tracker.state) {
            return 0;
        }

        var state = tracker.state;
        var todayRobux = Math.max(0, (state.today && typeof state.today.robux === 'number') ? state.today.robux : 0);
        var timeZone = (settings && settings.timeZone) || 'UTC';
        var now = new Date();

        var elapsedFraction = ST.getElapsedDayFraction(now, timeZone);
        elapsedFraction = Math.min(Math.max(elapsedFraction, 0), 1);

        var transactions = [];
        if (Array.isArray(tracker.cachedTransactions) && tracker.cachedTransactions.length > 0) {
            transactions = tracker.cachedTransactions;
        } else if (Array.isArray(tracker.collectedTransactions) && tracker.collectedTransactions.length > 0) {
            transactions = tracker.collectedTransactions;
        }

        var patterns = ST.computeHistoricalPatterns(transactions, timeZone, now);
        var weekdayAverage = patterns.weekdayAverage;

        if (!patterns.hasHistoricalData || weekdayAverage <= 0) {
            if (state.past7Days && state.past7Days.robux > 0) {
                weekdayAverage = state.past7Days.robux / 7;
            } else if (state.allTime && state.allTime.robux > 0 && state.oldestSaleDate) {
                var oldestTs = new Date(state.oldestSaleDate).getTime();
                var spanDays = Math.max(1, (Date.now() - oldestTs) / (24 * 60 * 60 * 1000));
                weekdayAverage = state.allTime.robux / spanDays;
            } else {
                weekdayAverage = todayRobux;
            }
        }

        var exactHour = elapsedFraction * 24;
        var currHour = Math.min(Math.floor(exactHour), 23);
        var minuteFraction = exactHour - currHour;
        var prevCdf = currHour > 0 ? patterns.hourlyCdf[currHour - 1] : 0;
        var currHourPdf = patterns.hourlyPdf[currHour];
        var cdfNow = Math.min(Math.max(prevCdf + (minuteFraction * currHourPdf), 0), 1);

        var effectiveProgress = patterns.hasHistoricalData
            ? (0.3 * elapsedFraction + 0.7 * cdfNow)
            : elapsedFraction;
        effectiveProgress = Math.min(Math.max(effectiveProgress, 0.001), 1);

        var runRateEod = todayRobux / effectiveProgress;
        var remainingHistoricalFraction = Math.max(0, 1 - cdfNow);
        var historicalRemainingEod = todayRobux + (weekdayAverage * remainingHistoricalFraction);

        var runRateWeight = elapsedFraction;
        var projectedRevenue = (runRateWeight * runRateEod) + ((1 - runRateWeight) * historicalRemainingEod);

        if (todayRobux === 0) {
            projectedRevenue = (1 - elapsedFraction) * weekdayAverage * remainingHistoricalFraction;
        }

        if (!isFinite(projectedRevenue) || isNaN(projectedRevenue)) {
            projectedRevenue = todayRobux;
        }

        return Math.max(todayRobux, Math.round(projectedRevenue));
    };

    ST.calculateProjectedEodAccuracy = function calculateProjectedEodAccuracy(tracker, settings) {
        if (!tracker || !tracker.state) {
            return {
                status: 'calibrating',
                text: '⚡ Calibrating prediction...',
                color: '#888888',
                pace: 'calibrating',
                diffPercent: 0,
                accuracyPercent: 0
            };
        }

        var state = tracker.state;
        var todayRobux = Math.max(0, (state.today && typeof state.today.robux === 'number') ? state.today.robux : 0);
        var timeZone = (settings && settings.timeZone) || 'UTC';
        var now = new Date();

        var elapsedFraction = ST.getElapsedDayFraction(now, timeZone);
        elapsedFraction = Math.min(Math.max(elapsedFraction, 0), 1);

        var transactions = [];
        if (Array.isArray(tracker.cachedTransactions) && tracker.cachedTransactions.length > 0) {
            transactions = tracker.cachedTransactions;
        } else if (Array.isArray(tracker.collectedTransactions) && tracker.collectedTransactions.length > 0) {
            transactions = tracker.collectedTransactions;
        }

        var patterns = ST.computeHistoricalPatterns(transactions, timeZone, now);
        var weekdayAverage = patterns.weekdayAverage;

        if (!patterns.hasHistoricalData || weekdayAverage <= 0) {
            if (state.past7Days && state.past7Days.robux > 0) {
                weekdayAverage = state.past7Days.robux / 7;
            } else if (state.allTime && state.allTime.robux > 0 && state.oldestSaleDate) {
                var oldestTs = new Date(state.oldestSaleDate).getTime();
                var spanDays = Math.max(1, (Date.now() - oldestTs) / (24 * 60 * 60 * 1000));
                weekdayAverage = state.allTime.robux / spanDays;
            } else {
                weekdayAverage = todayRobux;
            }
        }

        var exactHour = elapsedFraction * 24;
        var currHour = Math.min(Math.floor(exactHour), 23);
        var minuteFraction = exactHour - currHour;
        var prevCdf = currHour > 0 ? patterns.hourlyCdf[currHour - 1] : 0;
        var currHourPdf = patterns.hourlyPdf[currHour];
        var cdfNow = Math.min(Math.max(prevCdf + (minuteFraction * currHourPdf), 0), 1);

        var expectedProgressFraction = patterns.hasHistoricalData ? cdfNow : elapsedFraction;
        var expectedRobuxByNow = Math.round(weekdayAverage * expectedProgressFraction);

        var historicalDays = patterns.historicalDayCount || (patterns.hasHistoricalData ? 1 : 0);

        // Compute model confidence/accuracy based on historical data depth
        var baseAccuracy = 75;
        if (historicalDays >= 14) {
            baseAccuracy = 94;
        } else if (historicalDays >= 7) {
            baseAccuracy = 90;
        } else if (historicalDays >= 3) {
            baseAccuracy = 84;
        } else if (historicalDays >= 1) {
            baseAccuracy = 78;
        }

        if (!patterns.hasHistoricalData && historicalDays === 0 && (!state.past7Days || state.past7Days.robux === 0)) {
            return {
                status: 'calibrating',
                text: '⚡ Calibrating (0d)',
                color: '#888888',
                pace: 'calibrating',
                diffPercent: 0,
                accuracyPercent: 0
            };
        }

        var accBadge = '🎯 ' + baseAccuracy + '%' + (historicalDays > 0 ? ' (' + historicalDays + 'd)' : '');

        // Check difference between actual today Robux and expected Robux by this time
        if (expectedRobuxByNow <= 0 && todayRobux <= 0) {
            return {
                status: 'on_track',
                text: '✓ On pace · ' + accBadge,
                color: '#00b06f',
                pace: 'on_track',
                diffPercent: 0,
                accuracyPercent: baseAccuracy
            };
        }

        var diff = todayRobux - expectedRobuxByNow;
        var diffPercent = expectedRobuxByNow > 0 ? Math.round((diff / expectedRobuxByNow) * 100) : (todayRobux > 0 ? 100 : 0);

        if (Math.abs(diffPercent) <= 5 || Math.abs(diff) <= 25) {
            return {
                status: 'on_track',
                text: '✓ On pace (±' + Math.abs(diffPercent) + '%) · ' + accBadge,
                color: '#00b06f',
                pace: 'on_track',
                diffPercent: diffPercent,
                accuracyPercent: baseAccuracy
            };
        } else if (diffPercent > 5) {
            var plusStr = '+' + diffPercent + '%';
            return {
                status: 'ahead',
                text: '▲ ' + plusStr + ' pace · ' + accBadge,
                color: '#00c87f',
                pace: 'ahead',
                diffPercent: diffPercent,
                accuracyPercent: baseAccuracy
            };
        } else {
            return {
                status: 'behind',
                text: '▼ ' + diffPercent + '% pace · ' + accBadge,
                color: '#ffa726',
                pace: 'behind',
                diffPercent: diffPercent,
                accuracyPercent: baseAccuracy
            };
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
            lastResetDate: ST.getDateKeyInTimezone(new Date(), 'UTC'),
            lastResetTimeZone: 'UTC',
            oldestSaleDate: null,
            mostRecentTransactionTimestamp: null,
            pending24h: { count: 0, robux: 0 },
            pending72h: { count: 0, robux: 0 },
            totalPending: { count: 0, robux: 0 },
            scanType: scanType || 'new',
            lastPruneTime: 0,
            unnotifiedSalesCount: 0,
            unnotifiedSalesRobux: 0,
            processedIds: new Set()
        };
    };

    ST.createDefaultSettings = function createDefaultSettings() {
        return {
            showConversion: true,
            currency: 'USD',
            showNotifications: false,
            notificationMode: 'each',
            darkMode: false,
            timeZone: 'UTC'
        };
    };
})();
