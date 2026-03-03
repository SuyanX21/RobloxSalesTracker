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
    };

    function loadSettings() {
        return settingsCache;
    }

    // Initialize settings from storage
    function initializeSettings() {
        chrome.storage.local.get(['showConversion', 'currency', 'showNotifications', 'darkMode'], (result) => {
            settingsCache = {
                showConversion: result.showConversion !== false,
                currency: result.currency || 'USD',
                showNotifications: result.showNotifications === true,
                darkMode: result.darkMode === true,
            };
            updateDashboard();
        });
    }

    // Listen for storage changes from settings page
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && (changes.showConversion || changes.currency || changes.showNotifications || changes.darkMode)) {
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
        
        var storageKey = 'salestrack_cache';
        
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

        const helpBtn = document.createElement('a');
        helpBtn.href = '#';
        helpBtn.title = 'What is this?';
        helpBtn.style.cssText = `
            position: absolute;
            top: 12px;
            right: 12px;
            text-decoration: none;
            color: #aaa;
            font-size: 20px;
            background: #252729;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: background 0.2s;
        `;
        helpBtn.innerHTML = '<span style="font-weight: bold;">?</span>';
        helpBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const helpUrl = chrome.runtime.getURL('help.html');
            window.open(helpUrl, '_blank');
        });
        dashboard.appendChild(helpBtn);

        const settingsBtn = document.createElement('a');
        settingsBtn.href = '#';
        settingsBtn.title = 'Settings';
        settingsBtn.style.cssText = `
            position: absolute;
            top: 12px;
            right: 48px;
            text-decoration: none;
            color: #aaa;
            font-size: 20px;
            background: #252729;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            cursor: pointer;
            transition: background 0.2s;
        `;
        settingsBtn.innerHTML = '<span style="font-weight: bold;">&#9881;</span>';
        settingsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const settingsUrl = chrome.runtime.getURL('settings.html');
            window.open(settingsUrl, '_blank');
        });
        dashboard.appendChild(settingsBtn);

        dashboard.innerHTML += DOMPurify.sanitize(`
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

        dashboard.querySelector('#reset-tracker').addEventListener('click', () => {
            resetState();
            saveState();
            updateDashboard();
        });

        dashboard.querySelector('#open-analytics-btn').addEventListener('click', () => {
            const analyticsUrl = chrome.runtime.getURL('analytics.html');
            window.open(analyticsUrl, '_blank');
        });

        dashboard.querySelector('#donate-tracker-btn').addEventListener('click', () => {
            const donateUrl = chrome.runtime.getURL('donate.html');
            window.open(donateUrl, '_blank');
        });

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
                // Displays nicely formatted as "Oct 15, 2023, 14:30"
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
            if (todayConversion) todayConversion.textContent = '';
            if (days7Conversion) days7Conversion.textContent = '';
            if (alltimeConversion) alltimeConversion.textContent = '';
            if (pending24hConversion) pending24hConversion.textContent = '';
            if (pending72hConversion) pending72hConversion.textContent = '';
            if (totalPendingConversion) totalPendingConversion.textContent = '';
        }

        if (pending24hRobux) pending24hRobux.textContent = `R$ ${state.pending24h.robux.toLocaleString()}`;
        if (pending72hRobux) pending72hRobux.textContent = `R$ ${state.pending72h.robux.toLocaleString()}`;
        if (totalPendingRobux) totalPendingRobux.textContent = `R$ ${state.totalPending.robux.toLocaleString()}`;

        if (settings.darkMode) {
            dashboard.style.background = '#0d0e0f';
        } else {
            dashboard.style.background = '#1b1d1f';
        }

        const resetBtn = dashboard.querySelector('#reset-tracker');
        const analyticsBtn = dashboard.querySelector('#open-analytics-btn');
        const donateBtn = dashboard.querySelector('#donate-tracker-btn');
        const helpBtn = dashboard.querySelector('[title="What is this?"]');
        const settingsBtn = dashboard.querySelector('[title="Settings"]');
        
        if (resetBtn) resetBtn.onclick = () => { resetState(); saveState(); updateDashboard(); };
        if (analyticsBtn) analyticsBtn.onclick = () => { window.open(chrome.runtime.getURL('analytics.html'), '_blank'); };
        if (donateBtn) donateBtn.onclick = () => { window.open(chrome.runtime.getURL('donate.html'), '_blank'); };
        if (helpBtn) helpBtn.onclick = (e) => { e.preventDefault(); window.open(chrome.runtime.getURL('help.html'), '_blank'); };
        if (settingsBtn) settingsBtn.onclick = (e) => { e.preventDefault(); window.open(chrome.runtime.getURL('settings.html'), '_blank'); };
    }

    // Scan transactions
    async function scanTransactions() {
        if (state.isScanning) return;
        
        state.isScanning = true;
        updateDashboard();

        try {
            let hasNextPage = true;
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const scanStartMostRecentTimestamp = state.mostRecentTransactionTimestamp;
            let maxTransactionTimestampSeen = scanStartMostRecentTimestamp;
            let oldestDate = state.oldestSaleDate ? new Date(state.oldestSaleDate) : null;
            
            while (hasNextPage) {
                try {
                    const cursor = state.lastCursor ? `&cursor=${state.lastCursor}` : '';
                    const endpoint = `/v2/groups/${groupId}/transactions?limit=100&transactionType=Sale${cursor}`;
                    
                    console.log('Sales Tracker: Fetching endpoint:', endpoint);
                    const data = await callRobloxApiJson({ subdomain: 'economy', endpoint: endpoint });

                    if (!data || !data.data || data.data.length === 0) {
                        console.log('Sales Tracker: No more transactions');
                        state.lastCursor = ''; // Reset the cursor so next poll starts from newest sales
                        hasNextPage = false;
                        break;
                    }

                    let processedCount = 0;
                    let shouldStop = false;
                    const now = new Date();
                    
                    // Fixed: Using a for...of loop so 'break' properly stops execution
                    for (const transaction of data.data) {
                        if (!transaction.currency || typeof transaction.currency.amount !== 'number') continue;
                        
                        const amount = transaction.currency.amount;
                        const transactionDate = new Date(transaction.created);
                        const transactionTimestamp = transactionDate.getTime();
                        
                        // Break out if we hit a sale we have already processed
                        if (scanStartMostRecentTimestamp !== null && transactionTimestamp <= scanStartMostRecentTimestamp) {
                            shouldStop = true;
                            break; 
                        }
                        
                        if (maxTransactionTimestampSeen === null || transactionTimestamp > maxTransactionTimestampSeen) {
                            maxTransactionTimestampSeen = transactionTimestamp;
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
                            id: transaction.id || `${transactionDate.getTime()}_${Math.random()}`,
                            created: transaction.created,
                            currency: { amount: amount },
                            details: {
                                id: transaction.details && transaction.details.id ? String(transaction.details.id) : '',
                                name: transaction.details && transaction.details.name ? transaction.details.name : 'Unknown Asset',
                                type: transaction.details && transaction.details.type ? transaction.details.type : 'Unknown'
                            }
                        });
                        
                        processedCount++;
                    }
                    
                    if (shouldStop) {
                        hasNextPage = false;
                        state.lastCursor = ''; // We caught up, reset cursor to grab new sales next time
                    } else if (data.nextPageCursor) {
                        state.lastCursor = data.nextPageCursor;
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } else {
                        state.lastCursor = ''; // Finished all history, reset cursor
                        hasNextPage = false;
                    }

                    console.log(`Sales Tracker: Processed ${processedCount} transactions`);
                    
                    if (oldestDate) state.oldestSaleDate = oldestDate.toISOString();
                    if (maxTransactionTimestampSeen !== null) state.mostRecentTransactionTimestamp = maxTransactionTimestampSeen;
                    
                    updateDashboard();
                    saveState();

                } catch (error) {
                    if (error.status === 429) {
                        console.log('Sales Tracker: Rate limited, waiting 5 seconds...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        continue;
                    } else {
                        console.error('Sales Tracker Error:', error);
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
    // Decreased interval to 10 seconds (10000ms) for faster logging
    setInterval(scanTransactions, 10000); 
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSalesTracker);
} else {
    initSalesTracker();
}