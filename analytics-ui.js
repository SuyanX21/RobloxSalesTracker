(function() {
    window.AnalyticsUI = {
        renderStats,
        renderHeatmap,
        renderChart,
        renderAssetFilters,
        renderTable,
        assetMatrixToCsv,
        triggerCsvDownload,
        setStatus,
    };

    function renderGroupSelector() {
        const sidebar = document.querySelector('.sidebar');
        let selector = document.getElementById('groupSelector');
        if (!selector) {
            selector = document.createElement('div');
            selector.id = 'groupSelector';
            selector.innerHTML = `
                <label for="groupSelect">Group:</label>
                <select id="groupSelect" style="width: 100%; padding: 8px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #444;">
                    <option value="">Aggregate All</option>
                </select>
                <label>
                    <input type="checkbox" id="aggregateToggle"> Show Aggregate
                </label>
            `;
            sidebar.insertBefore(selector, sidebar.querySelector('.button-row'));
        }

        const state = window.AnalyticsState.getState();
        const groups = Object.keys(state.analyticsByGroup || {});
        const select = selector.querySelector('#groupSelect');
        const toggle = selector.querySelector('#aggregateToggle');

        select.innerHTML = '<option value="">Aggregate All</option>' + groups.map(g => `<option value="${g}" ${state.currentGroupId === g ? 'selected' : ''}>${state.analyticsByGroup[g]?.groupName || g}</option>`).join('');

        select.addEventListener('change', function() {
            window.AnalyticsState.setCurrentGroupId(this.value || null);
            window.AnalyticsMain.render();
        });

        toggle.checked = state.showAggregate;
        toggle.addEventListener('change', function() {
            window.AnalyticsState.toggleAggregate();
            window.AnalyticsMain.render();
        });
    }

    function renderStats() {
        renderGroupSelector();
        const ribbon = document.getElementById('statsRibbon');
        const state = window.AnalyticsState.getState();
        const analytics = state.analytics;
        if (!analytics) return;

        const cards = [
            {
                label: 'Total Gross',
                value: 'R$ ' + window.AnalyticsUtils.formatRobux(analytics.totalGross),
                meta: analytics.transactionCount.toLocaleString() + ' transactions',
            },
            {
                label: 'Total Net',
                value: 'R$ ' + window.AnalyticsUtils.formatRobux(analytics.totalNet),
                meta: 'Gross minus total upload fees',
            },
            {
                label: 'Total Upload Costs',
                value: 'R$ ' + window.AnalyticsUtils.formatRobux(analytics.totalUploadCosts),
                meta: 'Dynamic fees based on asset type',
            },
        ];

        ribbon.innerHTML = cards.map(function(card) {
            return '<article class="stat-card"><div class="label">' + window.AnalyticsUtils.escapeHtml(card.label) + '</div><div class="value">' + window.AnalyticsUtils.escapeHtml(card.value) + '</div><div class="meta">' + window.AnalyticsUtils.escapeHtml(card.meta) + '</div></article>';
        }).join('');
    }

    function renderHeatmap() {
        const state = window.AnalyticsState.getState();
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
            const settings = window.AnalyticsState.getSettings();
            goldenHourText.textContent = 'Golden Hour: ' + hour + ':00 (' + settings.timeZone + ') (' + analytics.hourlyCounts[analytics.goldenHour] + ' sales)';
        }
    }

    function renderChart() {
        const state = window.AnalyticsState.getState();
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
        const state = window.AnalyticsState.getState();
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
            return '<label class="filter-item"><span><input type="checkbox" class="asset-filter-check" value="' + window.AnalyticsUtils.escapeHtml(row.assetKey) + '" ' + (checked ? 'checked' : '') + '>' + window.AnalyticsUtils.escapeHtml(row.assetName) + '</span><span>R$ ' + window.AnalyticsUtils.formatRobux(row.grossRobux) + '</span></label>';
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
                window.AnalyticsMain.render();
            });
        });
    }

    function renderTable() {
        const state = window.AnalyticsState.getState();
        var body = document.getElementById('assetTableBody');
        var visibleRows = window.AnalyticsState.sortAssets(window.AnalyticsState.getFilteredAssets());

        if (!visibleRows.length) {
            body.innerHTML = '<tr><td colspan="8">No assets match current filters.</td></tr>';
            return;
        }

        body.innerHTML = visibleRows.map(function(row) {
            var velocityClass = 'trend-flat';
            if (row.velocityPct > 20) velocityClass = 'trend-hot';
            if (row.velocityPct < -20) velocityClass = 'trend-down';

            var netClass = row.netRobux < 0 ? 'net-loss' : 'net-profit';

            return '<tr>' +
                '<td>' + window.AnalyticsUtils.escapeHtml(row.assetName) + '</td>' +
                '<td>' + row.unitsSold.toLocaleString() + '</td>' +
                '<td>R$ ' + window.AnalyticsUtils.formatRobux(row.grossRobux) + '</td>' +
                '<td class="' + netClass + '">R$ ' + window.AnalyticsUtils.formatRobux(row.netRobux) + '</td>' +
                '<td class="' + velocityClass + '">' + window.AnalyticsUtils.formatPct(row.velocityPct) + '</td>' +
                '<td>' + window.AnalyticsUtils.formatPct(row.marketSharePct) + '</td>' +
                '<td>' + window.AnalyticsUtils.escapeHtml(row.trend) + '</td>' +
                '<td>' + (row.isWhale ? 'Whale' : '-') + '</td>' +
                '</tr>';
        }).join('');
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
        const state = window.AnalyticsState.getState();
        var rows = window.AnalyticsState.sortAssets(window.AnalyticsState.getFilteredAssets());
        var csv = assetMatrixToCsv(rows);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        const settings = window.AnalyticsState.getSettings();
        a.download = 'salestrack_asset_matrix_' + window.AnalyticsUtils.getISODateInTimezone(new Date(), settings.timeZone) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function setStatus(text, isError) {
        var el = document.getElementById('fetchStatus');
        el.textContent = text;
        el.style.color = isError ? '#d65a5a' : '#9aa4ad';
    }

})();

