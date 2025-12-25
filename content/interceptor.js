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

    XHR.send = function (postData) {
        this.addEventListener('load', function () {
            let responseBody = null;
            try {
                if (this.responseType === '' || this.responseType === 'text') {
                    responseBody = this.responseText;
                } else if (this.responseType === 'json') {
                    responseBody = this.response;
                }
            } catch (e) { }

            console.log('MTE: XHR captured', this._url);
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: this.status,
                payload: postData,
                response: responseBody
            }, '*');
        });

        this.addEventListener('error', function () {
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: 0,
                payload: postData,
                response: '[XHR Network Error]'
            }, '*');
        });

        this.addEventListener('abort', function () {
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'XHR',
                method: this._method,
                url: this._url,
                status: 0,
                payload: postData,
                response: '[XHR Aborted]'
            }, '*');
        });
        return send.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const [resource, config] = args;

        // Capture request details early
        const url = resource instanceof Request ? resource.url : resource;
        let method = config?.method;
        if (!method && resource instanceof Request) {
            method = resource.method;
        }
        method = method || 'GET';
        const payload = config?.body;

        try {
            const response = await originalFetch(resource, config);
            const clone = response.clone();

            clone.text().then(text => {
                console.log('MTE: Fetch captured', url);
                window.postMessage({
                    source: 'mte-api-monitor',
                    type: 'Fetch',
                    method: method,
                    url: url,
                    status: response.status,
                    payload: payload,
                    response: text
                }, '*');
            }).catch(err => {
                window.postMessage({
                    source: 'mte-api-monitor',
                    type: 'Fetch',
                    method: method,
                    url: url,
                    status: response.status,
                    payload: payload,
                    response: '[Body Error: ' + err.message + ']'
                }, '*');
            });

            return response;
        } catch (error) {
            // Network or other fetch errors
            window.postMessage({
                source: 'mte-api-monitor',
                type: 'Fetch',
                method: method,
                url: url,
                status: 0, // 0 usually indicates network error
                payload: payload,
                response: '[Network Error: ' + error.message + ']'
            }, '*');
            throw error; // Re-throw to not break the app
        }
    };
})();
