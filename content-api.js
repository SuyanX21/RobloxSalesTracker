(function initSalesTrackerApiModule() {
    var ST = window.SalesTracker = window.SalesTracker || {};

    console.log('Sales Tracker: Script loaded');

    ST.callRobloxApiJson = async function callRobloxApiJson(options) {
        var subdomain = (options && options.subdomain) || 'apis';
        var endpoint = options && options.endpoint;

        try {
            var url = new URL(endpoint, 'https://' + subdomain + '.roblox.com');
            // Add cache buster to bypass potential API caching
            url.searchParams.set('_t', Date.now());

            var response = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'include'
            });

            if (response.status === 429) {
                var rateLimitError = new Error('Rate limited');
                rateLimitError.status = 429;
                throw rateLimitError;
            }

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }

            return await response.json();
        } catch (error) {
            if (error && error.status) {
                throw error;
            }
            throw new Error(error && error.message ? error.message : 'Unknown API error');
        }
    };

    // Simple DOMPurify fallback with basic sanitization
    ST.DOMPurify = {
        sanitize: function sanitize(html) {
            var temp = document.createElement('div');
            temp.innerHTML = html;

            var dangerous = temp.querySelectorAll('script, iframe, object, embed, form');
            dangerous.forEach(function (el) {
                el.remove();
            });

            var allElements = temp.querySelectorAll('*');
            allElements.forEach(function (el) {
                var attrs = Array.from(el.attributes);
                attrs.forEach(function (attr) {
                    if (attr.name.startsWith('on') || attr.name === 'href' || attr.name === 'src') {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            return temp.innerHTML;
        }
    };
})();
