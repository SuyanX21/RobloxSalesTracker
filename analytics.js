(function () {
    const CACHE_KEY = 'salestrack_cache';
    const DAY_MS = 24 * 60 * 60 * 1000;

    const state = {
        transactions: [],
        analytics: null,
        sortKey: 'grossRobux',
        sortDir: 'desc',
        activeAssetKeys: null,
        searchQuery: '',
        whalesOnly: false,
    };

    const settings = {
        timeZone: 'UTC'
    };

    function loadSettings() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['timeZone'], function(result) {
                    settings.timeZone = result.timeZone || 'UTC';
                    resolve();
                });
            } else {
                resolve();
            }
        });
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
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
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

        return {
            id: raw.id == null ? '' : String(raw.id),
            created: createdDate.toISOString(),
            currency: { amount },
            details: { id: assetId, name: assetName },
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

    function readCachedTransactions() {
        return new Promise(function(resolve) {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['salestrack_cache'], function(result) {
                    try {
                        var raw = result.salestrack_cache;
                        if (!raw) {
                            resolve([]);
                            return;
                        }
                        var parsed = raw;
                        if (typeof raw === 'string') {
                            parsed = JSON.parse(raw);
                        }
                        if (Array.isArray(parsed)) {
                            resolve(normalizeTransactions(parsed));
                        } else if (parsed && Array.isArray(parsed.transactions)) {
                            resolve(normalizeTransactions(parsed.transactions));
                        } else if (parsed && Array.isArray(parsed.data)) {
                            resolve(normalizeTransactions(parsed.data));
                        } else {
                            resolve([]);
                        }
                    } catch (error) {
                        console.warn('Failed to parse salestrack_cache:', error);
                        resolve([]);
                    }
                });
            } else {
                try {
                    if (typeof localStorage === 'undefined') {
                        resolve([]);
                        return;
                    }
                    var raw = localStorage.getItem(CACHE_KEY);
                    if (!raw) {
                        resolve([]);
                        return;
                    }
                    var parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        resolve(normalizeTransactions(parsed));
                    } else if (parsed && Array.isArray(parsed.transactions)) {
                        resolve(normalizeTransactions(parsed.transactions));
                    } else if (parsed && Array.isArray(parsed.data)) {
                        resolve(normalizeTransactions(parsed.data));
                    } else {
                        resolve([]);
                    }
                } catch (error) {
                    console.warn('Failed to parse salestrack_cache:', error);
                    resolve([]);
                }
            }
        });
    }

    function saveCachedTransactions(transactions) {
        function doSave(data) {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ salestrack_cache: data });
                } else if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                }
            } catch (error) {
                console.warn('Failed to save to salestrack_cache:', error);
            }
        }
        
        if (transactions && Array.isArray(transactions)) {
            doSave(transactions);
        }
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

    function processAnalytics(transactions) {
        const normalized = normalizeTransactions(transactions);
        const now = Date.now();
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

            const hour = getHourInTimezone(createdDate, settings.timeZone);
            hourlyCounts[hour] += 1;

            const dayKey = getISODateInTimezone(createdDate, settings.timeZone);
            dailyRevenueMap.set(dayKey, (dailyRevenueMap.get(dayKey) || 0) + amount);

            const key = tx.details.id || tx.details.name;
            let row = assetMap.get(key);
            if (!row) {
                row = {
                    assetKey: key,
                    assetName: tx.details.name || 'Unknown Asset',
                    assetId: tx.details.id || '',
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

        const assetMatrix = Array.from(assetMap.values()).map((row) => {
            const velocityPct = calculateVelocityPct(row.periodA, row.periodB);
            const marketSharePct = totalGross > 0 ? (row.grossRobux / totalGross) * 100 : 0;

            let trend = 'Stable';
            if (velocityPct > 20) trend = 'Hot';
            if (velocityPct < -20) trend = 'Declining';

            // DYNAMIC UPLOAD FEE LOGIC
            let uploadCost = 0;
            if (row.type === 'GamePass' || row.type === 'DeveloperProduct') {
                uploadCost = 0; // Passes and DevProducts are free to upload
            } else if (row.type === 'Asset') {
                // If it's an Asset, we check the average price to guess if it's a Shirt or UGC
                // Shirts/Pants usually sell for ~5 Robux. UGC is forced by Roblox to be at least 15+
                const averagePrice = row.unitsSold > 0 ? (row.grossRobux / row.unitsSold) : 0;
                if (averagePrice < 15) {
                    uploadCost = 10; // It's likely classic clothing
                } else {
                    uploadCost = 1750; // It's likely UGC
                }
            }

            return {
                assetKey: row.assetKey,
                assetName: row.assetName,
                assetId: row.assetId,
                unitsSold: row.unitsSold,
                grossRobux: row.grossRobux,
                uploadCost: uploadCost, // Save this so we can total it up below
                netRobux: row.grossRobux - uploadCost, // Dynamic net deduction
                velocityPct,
                marketSharePct,
                trend,
                isWhale: false,
            };
        });

        // Rank the assets properly FIRST
        const ranked = [...assetMatrix].sort((a, b) => b.grossRobux - a.grossRobux);
        const topCount = Math.max(1, Math.ceil(ranked.length * 0.2));
        let cumulativeGross = 0;
        
        for (let i = 0; i < ranked.length; i += 1) {
            cumulativeGross += ranked[i].grossRobux;
            const cumulativeShare = totalGross > 0 ? (cumulativeGross / totalGross) * 100 : 0;
            ranked[i].isWhale = i < topCount || cumulativeShare <= 80;
        }

        // Now calculate whale stats from the initialized 'ranked' array
        const whaleRevenue = ranked
            .filter((item) => item.isWhale)
            .reduce((sum, item) => sum + item.grossRobux, 0);
        const whaleSharePct = totalGross > 0 ? (whaleRevenue / totalGross) * 100 : 0;

        // Calculate total costs based on unique assets found
        const totalUploadCosts = assetMap.size * 1750;
        const totalNet = totalGross - totalUploadCosts;

        const series = [];
        const today = new Date();
        
        for (let offset = 29; offset >= 0; offset -= 1) {
            const dayDate = new Date(today.getTime() - (offset * DAY_MS));
            const key = getISODateInTimezone(dayDate, settings.timeZone);
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
            totalNet, // Updated logic
            totalUploadCosts, // Replaces totalTax
            whaleRevenue,
            whaleSharePct,
            hourlyCounts,
            goldenHour,
            series,
            assetMatrix: ranked,
        };
    }

    function getFilteredAssets() {
        if (!state.analytics) return [];

        const query = state.searchQuery.trim().toLowerCase();
        return state.analytics.assetMatrix.filter((row) => {
            if (state.activeAssetKeys && !state.activeAssetKeys.has(row.assetKey)) return false;
            if (state.whalesOnly && !row.isWhale) return false;
            if (query && !row.assetName.toLowerCase().includes(query)) return false;
            return true;
        });
    }

    function sortAssets(rows) {
        const sorted = [...rows];
        const direction = state.sortDir === 'asc' ? 1 : -1;

        sorted.sort((a, b) => {
            const aValue = a[state.sortKey];
            const bValue = b[state.sortKey];

            if (typeof aValue === 'string' || typeof bValue === 'string') {
                return direction * String(aValue).localeCompare(String(bValue));
            }
            return direction * ((aValue || 0) - (bValue || 0));
        });
        return sorted;
    }

    function renderStats() {
        const ribbon = document.getElementById('statsRibbon');
        const analytics = state.analytics;
        if (!analytics) return;

        const cards = [
            {
                label: 'Total Gross',
                value: 'R$ ' + formatRobux(analytics.totalGross),
                meta: analytics.transactionCount.toLocaleString() + ' transactions',
            },
            {
                label: 'Total Net',
                value: 'R$ ' + formatRobux(analytics.totalNet),
                meta: 'Gross minus total upload fees',
            },
            {
                label: 'Total Upload Costs',
                value: 'R$ ' + formatRobux(analytics.totalUploadCosts),
                meta: 'R$ 1,750 per unique asset',
            },
        ];

        ribbon.innerHTML = cards.map(function(card) {
            return '<article class="stat-card"><div class="label">' + escapeHtml(card.label) + '</div><div class="value">' + escapeHtml(card.value) + '</div><div class="meta">' + escapeHtml(card.meta) + '</div></article>';
        }).join('');
    }

    function renderHeatmap() {
        const analytics = state.analytics;
        if (!analytics) return;

        const container = document.getElementById('heatmapGrid');
        const goldenHourText = document.getElementById('goldenHourText');
        const max = Math.max.apply(null, analytics.hourlyCounts.concat([1]));

        container.innerHTML = analytics.hourlyCounts.map(function(count, hour) {
            var intensity = count / max;
            var bgAlpha = (0.14 + intensity * 0.65).toFixed(2);
            var label = String(hour).padStart(2, '0');
            return '<div class="heat-cell" style="background: rgba(0, 176, 111, ' + bgAlpha + ');"><div>' + label + ':00</div><div>' + count + '</div></div>';
        }).join('');

        if (analytics.goldenHour == null) {
            goldenHourText.textContent = 'Golden Hour: n/a';
        } else {
            var hour = String(analytics.goldenHour).padStart(2, '0');
            goldenHourText.textContent = 'Golden Hour: ' + hour + ':00 (' + settings.timeZone + ') (' + analytics.hourlyCounts[analytics.goldenHour] + ' sales)';
        }
    }

    function renderChart() {
        var analytics = state.analytics;
        var canvas = document.getElementById('revenueChart');
        var ctx = canvas.getContext('2d');
        if (!analytics || !ctx) return;

        var rect = canvas.getBoundingClientRect();
        var width = Math.max(380, Math.floor(rect.width));
        var height = Math.max(250, Math.floor(rect.height));
        var dpr = window.devicePixelRatio || 1;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        var m = { top: 14, right: 14, bottom: 30, left: 44 };
        var plotW = width - m.left - m.right;
        var plotH = height - m.top - m.bottom;

        var values = analytics.series.map(function(p) { return p.grossRobux; });
        var maxY = Math.max.apply(null, values.concat([1]));

        ctx.strokeStyle = '#2f3539';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.left, m.top);
        ctx.lineTo(m.left, height - m.bottom);
        ctx.lineTo(width - m.right, height - m.bottom);
        ctx.stroke();

        ctx.fillStyle = '#8d98a3';
        ctx.font = '11px Segoe UI';
        for (var i = 0; i <= 4; i += 1) {
            var value = (maxY / 4) * i;
            var y = (height - m.bottom) - (plotH * i / 4);
            ctx.fillText(Math.round(value).toLocaleString(), 4, y + 4);
            ctx.strokeStyle = '#23292d';
            ctx.beginPath();
            ctx.moveTo(m.left, y);
            ctx.lineTo(width - m.right, y);
            ctx.stroke();
        }

        if (analytics.series.length <= 1) return;
        var stepX = plotW / (analytics.series.length - 1);

        ctx.beginPath();
        analytics.series.forEach(function(point, index) {
            var x = m.left + index * stepX;
            var y = (height - m.bottom) - ((point.grossRobux / maxY) * plotH);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#00b06f';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.lineTo(m.left + (analytics.series.length - 1) * stepX, height - m.bottom);
        ctx.lineTo(m.left, height - m.bottom);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 176, 111, 0.16)';
        ctx.fill();

        ctx.fillStyle = '#8d98a3';
        analytics.series.forEach(function(point, index) {
            if (index % 5 !== 0 && index !== analytics.series.length - 1) return;
            var x = m.left + index * stepX;
            ctx.fillText(point.day.slice(5), x - 14, height - 10);
        });
    }

    function renderAssetFilters() {
        var container = document.getElementById('assetFilters');
        var countEl = document.getElementById('assetSelectionCount');
        var rows = state.analytics ? state.analytics.assetMatrix : [];

        if (!rows.length) {
            container.innerHTML = '<div class="filter-item">No assets available.</div>';
            countEl.textContent = '0';
            return;
        }

        var sortedByName = rows.slice().sort(function(a, b) {
            return a.assetName.localeCompare(b.assetName);
        });

        container.innerHTML = sortedByName.map(function(row) {
            var checked = !state.activeAssetKeys || state.activeAssetKeys.has(row.assetKey);
            return '<label class="filter-item"><span><input type="checkbox" class="asset-filter-check" value="' + escapeHtml(row.assetKey) + '" ' + (checked ? 'checked' : '') + '>' + escapeHtml(row.assetName) + '</span><span>R$ ' + formatRobux(row.grossRobux) + '</span></label>';
        }).join('');

        var selectedCount = state.activeAssetKeys ? state.activeAssetKeys.size : rows.length;
        countEl.textContent = state.activeAssetKeys ? selectedCount.toLocaleString() : 'All';

        container.querySelectorAll('.asset-filter-check').forEach(function(checkbox) {
            checkbox.addEventListener('change', function() {
                var checkboxes = Array.from(container.querySelectorAll('.asset-filter-check'));
                var checkedKeys = checkboxes.filter(function(el) { return el.checked; }).map(function(el) { return el.value; });
                if (checkedKeys.length === checkboxes.length) {
                    state.activeAssetKeys = null;
                } else {
                    state.activeAssetKeys = new Set(checkedKeys);
                }
                render();
            });
        });
    }

    function renderTable() {
        var body = document.getElementById('assetTableBody');
        var visibleRows = sortAssets(getFilteredAssets());

        if (!visibleRows.length) {
            body.innerHTML = '<tr><td colspan="8">No assets match current filters.</td></tr>';
            return;
        }

        body.innerHTML = visibleRows.map(function(row) {
            var velocityClass = 'trend-flat';
            if (row.velocityPct > 20) velocityClass = 'trend-hot';
            if (row.velocityPct < -20) velocityClass = 'trend-down';

            // Custom class for styling net profits vs net losses visually
            var netClass = row.netRobux < 0 ? 'net-loss' : 'net-profit';

            return '<tr>' +
                '<td>' + escapeHtml(row.assetName) + '</td>' +
                '<td>' + row.unitsSold.toLocaleString() + '</td>' +
                '<td>R$ ' + formatRobux(row.grossRobux) + '</td>' +
                '<td class="' + netClass + '">R$ ' + formatRobux(row.netRobux) + '</td>' +
                '<td class="' + velocityClass + '">' + formatPct(row.velocityPct) + '</td>' +
                '<td>' + formatPct(row.marketSharePct) + '</td>' +
                '<td>' + escapeHtml(row.trend) + '</td>' +
                '<td>' + (row.isWhale ? 'Whale' : '-') + '</td>' +
                '</tr>';
        }).join('');
    }

    function render() {
        state.analytics = processAnalytics(state.transactions);
        renderStats();
        renderHeatmap();
        renderAssetFilters();
        renderTable();
        renderChart();
    }

    function setStatus(text, isError) {
        var el = document.getElementById('fetchStatus');
        el.textContent = text;
        el.style.color = isError ? '#d65a5a' : '#9aa4ad';
    }

    async function requestLatestTransactions() {
        var newest = state.transactions[0] ? state.transactions[0].created : null;

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            return new Promise(function(resolve, reject) {
                chrome.runtime.sendMessage(
                    { type: 'salestrack_FETCH_LATEST', sinceCreatedAt: newest },
                    function(response) {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        if (!response) {
                            reject(new Error('No response from background script.'));
                            return;
                        }
                        if (Array.isArray(response)) {
                            resolve(response);
                            return;
                        }
                        if (Array.isArray(response.transactions)) {
                            resolve(response.transactions);
                            return;
                        }
                        reject(new Error(response.error || 'Unexpected background response format.'));
                    }
                );
            });
        }

        if (typeof window.salestrackFetchLatest === 'function') {
            var latest = await window.salestrackFetchLatest({ sinceCreatedAt: newest });
            if (Array.isArray(latest)) return latest;
            if (latest && Array.isArray(latest.transactions)) return latest.transactions;
        }

        throw new Error('No fetch bridge found. Add a background listener for salestrack_FETCH_LATEST.');
    }

    async function fetchLatest() {
        var button = document.getElementById('fetchLatestBtn');
        button.disabled = true;
        setStatus('Loading cached transactions...');

        try {
            var incoming = await requestLatestTransactions();
            var before = state.transactions.length;
            state.transactions = mergeTransactions(state.transactions, incoming);
            saveCachedTransactions(state.transactions);
            var added = Math.max(0, state.transactions.length - before);
            if (incoming.length === 0) {
                setStatus('No cached transactions. Visit a group page with the plugin first to scan sales.');
            } else if (added === 0) {
                setStatus('All ' + incoming.length + ' cached transactions already loaded.');
            } else {
                setStatus('Loaded ' + added.toLocaleString() + ' new transactions from cache.');
            }
            render();
        } catch (error) {
            console.error(error);
            setStatus('Error: ' + error.message, true);
        } finally {
            button.disabled = false;
        }
    }

    function assetMatrixToCsv(rows) {
        var headers = [
            'Asset Name',
            'Asset ID',
            'Units Sold',
            'Gross Robux',
            'Net Robux',
            'Velocity Pct',
            'Market Share Pct',
            'Trend',
            'Whale Asset',
        ];

        var csvRows = [headers.join(',')];
        for (var idx = 0; idx < rows.length; idx++) {
            var row = rows[idx];
            var cols = [
                row.assetName,
                row.assetId,
                row.unitsSold,
                Math.round(row.grossRobux),
                Math.round(row.netRobux),
                row.velocityPct.toFixed(2),
                row.marketSharePct.toFixed(2),
                row.trend,
                row.isWhale ? 'yes' : 'no',
            ].map(function(value) { return '"' + String(value).replace(/"/g, '""') + '"'; });
            csvRows.push(cols.join(','));
        }
        return csvRows.join('\n');
    }

    function triggerCsvDownload() {
        var rows = sortAssets(getFilteredAssets());
        var csv = assetMatrixToCsv(rows);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'salestrack_asset_matrix_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleJsonLoad() {
        var input = document.getElementById('jsonInput');
        var status = document.getElementById('jsonStatus');
        var text = input.value.trim();
        if (!text) {
            status.textContent = 'Paste a JSON array first.';
            status.style.color = '#d65a5a';
            return;
        }

        try {
            var parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) {
                throw new Error('Top-level JSON must be an array of transactions.');
            }
            var before = state.transactions.length;
            state.transactions = mergeTransactions(state.transactions, parsed);
            saveCachedTransactions(state.transactions);
            var added = Math.max(0, state.transactions.length - before);
            status.textContent = 'Loaded successfully. ' + added.toLocaleString() + ' new rows merged.';
            status.style.color = '#00b06f';
            render();
        } catch (error) {
            status.textContent = 'Invalid JSON: ' + error.message;
            status.style.color = '#d65a5a';
        }
    }

    function bindEvents() {
        document.getElementById('fetchLatestBtn').addEventListener('click', fetchLatest);
        document.getElementById('exportCsvBtn').addEventListener('click', triggerCsvDownload);
        document.getElementById('loadJsonBtn').addEventListener('click', handleJsonLoad);

        document.getElementById('assetSearch').addEventListener('input', function(event) {
            state.searchQuery = event.target.value || '';
            renderTable();
        });

        document.getElementById('whalesOnly').addEventListener('change', function(event) {
            state.whalesOnly = Boolean(event.target.checked);
            renderTable();
        });

        document.querySelectorAll('.sort-btn').forEach(function(button) {
            button.addEventListener('click', function() {
                var key = button.dataset.sort;
                if (!key) return;
                if (state.sortKey === key) {
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortKey = key;
                    state.sortDir = 'desc';
                }
                renderTable();
            });
        });

        window.addEventListener('resize', renderChart);
    }

    async function boot() {
        await loadSettings();
        readCachedTransactions().then(function(fromCache) {
            var fromWindow = [];
            if (Array.isArray(window.salestrackTransactions)) {
                fromWindow = normalizeTransactions(window.salestrackTransactions);
            }

            state.transactions = mergeTransactions(fromCache, fromWindow);
            saveCachedTransactions(state.transactions);
            bindEvents();
            render();
        });
    }

    window.processAnalytics = processAnalytics;
    window.salestrackDashboard = {
        setTransactions: function(transactions) {
            state.transactions = mergeTransactions([], transactions);
            saveCachedTransactions(state.transactions);
            render();
        },
        mergeTransactions: mergeTransactions,
        processAnalytics: processAnalytics,
        fetchLatest: fetchLatest,
        assetMatrixToCsv: assetMatrixToCsv,
    };

    boot();
})();