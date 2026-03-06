// API Module - Inline
console.log('Sales Tracker: Script loaded');

async function callRobloxApiJson({ subdomain = 'apis', endpoint }) {
    try {
        const url = new URL(endpoint, `https://${subdomain}.roblox.com`);
        const response = await fetch(url.toString(), {
            method: 'GET',
            credentials: 'include',
        });
        
        if (response.status === 429) {
            const error = new Error('Rate limited');
            error.status = 429;
            throw error;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.status) throw error;
        throw new Error(error.message);
    }
}

// Simple DOMPurify fallback with basic sanitization
const DOMPurify = {
    sanitize: (html) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const dangerous = temp.querySelectorAll('script, iframe, object, embed, form');
        dangerous.forEach(el => el.remove());
        const allElements = temp.querySelectorAll('*');
        allElements.forEach(el => {
            const attrs = Array.from(el.attributes);
            attrs.forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'href' || attr.name === 'src') {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return temp.innerHTML;
    }
};

// Get Group ID from URL
function getGroupIdFromUrl() {
    let match = window.location.href.match(/[?&]id=(\d+)/);
    if (!match) match = window.location.href.match(/groups\/(\d+)/);
    if (!match) match = window.location.href.match(/groups\/configure\/(\d+)/);
    console.log('Sales Tracker: Group ID from URL:', match ? match[1] : null);
    return match ? match[1] : null;
}

// Initialize Sales Tracker
function initSalesTracker() {
    const groupId = getGroupIdFromUrl();
    if (!groupId) return;

    // Dashboard state
    let state = {
        today: { count: 0, robux: 0 },
        past7Days: { count: 0, robux: 0 },
        allTime: { count: 0, robux: 0 },
        lastCursor: '',
        isScanning: false,
        lastResetDate: new Date().toDateString(),
        oldestSaleDate: null,
        mostRecentTransactionTimestamp: null,
        pending24h: { count: 0, robux: 0 },
        pending72h: { count: 0, robux: 0 },
        totalPending: { count: 0, robux: 0 },
    };

    // Collected transactions for analytics dashboard
    let collectedTransactions = [];

    // Load settings from chrome.storage.local
    let settingsCache = {
        showConversion: true,
        currency: 'USD',
        showNotifications: false,
        darkMode: false,
        timeZone: 'UTC',
    };

    function loadSettings() {
        return settingsCache;
    }

    // Initialize settings from storage
    function initializeSettings() {
        chrome.storage.local.get(['showConversion', 'currency', 'showNotifications', 'darkMode', 'timeZone'], (result) => {
            settingsCache = {
                showConversion: result.showConversion !== false,
                currency: result.currency || 'USD',
                showNotifications: result.showNotifications === true,
                darkMode: result.darkMode === true,
                timeZone: result.timeZone || 'UTC',
            };
            updateDashboard();
        });
    }

    // Listen for storage changes from settings page
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.showConversion || changes.currency || changes.showNotifications || changes.darkMode || changes.timeZone)) {
            initializeSettings();
        }
    });

    // Load saved state
    function loadState() {
        const saved = localStorage.getItem(`sales_tracker_${groupId}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const today = new Date().toDateString();
                if (parsed.lastResetDate !== today) {
                    parsed.today = { count: 0, robux: 0 };
                    parsed.lastResetDate = today;
                }
                parsed.isScanning = false;
                state = { ...state, ...parsed };
            } catch (error) {
                console.warn('Sales Tracker: Failed to parse saved state, resetting.', error);
            }
        }
    }
    
    // Reset state helper
    function resetState() {
        state = {
            today: { count: 0, robux: 0 },
            past7Days: { count: 0, robux: 0 },
            allTime: { count: 0, robux: 0 },
            lastCursor: '',
            isScanning: false,
            lastResetDate: new Date().toDateString(),
            oldestSaleDate: null,
            mostRecentTransactionTimestamp: null,
            pending24h: { count: 0, robux: 0 },
            pending72h: { count: 0, robux: 0 },
            totalPending: { count: 0, robux: 0 },
        };
    }
    
    // Save state to localStorage
    function saveState() {
        localStorage.setItem(`sales_tracker_${groupId}`, JSON.stringify(state));
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                [`sales_tracker_${groupId}`]: state
            });
        }
    }

    // Save transactions for analytics dashboard
    function saveTransactionsForAnalytics() {
        if (collectedTransactions.length === 0) return;
        
        function doSave(existingData) {
            var existingTx = [];
            if (existingData) {
                try {
                    existingTx = JSON.parse(existingData);
                    if (!Array.isArray(existingTx)) existingTx = [];
                } catch (e) {
                    existingTx = [];
                }
            }
            
            var merged = collectedTransactions.slice();
            var existingIds = new Set(collectedTransactions.map(function(tx) { return tx.id; }));
            for (var i = 0; i < existingTx.length; i++) {
                var tx = existingTx[i];
                if (!existingIds.has(tx.id)) {
                    merged.push(tx);
                }
            }
            
            merged.sort(function(a, b) { return new Date(b.created) - new Date(a.created); });
            var trimmed = merged.slice(0, 10000);
            
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ salestrack_cache: trimmed }, function() {
                    console.log('Sales Tracker: Saved', trimmed.length, 'transactions to salestrack_cache for analytics');
                });
            } else {
                try {
                    localStorage.setItem('salestrack_cache', JSON.stringify(trimmed));
                    console.log('Sales Tracker: Saved', trimmed.length, 'transactions to salestrack_cache for analytics');
                } catch (error) {
                    console.warn('Sales Tracker: Failed to save transactions for analytics:', error);
                }
            }
            
            collectedTransactions = [];
        }
        
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['salestrack_cache'], function(result) {
                doSave(result.salestrack_cache ? JSON.stringify(result.salestrack_cache) : null);
            });
        } else {
            var existing = localStorage.getItem('salestrack_cache');
            doSave(existing);
        }
    }

    // Create dashboard UI
    function createDashboard() {
        const dashboard = document.createElement('div');
        dashboard.id = 'sales-dashboard';
        dashboard.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 320px;
            background: #1b1d1f;
            border-radius: 6px;
            color: #ffffff;
            padding: 20px;
            z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            border: 1px solid #393b3d;
        `;

        const headerActions = document.createElement('div');
        headerActions.style.cssText = 'position: absolute; top: 12px; right: 12px; display: flex; gap: 8px;';

        const settingsBtn = document.createElement('a');
        settingsBtn.id = 'tracker-settings-btn';
        settingsBtn.href = '#';
        settingsBtn.title = 'Settings';
        settingsBtn.style.cssText = `
            text-decoration: none; color: #aaa; font-size: 18px; background: #252729;
            border-radius: 50%; width: 28px; height: 28px; display: flex;
            align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer; transition: background 0.2s;
        `;
        settingsBtn.innerHTML = '&#9881;';
        settingsBtn.onclick = (e) => { 
            e.preventDefault(); 
            window.open(chrome.runtime.getURL('settings.html'), '_blank'); 
        };

        const helpBtn = document.createElement('a');
        helpBtn.id = 'tracker-help-btn';
        helpBtn.href = '#';
        helpBtn.title = 'What is this?';
        helpBtn.style.cssText = `
            text-decoration: none; color: #aaa; font-size: 18px; background: #252729;
            border-radius: 50%; width: 28px; height: 28px; display: flex;
            align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer; transition: background 0.2s;
        `;
        helpBtn.innerHTML = '?';
        helpBtn.onclick = (e) => { 
            e.preventDefault(); 
            window.open(chrome.runtime.getURL('help.html'), '_blank'); 
        };

        headerActions.appendChild(settingsBtn);
        headerActions.appendChild(helpBtn);
        dashboard.appendChild(headerActions);

        const content = document.createElement('div');
        content.id = 'sales-dashboard-content';
        content.innerHTML = DOMPurify.sanitize(`
            <div style="font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #ffffff;">Roblox Sales Tracker</div> 
            <div style="margin-bottom: 20px; background: #252729; padding: 12px; border-radius: 6px;">
                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Heute (${new Date().toLocaleDateString('de-DE')})</div>
                <div style="font-size: 16px; margin-top: 8px; color: #ffffff;">Sales: <b id="today-count">0</b></div>
                <div style="font-size: 18px; color: #00b06f; font-weight: bold;"><b id="today-robux">R$ 0</b> <span id="today-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Past 7 Days</div>
                <div style="font-size: 16px; margin-top: 8px; color: #ffffff;">Total Sales: <b id="days7-count">0</b></div>
                <div style="font-size: 16px; color: #ffb800;"><b>Estimated: <span id="days7-robux">R$ 0</span> <span id="days7-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></b></div>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">All Time</div>
                <div style="font-size: 12px; color: #888; margin-bottom: 8px;">Oldest logged: <span style="color: #ffb800;" id="alltime-start">Loading...</span></div>
                <div style="font-size: 16px; margin-top: 4px; color: #ffffff;">Total Sales: <b id="alltime-count">0</b></div>
                <div style="font-size: 16px; color: #ffb800;"><b>Estimated: <span id="alltime-robux">R$ 0</span> <span id="alltime-conversion" style="font-size:12px; color:#aaa; margin-left:6px;"></span></b></div>
            </div>
            <div style="margin-bottom: 20px; background: #252729; padding: 12px; border-radius: 6px;">
                <div style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Pending Revenue (P-R-P)</div>
                <div style="font-size: 14px; margin-top: 12px; color: #ffffff;">Next 24h: <b id="pending24h-robux" style="color: #ff6b6b;">R$ 0</b> <span id="pending24h-conversion" style="font-size:11px; color:#aaa; margin-left:6px;"></span></div>
                <div style="font-size: 14px; margin-top: 8px; color: #ffffff;">Next 72h: <b id="pending72h-robux" style="color: #ffa726;">R$ 0</b> <span id="pending72h-conversion" style="font-size:11px; color:#aaa; margin-left:6px;"></span></div>
                <div style="font-size: 14px; margin-top: 8px; color: #ffffff;">Total Pending: <b id="totalpending-robux" style="color: #64b5f6;">R$ 0</b> <span id="totalpending-conversion" style="font-size:11px; color:#aaa; margin-left:6px;"></span></div>
                <div style="font-size: 12px; color: #aaa; margin-top: 8px; text-align: center;">Est. 30-day escrow</div>
            </div>
            <button id="open-analytics-btn" style="width: 100%; padding: 14px 16px; background: #00b06f; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 16px; cursor: pointer; margin-bottom: 10px;">Open Analytics</button>
            <button id="donate-tracker-btn" style="width: 100%; padding: 14px 16px; background: #ffb800; border: none; border-radius: 6px; color: #000; font-weight: bold; font-size: 16px; cursor: pointer; margin-bottom: 12px; transition: background 0.2s;" onmouseover="this.style.background='#ffa500'" onmouseout="this.style.background='#ffb800'">Donate</button>
            <div id="reset-tracker" style="color: #ff0000; font-size: 13px; cursor: pointer; text-align: center; opacity: 0.8; font-weight: 600;">reset</div>
        `);
        dashboard.appendChild(content);

        // Bind main action buttons
        dashboard.querySelector('#reset-tracker').onclick = () => {
            if (confirm('Are you sure you want to reset all tracking data? This cannot be undone.')) {
                resetState();
                saveState();
                updateDashboard();
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.remove('salestrack_cache');
                } else {
                    localStorage.removeItem('salestrack_cache');
                }
            }
        };

        dashboard.querySelector('#open-analytics-btn').onclick = () => {
            window.open(chrome.runtime.getURL('analytics.html'), '_blank');
        };

        dashboard.querySelector('#donate-tracker-btn').onclick = () => {
            window.open(chrome.runtime.getURL('donate.html'), '_blank');
        };

        return dashboard;
    }

    // Conversion function
    function robuxToCurrency(robux, currency) {
        if (!robux || robux < 1) return '';
        let usd = robux / 10000 * 38;
        let eur = robux / 10000 * 32.5;
        if (currency === 'USD') return `$${usd.toFixed(2)} USD`;
        if (currency === 'EUR') return `EUR ${eur.toFixed(2)}`;
        return `$${usd.toFixed(2)} USD`;
    }

    // Update dashboard display
    function updateDashboard() {
        const dashboard = document.getElementById('sales-dashboard');
        if (!dashboard) return;

        const settings = loadSettings();

        const todayCount = dashboard.querySelector('#today-count');
        const todayRobux = dashboard.querySelector('#today-robux');
        const days7Count = dashboard.querySelector('#days7-count');
        const days7Robux = dashboard.querySelector('#days7-robux');
        const alltimeCount = dashboard.querySelector('#alltime-count');
        const alltimeRobux = dashboard.querySelector('#alltime-robux');
        const alltimeStart = dashboard.querySelector('#alltime-start');
        
        const todayConversion = dashboard.querySelector('#today-conversion');
        const days7Conversion = dashboard.querySelector('#days7-conversion');
        const alltimeConversion = dashboard.querySelector('#alltime-conversion');
        
        const pending24hRobux = dashboard.querySelector('#pending24h-robux');
        const pending72hRobux = dashboard.querySelector('#pending72h-robux');
        const totalPendingRobux = dashboard.querySelector('#totalpending-robux');
        const pending24hConversion = dashboard.querySelector('#pending24h-conversion');
        const pending72hConversion = dashboard.querySelector('#pending72h-conversion');
        const totalPendingConversion = dashboard.querySelector('#totalpending-conversion');

        if (todayCount) todayCount.textContent = state.today.count.toLocaleString();
        if (todayRobux) todayRobux.textContent = `R$ ${state.today.robux.toLocaleString()}`;
        if (days7Count) days7Count.textContent = state.past7Days.count.toLocaleString();
        if (days7Robux) days7Robux.textContent = `R$ ${state.past7Days.robux.toLocaleString()}`;
        if (alltimeCount) alltimeCount.textContent = state.allTime.count.toLocaleString();
        if (alltimeRobux) alltimeRobux.textContent = `R$ ${state.allTime.robux.toLocaleString()}`;
        
        if (alltimeStart) {
            if (state.oldestSaleDate) {
                const dateObj = new Date(state.oldestSaleDate);
                const dateOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                alltimeStart.textContent = dateObj.toLocaleDateString(undefined, dateOptions);
            } else {
                alltimeStart.textContent = 'Scanning history...';
            }
        }

        if (settings.showConversion) {
            if (todayConversion) todayConversion.textContent = robuxToCurrency(state.today.robux, settings.currency);
            if (days7Conversion) days7Conversion.textContent = robuxToCurrency(state.past7Days.robux, settings.currency);
            if (alltimeConversion) alltimeConversion.textContent = robuxToCurrency(state.allTime.robux, settings.currency);
            if (pending24hConversion) pending24hConversion.textContent = robuxToCurrency(state.pending24h.robux, settings.currency);
            if (pending72hConversion) pending72hConversion.textContent = robuxToCurrency(state.pending72h.robux, settings.currency);
            if (totalPendingConversion) totalPendingConversion.textContent = robuxToCurrency(state.totalPending.robux, settings.currency);
        } else {
            [todayConversion, days7Conversion, alltimeConversion, pending24hConversion, pending72hConversion, totalPendingConversion].forEach(el => {
                if (el) el.textContent = '';
            });
        }

        if (pending24hRobux) pending24hRobux.textContent = `R$ ${state.pending24h.robux.toLocaleString()}`;
        if (pending72hRobux) pending72hRobux.textContent = `R$ ${state.pending72h.robux.toLocaleString()}`;
        if (totalPendingRobux) totalPendingRobux.textContent = `R$ ${state.totalPending.robux.toLocaleString()}`;

        dashboard.style.background = settings.darkMode ? '#0d0e0f' : '#1b1d1f';
    }

    function getStartOfDayInTimeZone(timeZone) {
        const now = new Date();
        const tzDate = new Date(
            now.toLocaleString("en-US", { timeZone })
        );
        tzDate.setHours(0,0,0,0);
        return tzDate;
    }

    // Scan transactions
    async function scanTransactions() {
        if (state.isScanning) return;
        
        state.isScanning = true;
        updateDashboard();

        try {
            const todayStr = new Date().toDateString();
            if (state.lastResetDate !== todayStr) {
                console.log('Sales Tracker: New day detected, resetting today counters');
                state.today = { count: 0, robux: 0 };
                state.lastResetDate = todayStr;
                saveState();
            }

            const scanStartMostRecentTimestamp = state.mostRecentTransactionTimestamp;
            const historicalBookmark = state.lastCursor; 
            
            let maxTransactionTimestampSeen = scanStartMostRecentTimestamp;
            let oldestDate = state.oldestSaleDate ? new Date(state.oldestSaleDate) : null;
            
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            // USE TIMEZONE FOR TODAY
            const today = getStartOfDayInTimeZone(settingsCache.timeZone);
            const now = new Date();

            let currentCursor = ''; 
            let isResumingHistorical = false;
            let hasNextPage = true;
            
            while (hasNextPage) {
                try {
                    const cursorParam = currentCursor ? `&cursor=${currentCursor}` : '';
                    const endpoint = `/v2/groups/${groupId}/transactions?limit=100&transactionType=Sale${cursorParam}`;
                    
                    console.log('Sales Tracker: Fetching endpoint:', endpoint);
                    const data = await callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });

                    if (!data || !data.data || data.data.length === 0) {
                        console.log('Sales Tracker: End of transaction history reached');
                        state.lastCursor = ''; 
                        hasNextPage = false;
                        break;
                    }

                    if (!currentCursor && data.data.length > 0) {
                        const newestOnPage = new Date(data.data[0].created).getTime();
                        if (maxTransactionTimestampSeen === null || newestOnPage > maxTransactionTimestampSeen) {
                            maxTransactionTimestampSeen = newestOnPage;
                        }
                    }

                    let processedOnPage = 0;
                    let caughtUpWithNew = false;
                    
                    for (const transaction of data.data) {
                        if (!transaction.currency || typeof transaction.currency.amount !== 'number') continue;
                        
                        const amount = transaction.currency.amount;
                        const transactionDate = new Date(transaction.created);
                        const transactionTimestamp = transactionDate.getTime();
                        
                        if (!isResumingHistorical && scanStartMostRecentTimestamp !== null && transactionTimestamp <= scanStartMostRecentTimestamp) {
                            caughtUpWithNew = true;
                            break; 
                        }
                        
                        if (!oldestDate || transactionDate < oldestDate) {
                            oldestDate = transactionDate;
                        }

                        state.allTime.count++;
                        state.allTime.robux += amount;

                        if (transactionDate >= sevenDaysAgo) {
                            state.past7Days.count++;
                            state.past7Days.robux += amount;
                        }

                        if (transactionDate >= today) {
                            state.today.count++;
                            state.today.robux += amount;
                        }
                        
                        const releaseDate = new Date(transactionDate);
                        releaseDate.setDate(releaseDate.getDate() + 30);
                        const timeUntilRelease = releaseDate - now;
                        const hoursUntilRelease = timeUntilRelease / (1000 * 60 * 60);
                        
                        if (timeUntilRelease > 0) {
                            state.totalPending.count++;
                            state.totalPending.robux += amount;
                            if (hoursUntilRelease <= 24) {
                                state.pending24h.count++;
                                state.pending24h.robux += amount;
                            }
                            if (hoursUntilRelease <= 72) {
                                state.pending72h.count++;
                                state.pending72h.robux += amount;
                            }
                        }
                        
                        collectedTransactions.push({
                            id: transaction.id || `${transactionTimestamp}_${Math.random()}`,
                            created: transaction.created,
                            currency: { amount: amount },
                            details: {
                                id: transaction.details && transaction.details.id ? String(transaction.details.id) : '',
                                name: transaction.details && transaction.details.name ? transaction.details.name : 'Unknown Asset',
                                type: transaction.details && transaction.details.type ? transaction.details.type : 'Unknown'
                            }
                        });
                        
                        processedOnPage++;
                    }
                    
                    if (caughtUpWithNew) {
                        console.log('Sales Tracker: Caught up with new sales.');
                        if (historicalBookmark) {
                            console.log('Sales Tracker: Resuming historical scan from bookmark...');
                            currentCursor = historicalBookmark;
                            isResumingHistorical = true;
                            state.mostRecentTransactionTimestamp = maxTransactionTimestampSeen;
                            saveState();
                            continue; 
                        } else {
                            state.lastCursor = '';
                            hasNextPage = false;
                        }
                    } else if (data.nextPageCursor) {
                        currentCursor = data.nextPageCursor;
                        if (isResumingHistorical || scanStartMostRecentTimestamp === null) {
                            state.lastCursor = data.nextPageCursor;
                        }
                        await new Promise(resolve => setTimeout(resolve, 2500));
                    } else {
                        console.log('Sales Tracker: Finished history scan.');
                        state.lastCursor = ''; 
                        hasNextPage = false;
                    }

                    console.log(`Sales Tracker: Processed ${processedOnPage} transactions on this page`);
                    
                    if (oldestDate) state.oldestSaleDate = oldestDate.toISOString();
                    if (maxTransactionTimestampSeen !== null) state.mostRecentTransactionTimestamp = maxTransactionTimestampSeen;
                    
                    updateDashboard();
                    saveState();
                    
                    if (collectedTransactions.length >= 200) {
                        saveTransactionsForAnalytics();
                    }

                } catch (error) {
                    if (error.status === 429) {
                        console.log('Sales Tracker: Rate limited, waiting 15 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 15000));
                        continue;
                    } else {
                        console.error('Sales Tracker Error during scan:', error);
                        hasNextPage = false;
                    }
                }
            }
            saveTransactionsForAnalytics();
        } finally {
            state.isScanning = false;
            updateDashboard();
        }
    }

    // Initialize
    loadState();
    initializeSettings();
    console.log('Sales Tracker initialized for group:', groupId);
    
    if (!document.getElementById('sales-dashboard')) {
        const dashboard = createDashboard();
        document.body.appendChild(dashboard);
        updateDashboard();
    }

    scanTransactions();
    // Scan every 15 seconds to be safer
    setInterval(scanTransactions, 15000); 
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSalesTracker);
} else {
    initSalesTracker();
}