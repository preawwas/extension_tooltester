(function () {
    console.log('MTE: Interceptor loaded');
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    const setRequestHeader = XHR.setRequestHeader;

    XHR.open = function (method, url) {
        this._method = method;
        this._url = url;
        this._requestHeaders = {};
        return open.apply(this, arguments);
    };

    XHR.setRequestHeader = function (header, value) {
        this._requestHeaders[header] = value;
        return setRequestHeader.apply(this, arguments);
    };

    function getPreciseDuration(url, estimatedStart, backupDuration) {
        // Try to find exact resource timing
        if (typeof performance !== 'undefined' && performance.getEntriesByName) {
            const entries = performance.getEntriesByName(url);
            if (entries && entries.length > 0) {
                // Find the entry that started closest to our manual start time
                // performance.timing.navigationStart + entry.startTime = unix timestamp of start
                // But performance.timeOrigin (or timing.navigationStart) is needed

                const timeOrigin = performance.timeOrigin || performance.timing.navigationStart;
                const estimatedPerformanceNow = estimatedStart - timeOrigin;

                // Allow some tolerance (e.g. 200ms) because JS execution time varies
                const match = entries.reverse().find(e => {
                    // We check if the entry's start time is reasonably close to when we called send/fetch
                    return Math.abs(e.startTime - estimatedPerformanceNow) < 500;
                });

                if (match) {
                    return Math.round(match.duration);
                }
            }
        }
        return backupDuration;
    }

    XHR.send = function (postData) {
        this._startTime = Date.now();

        this.addEventListener('load', function () {
            let responseBody = null;
            try {
                if (this.responseType === '' || this.responseType === 'text') {
                    responseBody = this.responseText;
                } else if (this.responseType === 'json') {
                    responseBody = this.response;
                }
            } catch (e) { }

            let duration = Date.now() - this._startTime;
            duration = getPreciseDuration(this._url, this._startTime, duration);

            console.log('MTE: XHR captured', this._url);
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: this.status,
                payload: postData,
                response: responseBody,
                duration: duration,
                headers: this._requestHeaders,
                timestamp: this._startTime
            }, '*');
        });

        this.addEventListener('error', function () {
            const duration = Date.now() - this._startTime;
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: 0,
                payload: postData,
                response: '[XHR Network Error]',
                duration: duration,
                headers: this._requestHeaders,
                timestamp: this._startTime
            }, '*');
        });

        this.addEventListener('abort', function () {
            const duration = Date.now() - this._startTime;
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: 0,
                payload: postData,
                response: '[XHR Aborted]',
                duration: duration,
                headers: this._requestHeaders,
                timestamp: this._startTime
            }, '*');
        });
        return send.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const [resource, config] = args;
        const startTime = Date.now();

        // Capture request details early
        const url = resource instanceof Request ? resource.url : resource;
        let method = config?.method;
        if (!method && resource instanceof Request) {
            method = resource.method;
        }
        method = method || 'GET';
        const payload = config?.body;

        // Capture headers
        let headers = config?.headers || {};
        if (resource instanceof Request) {
            // Request headers are iterable
            try {
                resource.headers.forEach((v, k) => {
                    // If headers is just a simple object, this might fail if we don't merge carefully
                    // Use a new object to merge
                    if (headers instanceof Headers) {
                        // if config.headers was Headers object (rare in simple usage but possible)
                        // pass
                    } else {
                        // assume plain object or create one
                        if (!headers) headers = {};
                        headers[k] = v;
                    }
                });
            } catch (e) { }
        }


        try {
            const response = await originalFetch(resource, config);
            const clone = response.clone();

            clone.text().then(text => {
                let duration = Date.now() - startTime;
                duration = getPreciseDuration(url, startTime, duration);

                console.log('MTE: Fetch captured', url);
                window.postMessage({
                    source: 'mte-api-monitor',
                    type: 'Fetch',
                    method: method,
                    url: url,
                    status: response.status,
                    payload: payload,
                    response: text,
                    duration: duration,
                    headers: headers,
                    timestamp: startTime
                }, '*');
            }).catch(err => {
                const duration = Date.now() - startTime;
                window.postMessage({
                    source: 'mte-api-monitor',
                    type: 'Fetch',
                    method: method,
                    url: url,
                    status: response.status,
                    payload: payload,
                    response: '[Body Error: ' + err.message + ']',
                    duration: duration,
                    headers: headers,
                    timestamp: startTime
                }, '*');
            });

            return response;
        } catch (error) {
            const duration = Date.now() - startTime;
            // Network or other fetch errors
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'Fetch',
                method: method,
                url: url,
                status: 0, // 0 usually indicates network error
                payload: payload,
                response: '[Network Error: ' + error.message + ']',
                duration: duration,
                headers: headers,
                timestamp: startTime
            }, '*');
            throw error; // Re-throw to not break the app
        }
    };
})();
