// Background script for Roblox Sales Tracker
// Handles message passing between content script and analytics dashboard

// Listen for messages from content scripts and analytics dashboard
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.type === 'salestrack_FETCH_LATEST') {
        handleGetCachedTransactions()
            .then(function(transactions) { sendResponse({ transactions: transactions }); })
            .catch(function(error) { sendResponse({ error: error.message }); });
        return true; // Keep the message channel open for async response
    }

    if (message.type === 'salestrack_SHOW_NOTIFICATION') {
        showChromeNotification(message.title, message.message);
        sendResponse({ success: true });
        return true;
    }
});

function showChromeNotification(title, messageText) {
    if (!chrome.notifications) {
        return;
    }

    chrome.notifications.create('', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128.png'),
        title: title || 'Roblox Sales Tracker',
        message: messageText || 'New sale detected!',
        priority: 2
    }, function(notificationId) {
        if (chrome.runtime.lastError) {
            console.warn('Sales Tracker: Notification error:', chrome.runtime.lastError);
        }
    });
}

async function handleGetCachedTransactions() {
    return new Promise(function(resolve) {
        // Read cached transactions directly from chrome.storage.local
        chrome.storage.local.get(['salestrack_cache'], function(result) {
            if (result && result.salestrack_cache) {
                var data = result.salestrack_cache;
                // Handle both string and object formats
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        data = null;
                    }
                }
                if (Array.isArray(data)) {
                    console.log('Found ' + data.length + ' cached transactions');
                    resolve(data);
                    return;
                }
            }
            console.log('No cached transactions found');
            resolve([]);
        });
    });
}

function getGroupIds() {
    return new Promise(function(resolve) {
        chrome.storage.local.get(null, function(items) {
            var ids = new Set();
            for (var key in items) {
                if (key && key.startsWith('sales_tracker_')) {
                    var match = key.match(/sales_tracker_(\d+)/);
                    if (match) {
                        ids.add(match[1]);
                    }
                }
            }
            resolve(Array.from(ids));
        });
    });
}

