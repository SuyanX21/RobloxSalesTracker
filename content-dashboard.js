(function initSalesTrackerDashboardModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    ST.createDashboard = function createDashboard(tracker, deps) {
        var dashboard = document.createElement('div');
        dashboard.id = 'sales-dashboard';
        
        function updateDashboardPosition() {
            var windowHeight = window.innerHeight;
            var windowWidth = window.innerWidth;
            var dashboardWidth = 320;
            var margin = 20;

            // Ensure width doesn't exceed window width
            var actualWidth = Math.min(dashboardWidth, windowWidth - (margin * 2));
            
            // Calculate best top position
            var topPos = 100;
            if (windowHeight < 600) {
                topPos = margin;
            }

            dashboard.style.position = 'fixed';
            dashboard.style.top = topPos + 'px';
            dashboard.style.right = margin + 'px';
            dashboard.style.width = actualWidth + 'px';
            dashboard.style.maxHeight = (windowHeight - (topPos + margin)) + 'px';
            dashboard.style.overflowY = 'auto';
            dashboard.style.background = '#1b1d1f';
            dashboard.style.borderRadius = '6px';
            dashboard.style.color = '#ffffff';
            dashboard.style.padding = '20px';
            dashboard.style.zIndex = '100000';
            dashboard.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            dashboard.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6)';
            dashboard.style.border = '1px solid #393b3d';
            
            // Custom scrollbar for better look
            dashboard.style.scrollbarWidth = 'thin';
            dashboard.style.scrollbarColor = '#444 #1b1d1f';
        }

        updateDashboardPosition();
        window.addEventListener('resize', updateDashboardPosition);

        var settings = deps.loadSettings();
        var todayStr = new Date().toLocaleDateString('de-DE', { timeZone: settings.timeZone });
        var balanceLabel = tracker.scopeType === 'user' ? 'Account Balance' : 'Group Balance';

        var html = '\n'
            + '            <a href="#" id="tracker-help-btn" title="What is this?" style="position: absolute; top: 12px; right: 12px; text-decoration: none; color: #aaa; font-size: 20px; background: #252729; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2); cursor: pointer; transition: background 0.2s;">\n'
            + '                <span style="font-weight: bold;">?</span>\n'
            + '            </a>\n'
            + '            <a href="#" id="tracker-settings-btn" title="Settings" style="position: absolute; top: 12px; right: 48px; text-decoration: none; color: #aaa; font-size: 20px; background: #252729; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2); cursor: pointer; transition: background 0.2s;">\n'
            + '                <span style="font-weight: bold;">&#9881;</span>\n'
            + '            </a>\n'
            + '            <div style="font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #ffffff;">Roblox Sales Tracker</div> \n'
            + '            <div style="margin-bottom: 20px; background: #252729; padding: 12px; border-radius: 6px; border-left: 4px solid #00b06f;">\n'
            + '                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">' + balanceLabel + '</div>\n'
            + '                <div style="font-size: 22px; color: #ffffff; font-weight: bold; margin-top: 4px;"><b id="group-balance-robux">R$ 0</b></div>\n'
            + '                <div id="group-balance-conversion" style="font-size:12px; color:#aaa; margin-top:2px;"></div>\n'
            + '            </div>\n'
            + '            <div style="margin-bottom: 20px; background: #252729; padding: 12px; border-radius: 6px;">\n'
            + '                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Today (<span id="today-label">' + todayStr + '</span>)</div>\n'
            + '                <div style="font-size: 16px; margin-top: 8px; color: #ffffff;">Sales: <b id="today-count">0</b></div>\n'
            + '                <div style="font-size: 18px; color: #00b06f; font-weight: bold;"><b id="today-robux">R$ 0</b> <span id="today-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></div>\n'
            + '            </div>\n'
            + '            <div style="margin-bottom: 20px;">\n'
            + '                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Past 7 Days</div>\n'
            + '                <div style="font-size: 16px; margin-top: 8px; color: #ffffff;">Total Sales: <b id="days7-count">0</b></div>\n'
            + '                <div style="font-size: 16px; color: #ffb800;"><b>Estimated: <span id="days7-robux">R$ 0</span> <span id="days7-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></b></div>\n'
            + '            </div>\n'
            + '            <div style="margin-bottom: 20px;">\n'
            + '                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">All Time</div>\n'
            + '                <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Oldest logged: <span style="color: #ffb800;" id="alltime-start">Loading...</span></div>\n'
            + '                <div style="font-size: 16px; margin-top: 4px; color: #ffffff;">Total Sales: <b id="alltime-count">0</b></div>\n'
            + '                <div style="font-size: 16px; color: #ffb800;"><b>Estimated: <span id="alltime-robux">R$ 0</span> <span id="alltime-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></b></div>\n'
            + '            </div>\n'
            + '            <div style="margin-bottom: 20px; background: #252729; padding: 12px; border-radius: 6px;">\n'
            + '                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Pending Revenue</div>\n'
            + '                <div style="font-size: 18px; margin-top: 8px; color: #64b5f6; font-weight: bold;">Actual: <b id="actual-pending-robux">R$ 0</b></div>\n'
            + '                <div id="actual-pending-conversion" style="font-size:12px; color:#aaa; margin-bottom: 12px;"></div>\n'
            + '                \n'
            + '                <div style="font-size: 10px; color: #888; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; border-top: 1px solid #333; padding-top: 8px;">Breakdown (30-day Est.)</div>\n'
            + '                <div style="font-size: 14px; color: #ffffff;">Next 24h: <b id="pending24h-robux" style="color: #ff6b6b;">R$ 0</b></div>\n'
            + '                <div style="font-size: 14px; margin-top: 4px; color: #ffffff;">Next 72h: <b id="pending72h-robux" style="color: #ffa726;">R$ 0</b></div>\n'
            + '            </div>\n'
            + '            <div style="display: flex; gap: 8px; margin-bottom: 12px;">\n'
            + '                <button id="scan-new-btn" style="flex: 1; padding: 12px; background: #34373a; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 13px; cursor: pointer; transition: background 0.2s;">Scan New</button>\n'
            + '                <button id="scan-full-btn" style="flex: 1; padding: 12px; background: #34373a; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 13px; cursor: pointer; transition: background 0.2s;">Full Scan</button>\n'
            + '            </div>\n'
            + '            <button id="open-analytics-btn" style="width: 100%; padding: 14px 16px; background: #00b06f; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 16px; cursor: pointer; margin-bottom: 10px;">Open Analytics</button>\n'
            + '            <button id="donate-tracker-btn" style="width: 100%; padding: 14px 16px; background: #ffb800; border: none; border-radius: 6px; color: #000; font-weight: bold; font-size: 16px; cursor: pointer; margin-bottom: 12px; transition: background 0.2s;" onmouseover="this.style.background=\'#ffa500\'" onmouseout="this.style.background=\'#ffb800\'">Donate</button>\n'
            + '            <div id="reset-tracker" style="color: #ff0000; font-size: 13px; cursor: pointer; text-align: center; opacity: 0.8; font-weight: 600;">reset</div>\n'
            + '        ';

        var sanitize = (typeof deps.sanitizeHtml === 'function') ? deps.sanitizeHtml : function (value) { return value; };
        dashboard.innerHTML = sanitize(html);

        var helpBtn = dashboard.querySelector('#tracker-help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', function (e) {
                e.preventDefault();
                window.open(chrome.runtime.getURL('help.html'), '_blank');
            });
        }

        var settingsBtn = dashboard.querySelector('#tracker-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function (e) {
                e.preventDefault();
                window.open(chrome.runtime.getURL('settings.html'), '_blank');
            });
        }

        var resetBtn = dashboard.querySelector('#reset-tracker');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                deps.resetState();
                deps.saveState();
                deps.updateDashboard();
            });
        }

        var scanNewBtn = dashboard.querySelector('#scan-new-btn');
        if (scanNewBtn) {
            scanNewBtn.addEventListener('click', function () {
                deps.onScanNew();
            });
        }

        var scanFullBtn = dashboard.querySelector('#scan-full-btn');
        if (scanFullBtn) {
            scanFullBtn.addEventListener('click', function () {
                if (confirm('Are you sure you want to perform a full scan? This will reset your current totals and re-scan everything.')) {
                    deps.onScanFull();
                }
            });
        }


        var analyticsBtn = dashboard.querySelector('#open-analytics-btn');
        if (analyticsBtn) {
            analyticsBtn.addEventListener('click', function () {
                // Fix: chrome.runtime.getURL undefined on content scripts
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    window.open(chrome.runtime.getURL('analytics.html'), '_blank');
                } else {
                    window.open('analytics.html', '_blank');
                }
            });
        }


        var donateBtn = dashboard.querySelector('#donate-tracker-btn');
        if (donateBtn) {
            donateBtn.addEventListener('click', function () {
                window.open(chrome.runtime.getURL('donate.html'), '_blank');
            });
        }

        return dashboard;
    };

    ST.updateDashboard = function updateDashboard(tracker, deps) {
        var dashboard = document.getElementById('sales-dashboard') || document.getElementById('rbx-sales-tracker-minimal');
        if (!dashboard) {
            return;
        }

        var settings = deps.loadSettings();
        var state = tracker.state;

        var todayLabel = dashboard.querySelector('#today-label');
        if (todayLabel) {
            try {
                todayLabel.textContent = new Date().toLocaleDateString('de-DE', { timeZone: settings.timeZone });
            } catch (e) {
                todayLabel.textContent = new Date().toLocaleDateString('de-DE');
            }
        }

        var todayCount = dashboard.querySelector('#today-count');
        var todayRobux = dashboard.querySelector('#today-robux');
        var days7Count = dashboard.querySelector('#days7-count');
        var days7Robux = dashboard.querySelector('#days7-robux');
        var alltimeCount = dashboard.querySelector('#alltime-count');
        var alltimeRobux = dashboard.querySelector('#alltime-robux');
        var alltimeStart = dashboard.querySelector('#alltime-start');

        var todayConversion = dashboard.querySelector('#today-conversion');
        var days7Conversion = dashboard.querySelector('#days7-conversion');
        var alltimeConversion = dashboard.querySelector('#alltime-conversion');

        var groupBalanceRobux = dashboard.querySelector('#group-balance-robux');
        var groupBalanceConversion = dashboard.querySelector('#group-balance-conversion');
        var actualPendingRobux = dashboard.querySelector('#actual-pending-robux');
        var actualPendingConversion = dashboard.querySelector('#actual-pending-conversion');

        var pending24hRobux = dashboard.querySelector('#pending24h-robux');
        var pending72hRobux = dashboard.querySelector('#pending72h-robux');

        if (todayCount) todayCount.textContent = state.today.count.toLocaleString();
        if (todayRobux) todayRobux.textContent = 'R$ ' + state.today.robux.toLocaleString();
        if (days7Count) days7Count.textContent = state.past7Days.count.toLocaleString();
        if (days7Robux) days7Robux.textContent = 'R$ ' + state.past7Days.robux.toLocaleString();
        if (alltimeCount) alltimeCount.textContent = state.allTime.count.toLocaleString();
        if (alltimeRobux) alltimeRobux.textContent = 'R$ ' + state.allTime.robux.toLocaleString();

        if (groupBalanceRobux) groupBalanceRobux.textContent = 'R$ ' + (state.groupBalance || 0).toLocaleString();
        if (actualPendingRobux) actualPendingRobux.textContent = 'R$ ' + (state.actualPendingRobux || 0).toLocaleString();

        if (alltimeStart) {
            if (state.oldestSaleDate) {
                var dateObj = new Date(state.oldestSaleDate);
                var dateOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                try {
                    alltimeStart.textContent = dateObj.toLocaleString(undefined, Object.assign({}, dateOptions, { timeZone: settings.timeZone }));
                } catch (e) {
                    alltimeStart.textContent = dateObj.toLocaleString(undefined, dateOptions);
                }
            } else {
                alltimeStart.textContent = 'Scanning history...';
            }
        }

        if (settings.showConversion) {
            if (todayConversion) todayConversion.textContent = deps.robuxToCurrency(state.today.robux, settings.currency);
            if (days7Conversion) days7Conversion.textContent = deps.robuxToCurrency(state.past7Days.robux, settings.currency);
            if (alltimeConversion) alltimeConversion.textContent = deps.robuxToCurrency(state.allTime.robux, settings.currency);
            if (groupBalanceConversion) groupBalanceConversion.textContent = deps.robuxToCurrency(state.groupBalance, settings.currency);
            if (actualPendingConversion) actualPendingConversion.textContent = deps.robuxToCurrency(state.actualPendingRobux, settings.currency);
        } else {
            if (todayConversion) todayConversion.textContent = '';
            if (days7Conversion) days7Conversion.textContent = '';
            if (alltimeConversion) alltimeConversion.textContent = '';
            if (groupBalanceConversion) groupBalanceConversion.textContent = '';
            if (actualPendingConversion) actualPendingConversion.textContent = '';
        }

        if (pending24hRobux) pending24hRobux.textContent = 'R$ ' + state.pending24h.robux.toLocaleString();
        if (pending72hRobux) pending72hRobux.textContent = 'R$ ' + state.pending72h.robux.toLocaleString();

        if (settings.darkMode) {
            dashboard.style.background = '#0d0e0f';
        } else {
            dashboard.style.background = '#1b1d1f';
        }

        var scanNewBtn = dashboard.querySelector('#scan-new-btn');
        var scanFullBtn = dashboard.querySelector('#scan-full-btn');

        if (scanNewBtn) {
            scanNewBtn.style.background = state.scanType === 'new' ? '#00b06f' : '#34373a';
            scanNewBtn.onmouseover = function () {
                scanNewBtn.style.background = state.scanType === 'new' ? '#00c87f' : '#404346';
            };
            scanNewBtn.onmouseout = function () {
                scanNewBtn.style.background = state.scanType === 'new' ? '#00b06f' : '#34373a';
            };
        }

        if (scanFullBtn) {
            scanFullBtn.style.background = state.scanType === 'full' ? '#00b06f' : '#34373a';
            scanFullBtn.onmouseover = function () {
                scanFullBtn.style.background = state.scanType === 'full' ? '#00c87f' : '#404346';
            };
            scanFullBtn.onmouseout = function () {
                scanFullBtn.style.background = state.scanType === 'full' ? '#00b06f' : '#34373a';
            };
        }
    };
})();
