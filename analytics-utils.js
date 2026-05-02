(function() {
    const DAY_MS = 24 * 60 * 60 * 1000;

    window.AnalyticsUtils = {
        normalizeTimeZone,
        getISODateInTimezone,
        getHourInTimezone,
        escapeHtml,
        formatRobux,
        formatPct,
        normalizeTransaction,
        normalizeTransactions,
        buildTransactionKey,
        mergeTransactions,
        calculateVelocityPct,
        parseScopeKey,
        formatScopeLabel,
    };

    function normalizeTimeZone(timeZone) {
        var candidate = typeof timeZone === 'string' && timeZone ? timeZone : 'UTC';
        try {
            new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
            return candidate;
        } catch (e) {
            return 'UTC';
        }
    }

    function getISODateInTimezone(date, timezone) {
        try {
            const options = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
            const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
            const year = parts.find(p => p.type === 'year').value;
            const month = parts.find(p => p.type === 'month').value;
            const day = parts.find(p => p.type === 'day').value;
            return `${year}-${month}-${day}`;
        } catch (e) {
            return date.toISOString().slice(0, 10);
        }
    }

    function getHourInTimezone(date, timezone) {
        try {
            const options = { timeZone: timezone, hour12: false, hour: '2-digit' };
            const hourStr = new Intl.DateTimeFormat('en-US', options).format(date);
            return parseInt(hourStr) % 24;
        } catch (e) {
            return date.getUTCHours();
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#39;');
    }

    function formatRobux(value) {
        return Math.round(value || 0).toLocaleString();
    }

    function formatPct(value) {
        if (!Number.isFinite(value)) return '0.00%';
        return `${value.toFixed(2)}%`;
    }

    function normalizeTransaction(raw) {
        if (!raw || !raw.created || !raw.currency || typeof raw.currency.amount !== 'number') {
            return null;
        }

        const createdDate = new Date(raw.created);
        if (Number.isNaN(createdDate.getTime())) {
            return null;
        }

        const details = raw.details || {};
        const amount = raw.currency.amount;
        const assetId = details.id == null ? '' : String(details.id);
        const assetName = String(details.name || 'Unknown Asset');
        const assetType = String(details.type || 'Unknown');
        const groupId = raw.groupId == null ? '' : String(raw.groupId);
        const groupName = raw.groupName == null ? '' : String(raw.groupName);

        return {
            id: raw.id == null ? '' : String(raw.id),
            created: createdDate.toISOString(),
            currency: { amount },
            details: { id: assetId, name: assetName, type: assetType },
            groupId: groupId,
            groupName: groupName,
        };
    }

    function normalizeTransactions(input) {
        if (!Array.isArray(input)) return [];
        const output = [];
        for (const tx of input) {
            const normalized = normalizeTransaction(tx);
            if (normalized) output.push(normalized);
        }
        return output;
    }

    function buildTransactionKey(tx) {
        if (tx.id) return `id:${tx.id}`;
        const assetPart = tx.details.id || tx.details.name;
        return `${assetPart}|${tx.created}|${tx.currency.amount}`;
    }

    function mergeTransactions(existing, incoming) {
        const map = new Map();
        const combined = normalizeTransactions(existing).concat(normalizeTransactions(incoming));

        for (const tx of combined) {
            const key = buildTransactionKey(tx);
            const previous = map.get(key);
            if (!previous) {
                map.set(key, tx);
                continue;
            }

            const prevTs = Date.parse(previous.created);
            const nextTs = Date.parse(tx.created);
            if (nextTs > prevTs) {
                map.set(key, tx);
            }
        }

        return Array.from(map.values()).sort((a, b) => Date.parse(b.created) - Date.parse(a.created));
    }

    function calculateVelocityPct(sumA, sumB) {
        if (sumB === 0 && sumA === 0) return 0;
        if (sumB === 0 && sumA > 0) return 100;
        return ((sumA - sumB) / sumB) * 100;
    }

    function parseScopeKey(scopeKey) {
        var raw = String(scopeKey || '');
        var scopedMatch = raw.match(/^(group|user)_(\d+)$/i);
        if (scopedMatch) {
            return {
                raw: raw,
                scopeType: scopedMatch[1].toLowerCase(),
                entityId: scopedMatch[2],
            };
        }

        var numericMatch = raw.match(/^(\d+)$/);
        if (numericMatch) {
            return {
                raw: raw,
                scopeType: 'group',
                entityId: numericMatch[1],
            };
        }

        return {
            raw: raw,
            scopeType: 'group',
            entityId: raw,
        };
    }

    function formatScopeLabel(scopeKey, preferredName) {
        var parsed = parseScopeKey(scopeKey);
        var cleanName = typeof preferredName === 'string' ? preferredName.trim() : '';
        var hasName = cleanName && cleanName.toLowerCase() !== 'unknown group';
        var entityId = parsed.entityId || parsed.raw || 'unknown';

        if (parsed.scopeType === 'user') {
            var userName = hasName ? cleanName : 'User Sales';
            return userName + ' (User ID: ' + entityId + ')';
        }

        if (hasName) {
            if (cleanName === entityId) {
                return 'Group ID: ' + entityId;
            }
            return cleanName + ' (Group ID: ' + entityId + ')';
        }

        return 'Group ID: ' + entityId;
    }

})();

