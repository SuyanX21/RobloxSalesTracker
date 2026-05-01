(function initSalesTrackerBootstrap() {
    var ST = window.SalesTracker = window.SalesTracker || {};
    var isInitialized = false;
    var isResolving = false;
    var retryTimerId = null;
    var retryDelayMs = 1500;
    var hasLoggedTransactionsWait = false;

    function isTransactionsContext(pageContext) {
        return pageContext === 'transactions' || pageContext === 'user';
    }

    function clearRetryTimer() {
        if (retryTimerId) {
            clearTimeout(retryTimerId);
            retryTimerId = null;
        }
    }

    function scheduleRetry() {
        if (retryTimerId || isInitialized) {
            return;
        }
        retryTimerId = setTimeout(function retryInit() {
            retryTimerId = null;
            initSalesTracker();
        }, retryDelayMs);
    }

    function removeLegacyWaitingCard() {
        var legacy = document.getElementById('rbx-sales-tracker-minimal');
        if (legacy && legacy.parentNode) {
            legacy.parentNode.removeChild(legacy);
        }
    }

    function upsertPlaceholderBanner(dashboard, message) {
        if (!dashboard) {
            return;
        }

        var banner = dashboard.querySelector('#sales-tracker-placeholder-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'sales-tracker-placeholder-banner';
            banner.style.margin = '0 0 12px 0';
            banner.style.padding = '10px 12px';
            banner.style.borderRadius = '6px';
            banner.style.background = '#252729';
            banner.style.borderLeft = '4px solid #ffb800';
            banner.style.color = '#cfd3d7';
            banner.style.fontSize = '12px';
            banner.style.lineHeight = '1.45';
            dashboard.insertBefore(banner, dashboard.firstChild);
        }
        banner.textContent = message;
    }

    function ensureTransactionsPlaceholderDashboard(message) {
        removeLegacyWaitingCard();

        var dashboard = document.getElementById('sales-dashboard');
        if (!dashboard || dashboard.getAttribute('data-sales-tracker-placeholder') !== '1') {
            if (dashboard && dashboard.parentNode) {
                dashboard.parentNode.removeChild(dashboard);
            }

            var placeholderTracker = {
                scopeType: 'user',
                entityId: '',
                userId: '',
                state: ST.createInitialState('new'),
                collectedTransactions: [],
                settingsCache: ST.createDefaultSettings()
            };

            var noop = function noop() {};
            var placeholderDeps = {
                loadSettings: function loadSettings() {
                    return placeholderTracker.settingsCache;
                },
                sanitizeHtml: ST.DOMPurify && ST.DOMPurify.sanitize,
                resetState: noop,
                saveState: noop,
                updateDashboard: noop,
                onScanNew: noop,
                onScanFull: noop
            };

            dashboard = ST.createDashboard(placeholderTracker, placeholderDeps);
            dashboard.setAttribute('data-sales-tracker-placeholder', '1');
            document.body.appendChild(dashboard);
            ST.updateDashboard(placeholderTracker, {
                loadSettings: placeholderDeps.loadSettings,
                robuxToCurrency: ST.robuxToCurrency
            });
        }

        upsertPlaceholderBanner(dashboard, message);
    }

    function removePlaceholderDashboardIfNeeded() {
        var dashboard = document.getElementById('sales-dashboard');
        if (dashboard && dashboard.getAttribute('data-sales-tracker-placeholder') === '1' && dashboard.parentNode) {
            dashboard.parentNode.removeChild(dashboard);
        }
    }

    async function resolveTransactionsUserId() {
        if (ST.getTransactionPageUserId) {
            var pageUserId = ST.getTransactionPageUserId();
            if (pageUserId) {
                return String(pageUserId);
            }
        }

        if (ST.callRobloxApiJson) {
            try {
                var authenticated = await ST.callRobloxApiJson({
                    subdomain: 'users',
                    endpoint: '/v1/users/authenticated'
                });
                var userId = authenticated && (authenticated.id || authenticated.userId);
                if (userId) {
                    return String(userId);
                }
            } catch (error) {
                // Ignore and continue with DOM/performance fallback.
            }
        }

        if (ST.getTransactionPageUserId) {
            var fallbackUserId = ST.getTransactionPageUserId();
            if (fallbackUserId) {
                return String(fallbackUserId);
            }
        }

        return null;
    }

    async function resolveTrackerIdentity(pageContext) {
        if (isTransactionsContext(pageContext)) {
            var userId = await resolveTransactionsUserId();
            if (!userId) {
                return null;
            }

            return {
                scopeType: 'user',
                entityId: userId,
                displayName: 'User Sales'
            };
        }

        var groupId = ST.getGroupIdFromUrl();
        if (!groupId) {
            return null;
        }

        return {
            scopeType: 'group',
            entityId: String(groupId),
            displayName: 'Unknown Group'
        };
    }

    function createTrackerFromIdentity(identity) {
        return {
            scopeType: identity.scopeType,
            entityId: identity.entityId,
            groupId: identity.scopeType === 'group' ? identity.entityId : null,
            userId: identity.scopeType === 'user' ? identity.entityId : null,
            groupName: identity.scopeType === 'group' ? identity.displayName : null,
            displayName: identity.displayName,
            state: ST.createInitialState('new'),
            collectedTransactions: [],
            settingsCache: ST.createDefaultSettings()
        };
    }

    async function initSalesTracker() {
        if (isInitialized || isResolving) {
            return;
        }

        if (
            !ST.getGroupIdFromUrl ||
            !ST.getPageContext ||
            !ST.createInitialState ||
            !ST.createDefaultSettings ||
            !ST.createStorageController ||
            !ST.createDashboard ||
            !ST.updateDashboard ||
            !ST.createScanTransactions ||
            !ST.callRobloxApiJson ||
            !ST.isSameDayInTimezone ||
            !ST.getDateKeyInTimezone ||
            !ST.robuxToCurrency
        ) {
            console.error('Sales Tracker: Missing required modules.');
            return;
        }

        isResolving = true;
        try {
            var pageContext = ST.getPageContext();
            var identity = await resolveTrackerIdentity(pageContext);
            var onTransactionsPage = isTransactionsContext(pageContext);

            if (!identity) {
                if (onTransactionsPage) {
                    if (!hasLoggedTransactionsWait) {
                        console.log('Sales Tracker: Waiting for transactions user context...');
                        hasLoggedTransactionsWait = true;
                    }
                    ensureTransactionsPlaceholderDashboard('Loading your account context from Roblox. The full tracker UI is already here and will auto-start as soon as your user sales endpoint is available.');
                    scheduleRetry();
                    return;
                }

                console.log('Sales Tracker: No group ID found for this page context:', pageContext);
                return;
            }

            clearRetryTimer();
            removeLegacyWaitingCard();
            removePlaceholderDashboardIfNeeded();
            isInitialized = true;

            console.log('Sales Tracker: Page context:', pageContext, 'Scope:', identity.scopeType, 'Entity ID:', identity.entityId);

            var tracker = createTrackerFromIdentity(identity);
            var storage = ST.createStorageController(tracker, {
                callRobloxApiJson: ST.callRobloxApiJson
            });

            var updateDashboard = function updateDashboard() {
                ST.updateDashboard(tracker, {
                    loadSettings: storage.loadSettings,
                    robuxToCurrency: ST.robuxToCurrency
                });
            };

            var scanTransactions = ST.createScanTransactions(tracker, {
                callRobloxApiJson: ST.callRobloxApiJson,
                loadSettings: storage.loadSettings,
                saveState: storage.saveState,
                saveTransactionsForAnalytics: storage.saveTransactionsForAnalytics,
                updateDashboard: updateDashboard,
                resetState: storage.resetState,
                prunePast7DaysCounters: storage.prunePast7DaysCounters,
                fetchGroupCurrency: storage.fetchGroupCurrency,
                isSameDayInTimezone: ST.isSameDayInTimezone,
                getDateKeyInTimezone: ST.getDateKeyInTimezone
            });

            var createDashboard = function createDashboard() {
                return ST.createDashboard(tracker, {
                    loadSettings: storage.loadSettings,
                    sanitizeHtml: ST.DOMPurify && ST.DOMPurify.sanitize,
                    resetState: storage.resetState,
                    saveState: storage.saveState,
                    updateDashboard: updateDashboard,
                    onScanNew: function onScanNew() {
                        scanTransactions(false);
                    },
                    onScanFull: function onScanFull() {
                        scanTransactions(true);
                    }
                });
            };

            storage.loadState();
            var startScanLoop = function startScanLoop() {
                scanTransactions();
                setInterval(scanTransactions, 60000);
            };

            storage.initializeSettings(updateDashboard).then(startScanLoop).catch(function (error) {
                console.warn('Sales Tracker: Failed to initialize settings before first scan. Starting with defaults.', error);
                startScanLoop();
            });
            storage.installSettingsListener(updateDashboard);

            console.log('Sales Tracker initialized for', identity.scopeType + ':', identity.entityId);

            if (!document.getElementById('sales-dashboard')) {
                var dashboard = createDashboard();
                document.body.appendChild(dashboard);
                updateDashboard();
            } else {
                updateDashboard();
            }
        } finally {
            isResolving = false;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSalesTracker);
    } else {
        initSalesTracker();
    }
})();
