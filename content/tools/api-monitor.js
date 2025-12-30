/**
 * API Monitor Tool
 */
class ApiMonitorTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.overlay = null;
        this.interceptorInjected = false;
        this.displayedTimestamps = new Map();
        this.pendingRequests = [];

        this.handleMessage = this.handleMessage.bind(this);
    }

    toggle(forceState = null) {
        this.active = forceState !== null ? forceState : !this.active;

        if (this.active) {
            if (!this.interceptorInjected) {
                this.injectInterceptor();
                this.interceptorInjected = true;
            }

            if (window.top === window.self) {
                this.showOverlay();
            }

            window.removeEventListener('message', this.handleMessage);
            window.addEventListener('message', this.handleMessage);
            this.manager.showToast('API Monitor Active');
        } else {
            if (window.top === window.self) {
                this.removeOverlay();
                this.manager.showToast('API Monitor Hidden');
            }
        }

        if (window.top === window.self) {
            this.manager.updateToolState('apiMonitor', this.active);
        }
    }

    injectInterceptor() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('content/interceptor.js');
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    }

    handleMessage(e) {
        // Pre-init buffer handled by manager if needed, but here check source
        if (!e.data || e.data.source !== 'mte-api-monitor') return;
        if (!this.active) return;

        // Filter 'pvg' (keep existing logic)
        if (e.data.url && e.data.url.toLowerCase().includes('pvg')) return;

        if (window.top === window.self) {
            if (this.overlay) {
                this.addRequest(e.data);
            } else {
                this.pendingRequests.push(e.data);
            }
        } else {
            chrome.runtime.sendMessage({ action: 'forwardApiData', data: e.data });
        }
    }

    showOverlay() {
        const existing = document.getElementById('mte-api-monitor');
        if (existing) {
            this.overlay = existing;
            this.overlay.style.display = 'flex';
            return;
        }

        const overlay = Utils.createEl('div');
        overlay.id = 'mte-api-monitor';

        // Header
        const header = Utils.createEl('div');
        header.id = 'mte-api-header';

        const left = Utils.createEl('div', 'mte-api-controls');
        const title = Utils.createEl('span', 'mte-api-title', 'API Monitor');
        const count = Utils.createEl('span', '', '0');
        count.id = 'mte-req-count';
        left.appendChild(title);
        left.appendChild(count);

        const right = Utils.createEl('div', 'mte-api-controls');
        const clearBtn = Utils.createEl('button', '', 'Clear');
        clearBtn.id = 'mte-api-clear';
        clearBtn.onclick = () => this.clearRequests();

        const closeBtn = Utils.createEl('button', '', '✕');
        closeBtn.id = 'mte-api-close';
        closeBtn.onclick = () => this.toggle(false);

        right.appendChild(clearBtn);
        right.appendChild(closeBtn);

        header.appendChild(left);
        header.appendChild(right);

        // Content
        const content = Utils.createEl('div');
        content.id = 'mte-api-content';

        overlay.appendChild(header);
        overlay.appendChild(content);

        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Initialize Drag
        this.initDrag(header, overlay);

        // Flush pending
        this.pendingRequests.forEach(req => this.addRequest(req));
        this.pendingRequests = [];
    }

    removeOverlay() {
        if (this.overlay) this.overlay.remove();
        this.overlay = null;
    }

    clearRequests() {
        if (!this.overlay) return;
        const content = this.overlay.querySelector('#mte-api-content');
        if (content) content.innerHTML = '';
        this.displayedTimestamps.clear();
        const countEl = document.getElementById('mte-req-count');
        if (countEl) countEl.textContent = '0';
    }

    initDrag(handle, target) {
        let isDragging = false, startX, startY, initialX, initialY, xOffset = 0, yOffset = 0;

        handle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            if (e.target === handle || handle.contains(e.target)) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                const currentX = e.clientX - initialX;
                const currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                target.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        }

        function dragEnd() {
            isDragging = false;
        }
    }

    addRequest(data) {
        if (!this.overlay) return;

        // Filter images
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.tiff', '.bmp'];
        try {
            if (data.url) {
                const urlLower = data.url.toLowerCase().split('?')[0];
                if (imageExtensions.some(ext => urlLower.endsWith(ext))) return;
            }
        } catch (e) { }

        const content = this.overlay.querySelector('#mte-api-content');
        const itemId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const item = Utils.createEl('div', 'mte-api-item');
        item.id = itemId;

        // Full URL for cURL
        let fullUrl = data.url;
        try {
            fullUrl = new URL(data.url, window.location.origin).href;
        } catch (e) { }

        // === Top Row (Time on left, Duration on right) ===
        const topRow = Utils.createEl('div', 'mte-top-row');
        topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

        // Time on left
        const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString('en-US', { hour12: false });
        const dupKey = `${timeStr}|${data.method}|${data.url}`;
        let dupCount = (this.displayedTimestamps.get(dupKey) || 0) + 1;
        this.displayedTimestamps.set(dupKey, dupCount);

        // Time badge (Header style)
        const isDup = dupCount > 1;
        const timeSpan = Utils.createEl('span', 'mte-time', timeStr);
        timeSpan.style.cssText = `
            font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
            color: ${isDup ? '#dc2626' : '#475569'}; 
            background: ${isDup ? '#fee2e2' : '#e2e8f0'}; 
            padding: 2px 8px; border-radius: 4px;
        `;
        topRow.appendChild(timeSpan);

        // Duration on right with color coding
        if (data.duration) {
            const dur = parseInt(data.duration);
            let durColor, durBg, durBorder;
            if (dur < 250) {
                // Fast - Green
                durColor = '#15803d'; durBg = '#dcfce7'; durBorder = '#86efac';
            } else if (dur < 500) {
                // Medium - Yellow
                durColor = '#a16207'; durBg = '#fef9c3'; durBorder = '#fde047';
            } else {
                // Slow - Red
                durColor = '#b91c1c'; durBg = '#fee2e2'; durBorder = '#fca5a5';
            }
            const durationSpan = Utils.createEl('span', 'mte-duration', `${data.duration}ms`);
            durationSpan.style.cssText = `
                font-size: 11px; font-weight: 600; 
                color: ${durColor}; background: ${durBg}; 
                border: 1px solid ${durBorder};
                padding: 2px 8px; border-radius: 4px;
            `;
            topRow.appendChild(durationSpan);
        }

        item.appendChild(topRow);

        // === Header Row (Method, Status, URL) ===
        const header = Utils.createEl('div', 'mte-api-item-header');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 10px;';

        const methodClasses = `mte-method-badge mte-method-${data.method}`;
        const methodSpan = Utils.createEl('span', methodClasses, data.method);

        let statusClass = 'mte-status-DEFAULT';
        const s = data.status;
        if (s >= 200 && s < 300) statusClass = 'mte-status-2xx';
        else if (s >= 300 && s < 400) statusClass = 'mte-status-3xx';
        else if (s >= 400) statusClass = 'mte-status-4xx';

        const statusSpan = Utils.createEl('span', `mte-status-badge ${statusClass}`, s);

        let pathname = data.url;
        try {
            const urlObj = new URL(data.url, window.location.origin);
            pathname = urlObj.pathname;
        } catch (e) { }

        const urlSpan = Utils.createEl('span', 'mte-api-url', pathname);
        urlSpan.title = fullUrl;
        urlSpan.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; font-size: 13px;';

        header.appendChild(methodSpan);
        header.appendChild(statusSpan);
        header.appendChild(urlSpan);
        item.appendChild(header);

        // === Menu Button (will be added to tabs row) ===
        const menuBtn = Utils.createEl('button', 'mte-menu-btn', '⋮');
        menuBtn.id = `menu-btn-${itemId}`;
        menuBtn.style.cssText = `
            background: transparent; border: none; 
            padding: 2px 6px; cursor: pointer; font-size: 16px; color: #94a3b8;
            font-weight: bold; line-height: 1; border-radius: 4px; transition: all 0.2s;
        `;
        menuBtn.onmouseover = () => { menuBtn.style.background = '#f1f5f9'; };
        menuBtn.onmouseout = () => { menuBtn.style.background = 'transparent'; };

        // Dropdown Menu
        // Use top instead of bottom to open downwards
        const menuDropdown = Utils.createEl('div', 'mte-menu-dropdown');
        menuDropdown.id = `menu-dropdown-${itemId}`;
        menuDropdown.style.cssText = `
            display: none; position: absolute; right: 0; top: calc(100% + 2px);
            background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
            z-index: 50; min-width: 120px; flex-direction: column; padding: 2px;
        `;

        // Check for payload data (body OR url params)
        let urlParamsObj = {};
        try {
            const urlObj = new URL(data.url, window.location.origin);
            if (urlObj.search && urlObj.search.length > 1) {
                urlObj.searchParams.forEach((value, key) => {
                    urlParamsObj[key] = value;
                });
            }
        } catch (e) { }

        const hasBodyPayload = data.payload && (typeof data.payload === 'object' ? Object.keys(data.payload).length > 0 : String(data.payload).trim().length > 0);
        const hasUrlParams = Object.keys(urlParamsObj).length > 0;
        const hasPayloadData = hasBodyPayload || hasUrlParams;
        const hasResponseData = data.response && String(data.response).trim().length > 0;

        const createMenuItem = (text, disabled = false) => {
            const btn = Utils.createEl('button', 'mte-menu-item', text);
            btn.style.cssText = `
                display: block; width: 100%; text-align: left; padding: 4px 8px;
                background: transparent; border: none; color: ${disabled ? '#cbd5e1' : '#334155'};
                font-size: 12px; font-weight: 500; cursor: ${disabled ? 'not-allowed' : 'pointer'};
                border-radius: 4px; transition: all 0.15s; margin-bottom: 2px;
            `;
            if (!disabled) {
                btn.onmouseover = () => { btn.style.background = '#f1f5f9'; btn.style.color = '#0f172a'; };
                btn.onmouseout = () => { btn.style.background = 'transparent'; btn.style.color = '#334155'; };
            }
            return btn;
        };

        const actionCurl = createMenuItem('Copy cURL');
        const actionPayload = createMenuItem('Copy Payload', !hasPayloadData);
        const actionResponse = createMenuItem('Copy Response', !hasResponseData);

        menuDropdown.appendChild(actionCurl);
        menuDropdown.appendChild(actionPayload);
        menuDropdown.appendChild(actionResponse);

        const menuContainer = Utils.createEl('div', 'mte-menu-container');
        menuContainer.style.cssText = 'position: relative;';
        menuContainer.appendChild(menuBtn);
        menuContainer.appendChild(menuDropdown);

        // === Tabs Row with Menu on right ===
        const tabsWrapper = Utils.createEl('div', 'mte-tabs-wrapper');
        tabsWrapper.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #e2e8f0; margin-bottom: 10px; padding-bottom: 8px;
        `;

        const tabsRow = Utils.createEl('div', 'mte-tabs');
        tabsRow.style.cssText = 'display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 2px;';

        const tabContentContainer = Utils.createEl('div', 'mte-tab-contents');
        tabContentContainer.style.cssText = 'padding-top: 4px;';

        // Helper to update tab styles
        const updateTabStyles = (btn, isActive) => {
            btn.style.background = isActive ? '#6366f1' : 'transparent';
            btn.style.color = isActive ? '#ffffff' : '#64748b';
            btn.style.boxShadow = isActive ? '0 2px 4px rgba(99, 102, 241, 0.3)' : 'none';
            btn.style.fontWeight = isActive ? '600' : '500';
        };

        // Create tab button
        const createTabBtn = (name, isActive) => {
            const btn = Utils.createEl('button', 'mte-tab-btn', name);
            btn.style.cssText = `
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 12px; padding: 4px 16px; transition: all 0.15s ease;
            `;
            updateTabStyles(btn, isActive);
            return btn;
        };

        // Create content area (isResponse flag for different formatting)
        const createTabContent = (contentData, isVisible, noDataText, urlParamsHtml = '', isResponse = false) => {
            const content = Utils.createEl('div', 'mte-tab-content');
            content.style.cssText = `
                display: ${isVisible ? 'block' : 'none'}; 
                font-size: 13px; font-family: Consolas, Monaco, monospace;
                color: #334155; padding-top: 4px;
            `;

            const hasData = contentData && (typeof contentData === 'object' ? Object.keys(contentData).length > 0 : String(contentData).trim().length > 0);
            const hasUrlParams = urlParamsHtml && urlParamsHtml.length > 0;

            if (hasData || hasUrlParams) {
                // Both tabs use key-value grid format
                let html = '<div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 16px;">';

                // Add URL params first (for Payload tab)
                if (hasUrlParams) {
                    html += urlParamsHtml;
                }

                // Add body data
                if (hasData) {
                    try {
                        const obj = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
                        if (typeof obj === 'object' && obj !== null) {
                            for (const [key, value] of Object.entries(obj)) {
                                // Key column
                                html += `<div style="color: #64748b; font-weight: 600; font-size: 13px;">${Utils.escapeHtml(key)}</div>`;

                                // Value column - if object/array, show pretty JSON
                                if (typeof value === 'object' && value !== null) {
                                    const prettyVal = JSON.stringify(value, null, 2);
                                    html += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px; font-family: Consolas, monospace;">${Utils.escapeHtml(prettyVal)}</div>`;
                                } else {
                                    html += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px;">${Utils.escapeHtml(String(value))}</div>`;
                                }
                            }
                        } else {
                            html += `<div style="grid-column: 1 / -1;"><pre style="margin:0; white-space: pre-wrap; font-size: 12px;">${Utils.escapeHtml(String(contentData))}</pre></div>`;
                        }
                    } catch (e) {
                        html += `<div style="grid-column: 1 / -1;"><pre style="margin:0; white-space: pre-wrap; font-size: 12px;">${Utils.escapeHtml(String(contentData))}</pre></div>`;
                    }
                }

                html += '</div>';
                content.innerHTML = html;
            } else {
                content.innerHTML = `<span style="color: #94a3b8; font-style: italic;">${noDataText}</span>`;
            }

            return content;
        };

        // Parse URL params for Payload tab
        let urlParamsHtml = '';
        try {
            const urlObj = new URL(data.url, window.location.origin);
            if (urlObj.searchParams.size > 0) {
                urlObj.searchParams.forEach((value, key) => {
                    urlParamsHtml += `<div style="color: #64748b; font-weight: 600; font-size: 13px;">${Utils.escapeHtml(key)}</div>`;
                    urlParamsHtml += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px;">${Utils.escapeHtml(value)}</div>`;
                });
            }
        } catch (e) { }

        const payloadBtn = createTabBtn('Payload', true);
        const responseBtn = createTabBtn('Response', false);
        const payloadContent = createTabContent(data.payload, true, 'No payload', urlParamsHtml, false);
        const responseContent = createTabContent(data.response, false, 'No response', '', true);

        // Tab switching with proper styles
        payloadBtn.onclick = () => {
            updateTabStyles(payloadBtn, true);
            updateTabStyles(responseBtn, false);
            payloadContent.style.display = 'block';
            responseContent.style.display = 'none';
        };

        responseBtn.onclick = () => {
            updateTabStyles(responseBtn, true);
            updateTabStyles(payloadBtn, false);
            responseContent.style.display = 'block';
            payloadContent.style.display = 'none';
        };

        // Hover effects
        [payloadBtn, responseBtn].forEach(btn => {
            btn.onmouseover = () => {
                if (!btn.classList.contains('active') && btn.style.background !== 'rgb(99, 102, 241)') {
                    btn.style.color = '#334155';
                    btn.style.background = 'rgba(255,255,255,0.5)';
                }
            };
            btn.onmouseout = () => {
                if (btn.style.background !== 'rgb(99, 102, 241)') {
                    const isActive = btn === payloadBtn ? payloadContent.style.display === 'block' : responseContent.style.display === 'block';
                    updateTabStyles(btn, isActive);
                }
            };
        });

        tabsRow.appendChild(payloadBtn);
        tabsRow.appendChild(responseBtn);
        tabsWrapper.appendChild(tabsRow);
        tabsWrapper.appendChild(menuContainer); // Menu on right of tabs row
        tabContentContainer.appendChild(payloadContent);
        tabContentContainer.appendChild(responseContent);

        item.appendChild(tabsWrapper);
        item.appendChild(tabContentContainer);

        // === Event Listeners ===
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('[id^="menu-dropdown-"]').forEach(el => el.style.display = 'none');
            menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'flex' : 'none';
        };

        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.style.display = 'none';
            }
        });

        actionCurl.onclick = () => {
            const cmd = this.generateCurl(data, fullUrl);
            navigator.clipboard.writeText(cmd);
            this.manager.showToast('cURL copied!');
            menuDropdown.style.display = 'none';
        };

        actionPayload.onclick = () => {
            if (!hasPayloadData) {
                menuDropdown.style.display = 'none';
                return;
            }
            // Prioritize body payload, fallback to URL params
            if (hasBodyPayload) {
                this.copyJson(data.payload);
            } else {
                this.copyJson(urlParamsObj);
            }
            menuDropdown.style.display = 'none';
        };

        actionResponse.onclick = () => {
            if (!data.response) return;
            this.copyJson(data.response);
            menuDropdown.style.display = 'none';
        };

        // Prepend to top
        if (content.firstChild) {
            content.insertBefore(item, content.firstChild);
        } else {
            content.appendChild(item);
        }

        const countEl = document.getElementById('mte-req-count');
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
    }

    copyJson(data) {
        let text = '';
        try {
            if (typeof data === 'string') {
                const obj = JSON.parse(data);
                text = JSON.stringify(obj, null, 2);
            } else {
                text = JSON.stringify(data, null, 2);
            }
        } catch (e) {
            text = String(data);
        }
        navigator.clipboard.writeText(text);
        this.manager.showToast('Copied!');
    }

    generateCurl(data, fullUrl) {
        let cmd = `curl -X ${data.method} "${fullUrl}"`;

        if (data.headers) {
            for (const [key, value] of Object.entries(data.headers)) {
                cmd += ` -H "${key}: ${value}"`;
            }
        }

        if (data.payload) {
            let body = data.payload;
            if (typeof body === 'object') {
                try { body = JSON.stringify(body); } catch (e) { }
            }
            if (typeof body === 'string') {
                body = body.replace(/'/g, "'\\''");
                cmd += ` -d '${body}'`;
            }
        }
        return cmd;
    }
}
