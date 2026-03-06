// Load settings from chrome.storage.local when page loads y
document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['showNotifications', 'darkMode', 'showConversion', 'currency'], (result) => {
        document.getElementById('showNotifications').checked = result.showNotifications === true;
        document.getElementById('darkMode').checked = result.darkMode === true;
        document.getElementById('showConversion').checked = result.showConversion !== false;
        document.getElementById('currency').value = result.currency || 'USD';
    });
});

// Save settings when form is submitted
document.getElementById('settings-form').addEventListener('submit', function(e) {
    e.preventDefault();
    chrome.storage.local.set({
        showNotifications: document.getElementById('showNotifications').checked,
        darkMode: document.getElementById('darkMode').checked,
        showConversion: document.getElementById('showConversion').checked,
        currency: document.getElementById('currency').value
    }, () => {
        // Show success message
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Settings saved!';
        statusEl.style.color = '#00b06f';
        
        // Clear message after 3 seconds
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    });
});

