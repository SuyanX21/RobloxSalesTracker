(function() {
    window.AnalyticsCore = {
        processAnalytics,
        processAnalyticsByGroup,
    };

    function processAnalytics(transactions, timezone = 'UTC') {
        const normalized = window.AnalyticsUtils.normalizeTransactions(transactions);
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const periodAStart = now - DAY_MS;
        const periodBStart = now - (2 * DAY_MS);

        const hourlyCounts = Array(24).fill(0);
        const dailyRevenueMap = new Map();
        const assetMap = new Map();

        let totalGross = 0;

        for (const tx of normalized) {
            const amount = tx.currency.amount;
            const createdDate = new Date(tx.created);
            const createdTs = createdDate.getTime();
            if (!Number.isFinite(createdTs)) continue;

            totalGross += amount;

            const hour = window.AnalyticsUtils.getHourInTimezone(createdDate, timezone);
            hourlyCounts[hour] += 1;

            const dayKey = window.AnalyticsUtils.getISODateInTimezone(createdDate, timezone);
            dailyRevenueMap.set(dayKey, (dailyRevenueMap.get(dayKey) || 0) + amount);

            const key = tx.details.id || tx.details.name;
            let row = assetMap.get(key);
            if (!row) {
                row = {
                    assetKey: key,
                    assetName: tx.details.name || 'Unknown Asset',
                    assetId: tx.details.id || '',
                    type: tx.details.type || 'Unknown',
                    unitsSold: 0,
                    grossRobux: 0,
                    periodA: 0,
                    periodB: 0,
                };
                assetMap.set(key, row);
            }

            row.unitsSold += 1;
            row.grossRobux += amount;

            if (createdTs >= periodAStart) {
                row.periodA += amount;
            } else if (createdTs >= periodBStart) {
                row.periodB += amount;
            }
        }

        let totalUploadCosts = 0;
        const assetMatrix = Array.from(assetMap.values()).map((row) => {
            const velocityPct = window.AnalyticsUtils.calculateVelocityPct(row.periodA, row.periodB);
            const marketSharePct = totalGross > 0 ? (row.grossRobux / totalGross) * 100 : 0;

            let trend = 'Stable';
            if (velocityPct > 20) trend = 'Hot';
            if (velocityPct < -20) trend = 'Declining';

            let uploadCost = 0;
            if (row.type === 'GamePass' || row.type === 'DeveloperProduct') {
                uploadCost = 0;
            } else {

                // Updated Roblox upload fees: 1300 for UGCs, 1800 for Hat UGCs
                if (row.type === 'GamePass' || row.type === 'DeveloperProduct') {
                    uploadCost = 0;
                } else {
                    uploadCost = 1300; // UGC default
                    if (row.type === 'Hat' || row.type.includes('Hat UGC')) {
                        uploadCost = 1800;
                    }
                }

            }

            totalUploadCosts += uploadCost;

            return {
                assetKey: row.assetKey,
                assetName: row.assetName,
                assetId: row.assetId,
                unitsSold: row.unitsSold,
                grossRobux: row.grossRobux,
                uploadCost: uploadCost, 
                netRobux: row.grossRobux - uploadCost, 
                velocityPct,
                marketSharePct,
                trend,
                isWhale: false,
            };
        });

        const ranked = [...assetMatrix].sort((a, b) => b.grossRobux - a.grossRobux);
        const topCount = Math.max(1, Math.ceil(ranked.length * 0.2));
        let cumulativeGross = 0;
        
        for (let i = 0; i < ranked.length; i += 1) {
            cumulativeGross += ranked[i].grossRobux;
            const cumulativeShare = totalGross > 0 ? (cumulativeGross / totalGross) * 100 : 0;
            ranked[i].isWhale = i < topCount || cumulativeShare <= 80;
        }

        const whaleRevenue = ranked
            .filter((item) => item.isWhale)
            .reduce((sum, item) => sum + item.grossRobux, 0);
        const whaleSharePct = totalGross > 0 ? (whaleRevenue / totalGross) * 100 : 0;

        const totalNet = totalGross - totalUploadCosts;

        const series = [];
        const today = new Date();
        
        for (let offset = 29; offset >= 0; offset -= 1) {
            const dayDate = new Date(today.getTime() - (offset * DAY_MS));
            const key = window.AnalyticsUtils.getISODateInTimezone(dayDate, timezone);
            series.push({
                day: key,
                grossRobux: Math.round(dailyRevenueMap.get(key) || 0),
            });
        }

        const maxHourValue = Math.max(...hourlyCounts, 0);
        const goldenHour = maxHourValue > 0 ? hourlyCounts.indexOf(maxHourValue) : null;

        return {
            transactionCount: normalized.length,
            totalGross,
            totalNet, 
            totalUploadCosts, 
            whaleRevenue,
            whaleSharePct,
            hourlyCounts,
            goldenHour,
            series,
            assetMatrix: ranked,
            groupId: null, // Filled by caller
        };
    }

    function processAnalyticsByGroup(transactionsByGroup, timezone = 'UTC') {
        const analyticsByGroup = {};
        for (var groupId in transactionsByGroup) {
            const transactions = Array.isArray(transactionsByGroup[groupId]) ? transactionsByGroup[groupId] : [];
            const analytics = processAnalytics(transactions, timezone);
            const parsedScope = window.AnalyticsUtils.parseScopeKey(groupId);
            const firstTransaction = transactions[0] || {};
            const rawGroupName = typeof firstTransaction.groupName === 'string' ? firstTransaction.groupName : '';
            analytics.groupId = groupId;
            analytics.scopeType = parsedScope.scopeType;
            analytics.scopeEntityId = parsedScope.entityId;
            analytics.groupName = rawGroupName;
            analytics.groupLabel = window.AnalyticsUtils.formatScopeLabel(groupId, rawGroupName);
            analyticsByGroup[groupId] = analytics;
        }
        return analyticsByGroup;
    }

})();

