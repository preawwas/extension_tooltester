console.log('Modern Tester Extension loaded');

// Initialize Persistence (Pull Strategy)
// Check storage immediately on load to restore state
chrome.storage.local.get(['persistentMode', 'activeTool', 'activeToolArgs'], (result) => {
    if (result.persistentMode && result.activeTool) {
        console.log('Restoring tool state:', result.activeTool);
        if (result.activeTool === 'inspector') {
            toggleInspector(true);
        } else if (result.activeTool === 'colorPicker') {
            toggleColorPicker(true);
        } else if (result.activeTool === 'fontScanner' && result.activeToolArgs && result.activeToolArgs.fontSize) {
            // Font scanner doesn't have a 'active' flag check inside highlightFont like toggles do, 
            // but calling it is safe.
            highlightFont(result.activeToolArgs.fontSize);
        } else if (result.activeTool === 'apiMonitor') {
            toggleApiMonitor(true);
        }
    }
});

// React to storage changes to sync state across frames (e.g. for API Monitor)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.activeTool) {
        const newValue = changes.activeTool.newValue;
        if (newValue === 'apiMonitor') {
            toggleApiMonitor(true);
        } else if (!newValue) {
            // If tool cleared, turn off everything? 
            if (apiMonitorActive) toggleApiMonitor(false);
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const force = request.force !== undefined ? request.force : null;

    if (request.action === 'scanFonts') {
        const fonts = scanFonts();
        chrome.runtime.sendMessage({ action: 'fontScanResults', data: fonts });
    } else if (request.action === 'toggleInspector') {
        toggleInspector(force);
    } else if (request.action === 'toggleColorPicker') {
        toggleColorPicker(force);
    } else if (request.action === 'highlightFont') {
        highlightFont(request.fontSize);
    } else if (request.action === 'toggleApiMonitor') {
        toggleApiMonitor(force);
    }
});

function scanFonts() {
    const allElements = document.querySelectorAll('*');
    const fontSizes = new Set();

    allElements.forEach(el => {
        // Basic check to ensure it's visible or has text
        if (el.innerText && el.innerText.trim().length > 0) {
            const style = window.getComputedStyle(el);
            const size = style.fontSize;
            fontSizes.add(size);
        }
    });

    // Convert to array and sort numerically
    return Array.from(fontSizes).sort((a, b) => {
        return parseFloat(a) - parseFloat(b);
    });
}

// State for Inspector
let inspectorActive = false;
let inspectorOverlay = null;
let hoveredElement = null;

// Notify background of state changes
function updateToolState(tool, active, args = null) {
    chrome.runtime.sendMessage({ action: 'toolStateUpdated', tool, active, args });
}

function toggleInspector(forceState = null) {
    if (forceState !== null) {
        inspectorActive = forceState;
    } else {
        inspectorActive = !inspectorActive;
    }

    if (inspectorActive) {
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mouseover', handleInspectorHover, true);
        document.addEventListener('click', handleInspectorClick, true);
        createInspectorOverlay();
        showFloatingControl('Inspector Mode', () => toggleInspector(false));
        showToast('Inspector Mode Active');
    } else {
        document.body.style.cursor = 'default';
        document.removeEventListener('mouseover', handleInspectorHover, true);
        document.removeEventListener('click', handleInspectorClick, true);
        removeInspectorOverlay();
        if (hoveredElement) {
            hoveredElement.style.outline = '';
        }
        removeFloatingControl();
        showToast('Inspector Mode Inactive');
    }
    updateToolState('inspector', inspectorActive);
}

// ... existing code ...



// ... existing code ...



// ... existing code ...



function handleInspectorHover(e) {
    if (!inspectorActive) return;
    e.stopPropagation();

    // Remove outline from previous
    if (hoveredElement) {
        hoveredElement.style.outline = '';
    }

    hoveredElement = e.target;
    hoveredElement.style.outline = '2px solid #6366f1'; // Indigo outline
}

function handleInspectorClick(e) {
    if (!inspectorActive) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    const info = {
        tag: el.tagName.toLowerCase(),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        color: computed.color,
        bg: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        margin: computed.margin,
        padding: computed.padding
    };

    showInspectorModal(info, rect);
}

function createInspectorOverlay() {
    // Only created once if needed, or managed by showInspectorModal
}

function removeInspectorOverlay() {
    const modal = document.getElementById('mte-inspector-modal');
    if (modal) modal.remove();
}

function showInspectorModal(info, rect) {
    removeInspectorOverlay();

    const modal = document.createElement('div');
    modal.id = 'mte-inspector-modal';
    modal.className = 'mte-modal';

    // Position near the element but on screen
    const top = rect.bottom + window.scrollY + 10;
    const left = rect.left + window.scrollX;

    modal.style.top = `${top}px`;
    modal.style.left = `${left}px`;

    modal.innerHTML = `
        <div class="mte-modal-header">
            <strong>&lt;${info.tag}&gt;</strong>
            <button id="mte-close-modal">✕</button>
        </div>
        <div class="mte-modal-content">
            <div class="mte-row"><span>Size:</span> <span>${info.width}x${info.height}px</span></div>
            <div class="mte-row"><span>Color:</span> <span class="mte-color-swatch-box"><span class="mte-swatch" style="background:${info.color}"></span> ${info.color}</span></div>
            <div class="mte-row"><span>Bg:</span> <span class="mte-color-swatch-box"><span class="mte-swatch" style="background:${info.bg}"></span> ${info.bg}</span></div>
            <div class="mte-row"><span>Font:</span> <span>${info.fontSize} / ${info.fontFamily.split(',')[0]}</span></div>
            <div class="mte-row"><span>Margin:</span> <span>${info.margin}</span></div>
            <div class="mte-row"><span>Padding:</span> <span>${info.padding}</span></div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('mte-close-modal').addEventListener('click', () => {
        modal.remove();
    });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'mte-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// State for Color Picker
let colorPickerActive = false;
let colorTooltip = null;

function toggleColorPicker(forceState = null) {
    if (forceState !== null) {
        colorPickerActive = forceState;
    } else {
        colorPickerActive = !colorPickerActive;
    }

    // Disable inspector if active and enabling color picker
    if (colorPickerActive && inspectorActive) {
        toggleInspector(false);
    }

    if (colorPickerActive) {
        document.body.style.cursor = 'crosshair'; // Or specific dropper cursor
        document.addEventListener('mousemove', handleColorHover, true);
        document.addEventListener('click', handleColorClick, true);
        showFloatingControl('Color Picker Mode', () => toggleColorPicker(false));
        showToast('Color Picker Active');
    } else {
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', handleColorHover, true);
        document.removeEventListener('click', handleColorClick, true);
        removeColorTooltip();
        removeFloatingControl();
        showToast('Color Picker Inactive');
    }
}

function handleColorHover(e) {
    if (!colorPickerActive) return;
    e.stopPropagation();

    const el = e.target;
    // We try to get the color, or background color if it's set
    const style = window.getComputedStyle(el);
    let color = style.color;
    // Simple heuristic: if bg color is not transparent/rgba(0,0,0,0), show that too or prioritize?
    // User probably wants the color they "see".
    // For now, let's show both if meaningful, or just what's under the cursor.
    // Simpler: Just show computed Color and BackgroundColor.

    showColorTooltip(e.clientX, e.clientY, style.color, style.backgroundColor);
}

function handleColorClick(e) {
    if (!colorPickerActive) return;
    e.preventDefault();
    e.stopPropagation();

    const style = window.getComputedStyle(e.target);
    // Prefer background color if it's not transparent, else text color? 
    // Or just copy the one causing the hover?
    // Let's copy the Hex of the background if relevant, else color.
    // Actually, let's just copy the Hex of the MAIN visible color.
    // Simplification: Copy text color.

    // Better UX: Click copies what's shown in the tooltip.
    // Let's copy the hex value.
    const colorHex = rgbToHex(style.color);
    const bgHex = rgbToHex(style.backgroundColor);

    const valToCopy = (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ? bgHex : colorHex;

    navigator.clipboard.writeText(valToCopy).then(() => {
        showToast(`Copied ${valToCopy}!`);
        toggleColorPicker(); // Auto turn off? Or keep on? request says "button... press and show info", doesn't say auto off.
    });
}

function showColorTooltip(x, y, color, bg) {
    removeColorTooltip();

    const tooltip = document.createElement('div');
    tooltip.id = 'mte-color-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    tooltip.style.zIndex = '100000';
    tooltip.style.background = '#0f172a';
    tooltip.style.border = '1px solid #334155';
    tooltip.style.padding = '8px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.color = 'white';
    tooltip.style.pointerEvents = 'none';

    const colorHex = rgbToHex(color);
    const bgHex = rgbToHex(bg);

    tooltip.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;">
            <div style="width:12px;height:12px;background:${color};border:1px solid #fff;"></div>
            <span>Text: ${colorHex}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
            <div style="width:12px;height:12px;background:${bg};border:1px solid #fff;"></div>
            <span>Bg: ${bgHex}</span>
        </div>
    `;

    document.body.appendChild(tooltip);
}

function removeColorTooltip() {
    const t = document.getElementById('mte-color-tooltip');
    if (t) t.remove();
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent') return 'transparent';
    // Handle rgba
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    rgb = rgb.substr(4).split(")")[0].split(sep);

    let r = (+rgb[0]).toString(16),
        g = (+rgb[1]).toString(16),
        b = (+rgb[2]).toString(16);

    if (r.length == 1) r = "0" + r;
    if (g.length == 1) g = "0" + g;
    if (b.length == 1) b = "0" + b;

    return "#" + r + g + b;
}

function highlightFont(targetSize) {
    // Remove existing highlights
    document.querySelectorAll('.mte-highlight').forEach(el => {
        el.classList.remove('mte-highlight');
    });

    if (!targetSize) return;

    const allElements = document.querySelectorAll('*');
    let count = 0;
    allElements.forEach(el => {
        if (el.innerText && el.innerText.trim().length > 0) {
            const style = window.getComputedStyle(el);
            if (style.fontSize === targetSize) {
                el.classList.add('mte-highlight');
                count++;
                // Scroll first one into view if needed? Maybe too intrusive.
            }
        }
    });
    console.log(`Highlighted ${count} elements with font-size: ${targetSize}`);
}

// State for API Monitor
let apiMonitorActive = false; // exported or global state if needed
let apiMonitorOverlay = null; // exported or global state
let apiInterceptorInjected = false;
let displayedTimestamps = new Map(); // Store counts of visible timestamps: timeString -> count

function toggleApiMonitor(forceState = null) {
    if (forceState !== null) {
        apiMonitorActive = forceState;
    } else {
        apiMonitorActive = !apiMonitorActive;
    }

    if (apiMonitorActive) {
        if (!apiInterceptorInjected) {
            injectNetworkInterceptor();
            apiInterceptorInjected = true;
        }

        // Only create overlay if we are the top frame
        if (window.top === window.self) {
            // Only create if it doesn't already exist in the DOM
            if (!apiMonitorOverlay || !document.body.contains(apiMonitorOverlay)) {
                createApiMonitorOverlay();
            } else {
                apiMonitorOverlay.style.display = 'flex';
            }
            showToast('API Monitor Active');
        }

        // Ensure listener is not added twice
        window.removeEventListener('message', handleApiMessage);
        window.addEventListener('message', handleApiMessage);
    } else {
        if (window.top === window.self) {
            removeApiMonitorOverlay();
            showToast('API Monitor Hidden');
        }
        window.removeEventListener('message', handleApiMessage);
    }

    // Only update state reference if we are top frame to avoid spam? 
    if (window.top === window.self) {
        updateToolState('apiMonitor', apiMonitorActive);
    }
}

function injectNetworkInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/interceptor.js');
    script.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
}

function handleApiMessage(e) {
    if (!apiMonitorActive) return;

    // Validate message source
    if (!e.data || e.data.source !== 'mte-api-monitor') return;

    console.log('MTE: content.js received message', e.data.url);

    // Filter 'pvg'
    if (e.data.url && e.data.url.toLowerCase().includes('pvg')) {
        console.log('MTE: pvg filtered', e.data.url);
        return;
    }

    if (window.top === window.self) {
        // We are the UI host, display it
        if (apiMonitorOverlay) {
            console.log('MTE: adding to overlay', e.data.url);
            addRequestToOverlay(e.data);
        } else {
            console.log('MTE: overlay missing in top frame');
        }
    } else {
        // We are a worker frame, forward to UI host via background
        console.log('MTE: forwarding to background', e.data.url);
        chrome.runtime.sendMessage({ action: 'forwardApiData', data: e.data });
    }
}

// Listen for forwarded API data from other frames
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'receiveApiData' && window.top === window.self && apiMonitorOverlay) {
        addRequestToOverlay(request.data);
    }
});

function createApiMonitorOverlay() {
    removeApiMonitorOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'mte-api-monitor';
    overlay.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 450px; /* Slightly wider for larger font */
        height: 550px;
        background: #f1f5f9; /* Slate 100 - Light Gray Background */
        border: 1px solid #cbd5e1; /* Slate 300 */
        border-radius: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
        z-index: 999999;
        display: flex;
        flex-direction: column;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: #0f172a; /* Slate 900 - Dark Text */
        resize: both;
        overflow: hidden;
    `;

    overlay.innerHTML = `
        <div id="mte-api-header" style="
            padding: 12px;
            background: #ffffff;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
        ">
            <span style="font-weight: 700; font-size: 15px; color: #1e293b;">API Monitor</span>
            <div style="display:flex; gap: 8px; align-items: center;">
                 <input type="text" id="mte-api-search" placeholder="Search..." style="
                    padding: 4px 8px;
                    border: 1px solid #cbd5e1;
                    border-radius: 4px;
                    font-size: 12px;
                    width: 120px;
                    outline: none;
                    background: #f8fafc;
                ">
                 <button id="mte-api-clear" style="
                    background: #e2e8f0;
                    border: 1px solid #cbd5e1;
                    color: #475569;
                    padding: 4px 10px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 600;
                ">Clear</button>
                <button id="mte-api-close" style="
                    background: transparent;
                    border: none;
                    color: #64748b;
                    cursor: pointer;
                    font-size: 18px;
                    line-height: 1;
                ">✕</button>
            </div>
        </div>
        <div id="mte-api-content" style="
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        "></div>
    `;

    document.body.appendChild(overlay);
    apiMonitorOverlay = overlay;

    // Drag functionality
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const dragItem = overlay.querySelector('#mte-api-header');

    dragItem.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        // Ignore if clicking input
        if (e.target.tagName.toLowerCase() === 'input') return;

        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        if (e.target === dragItem || dragItem.contains(e.target)) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            setTranslate(currentX, currentY, overlay);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    // Event listeners
    overlay.querySelector('#mte-api-close').addEventListener('click', () => {
        toggleApiMonitor(false);
    });

    overlay.querySelector('#mte-api-clear').addEventListener('click', () => {
        const content = overlay.querySelector('#mte-api-content');
        if (content) content.innerHTML = '';
        displayedTimestamps.clear(); // Reset timestamp tracker
    });

    // Search Logic
    overlay.querySelector('#mte-api-search').addEventListener('input', (e) => {
        // Debounce slightly if needed, but for simple list it's ok
        const query = e.target.value.toLowerCase();
        const content = overlay.querySelector('#mte-api-content');
        const items = content.querySelectorAll('.mte-api-item');

        items.forEach(item => {
            // textContent contains all text including hidden tabs (Response Body)
            const text = item.textContent.toLowerCase();
            if (text.includes(query)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
}

function removeApiMonitorOverlay() {
    const el = document.getElementById('mte-api-monitor');
    if (el) el.remove();
    apiMonitorOverlay = null;
}

function addRequestToOverlay(data) {
    if (!apiMonitorOverlay) return;

    // Filter out image resources
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.tiff', '.bmp'];
    try {
        const urlObj = new URL(data.url, window.location.origin);
        const pathname = urlObj.pathname.toLowerCase();
        if (imageExtensions.some(ext => pathname.endsWith(ext))) {
            return;
        }
    } catch (e) {
        // If URL parsing fails, check the string directly (less reliable but safe fallback)
        const lowerUrl = data.url.toLowerCase();
        if (imageExtensions.some(ext => lowerUrl.endsWith(ext))) {
            return;
        }
    }

    // Exclude 'pvg' requests as per user request
    if (data.url.toLowerCase().includes('pvg')) {
        return;
    }

    const content = apiMonitorOverlay.querySelector('#mte-api-content');

    // Remove placeholder if exists
    const placeholder = content.querySelector('#mte-api-placeholder');
    if (placeholder) placeholder.remove();

    const item = document.createElement('div');
    item.className = 'mte-api-item';
    item.style.cssText = `
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        padding: 14px;
        font-size: 14px; /* Increased Font Size */
        font-family: Consolas, Monaco, 'Andale Mono', monospace;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    `;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Time Highlighting Logic
    let count = displayedTimestamps.get(time) || 0;
    count++;
    displayedTimestamps.set(time, count);

    const timeColor = count > 1 ? '#ef4444' : '#64748b';
    if (count > 1) {
        const existingItems = content.querySelectorAll(`[data-time="${time}"]`);
        existingItems.forEach(el => el.style.color = '#ef4444');
    }

    const methodColor = data.method === 'GET' ? '#0284c7' : (data.method === 'POST' ? '#16a34a' : '#d97706');

    // Status Code Logic
    const status = data.status || '---';
    let statusColor = '#94a3b8'; // Default gray
    if (status >= 200 && status < 300) statusColor = '#16a34a'; // Green
    else if (status >= 400) statusColor = '#ef4444'; // Red
    else if (status >= 300) statusColor = '#d97706'; // Yellow

    // Function to parse params/json
    const parseData = (input) => {
        let html = '';
        if (typeof input === 'string') {
            try { input = JSON.parse(input); } catch (e) { }
        }
        if (typeof input === 'object' && input !== null) {
            for (const [key, value] of Object.entries(input)) {
                html += createRowHtml(key, value);
            }
        } else if (input) {
            html += createRowHtml('body', String(input));
        }
        return html;
    };

    // Parse URL Params
    let urlParamsHtml = '';
    try {
        const urlObj = new URL(data.url, window.location.origin);
        data.url = urlObj.pathname;
        if (urlObj.searchParams.size > 0) {
            urlObj.searchParams.forEach((value, key) => {
                urlParamsHtml += createRowHtml(key, value);
            });
        }
    } catch (e) { }

    let requestBodyHtml = parseData(data.payload);
    let responseBodyHtml = parseData(data.response);

    const itemId = 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; gap:8px; align-items:center;">
                <span style="
                    background: ${methodColor}; 
                    color: #fff; 
                    padding: 3px 8px; 
                    border-radius: 4px; 
                    font-weight: 700;
                    font-size: 12px;
                ">${data.method}</span>
                <span style="
                    color: ${statusColor}; 
                    font-weight: 700; 
                    font-size: 12px;
                    border: 1px solid ${statusColor};
                    padding: 2px 6px;
                    border-radius: 4px;
                ">${status}</span>
                <span class="mte-api-url" style="color:#334155; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(data.url)}">${escapeHtml(data.url)}</span>
            </div>
            <span class="mte-timestamp" data-time="${time}" style="color:${timeColor}; font-size:12px; margin-left:8px; white-space:nowrap;">${time}</span>
        </div>
        
        <div class="mte-tabs" style="display:flex; gap:10px; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:5px;">
            <button class="mte-tab-btn active" data-target="req-${itemId}">Request</button>
            <button class="mte-tab-btn" data-target="res-${itemId}">Response</button>
        </div>

        <div id="req-${itemId}" class="mte-tab-content" style="display:block; padding-top: 4px;">
            ${urlParamsHtml || requestBodyHtml ?
            `<div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 16px;">
                    ${urlParamsHtml}
                    ${requestBodyHtml}
                </div>` :
            '<span style="color:#94a3b8; font-style:italic;">No payload</span>'
        }
        </div>

        <div id="res-${itemId}" class="mte-tab-content" style="display:none; padding-top: 4px;">
             ${responseBodyHtml ?
            `<div style="display:grid; grid-template-columns: auto 1fr; gap: 6px 16px;">${responseBodyHtml}</div>` :
            '<span style="color:#94a3b8; font-style:italic;">No response data</span>'
        }
        </div>
    `;

    // Tab Logic
    const tabs = item.querySelectorAll('.mte-tab-btn');
    tabs.forEach(tab => {
        tab.style.cssText = `
            background: transparent;
            border: none;
            border-radius: 6px;
            color: #64748b; /* Slate 500 */
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            padding: 6px 16px;
            transition: all 0.2s;
        `;

        if (tab.classList.contains('active')) {
            tab.style.background = '#6366f1'; /* Indigo 500 */
            tab.style.color = '#ffffff';
        }

        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.style.background = 'transparent';
                t.style.color = '#64748b';
                t.classList.remove('active');
            });
            tab.style.background = '#6366f1';
            tab.style.color = '#ffffff';
            tab.classList.add('active');

            const targetId = tab.getAttribute('data-target');
            item.querySelectorAll('.mte-tab-content').forEach(c => c.style.display = 'none');
            item.querySelector('#' + targetId).style.display = 'block';
        });
    });

    content.insertBefore(item, content.firstChild);

    // Check search query immediately
    const searchInput = apiMonitorOverlay.querySelector('#mte-api-search');
    if (searchInput && searchInput.value) {
        const query = searchInput.value.toLowerCase();
        if (!item.textContent.toLowerCase().includes(query)) {
            item.style.display = 'none';
        }
    }
}

function createRowHtml(key, value) {
    let displayValue = String(value);
    let isCode = false;

    // Fix: [object Object] display -> Pretty Print
    if (typeof value === 'object' && value !== null) {
        try {
            displayValue = JSON.stringify(value, null, 2);
            isCode = true;
        } catch (e) {
            displayValue = '[Unable to stringify]';
        }
    }

    return `
        <div style="color: #64748b; font-weight: 600; font-size: 13px;">${escapeHtml(key)}</div>
        <div style="color: #b91c1c; white-space: pre-wrap; word-break: break-all; font-family: Consolas, monospace; font-size: 13px;">${escapeHtml(displayValue)}</div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}



// --- Token Viewer Logic ---
let tokenViewerActive = false;
let tokenOverlay = null;

function toggleTokenViewer(forceState = null) {
    if (forceState !== null) {
        tokenViewerActive = forceState;
    } else {
        tokenViewerActive = !tokenViewerActive;
    }

    if (tokenViewerActive) {
        createTokenOverlay();
        showToast('Token Viewer Active');
    } else {
        removeTokenOverlay();
        showToast('Token Viewer Hidden');
    }
    updateToolState('tokenViewer', tokenViewerActive);
}

function scanTokens() {
    const tokens = {};
    const commonKeys = ['token', 'access_token', 'accessToken', 'auth', 'jwt', 'bearer', 'id_token', 'session', 'user', 'login', 'key', 'jsessionid', 'phpsessid', 'connect.sid', 'aspsessionid'];
    const nestedKeys = ['accessToken', 'access_token', 'token', 'jwt', 'idToken', 'id_token'];

    const processEntry = (source, key, value) => {
        if (!value) return;

        // 1. Check Key Name (Direct match)
        if (commonKeys.some(k => key.toLowerCase().includes(k))) {
            tokens[`${source}: ${key}`] = value;
        }

        // 2. Check JSON Content (Nested match)
        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
            try {
                // Try decoding first just in case (e.g. cookie values)
                const decoded = decodeURIComponent(value);
                const targetVal = (decoded.startsWith('{') || decoded.startsWith('[')) ? decoded : value;

                const obj = JSON.parse(targetVal);
                if (typeof obj === 'object' && obj !== null) {
                    // Check for nested keys
                    for (const nk of nestedKeys) {
                        if (obj[nk] && (typeof obj[nk] === 'string' || typeof obj[nk] === 'number')) {
                            // Found a nested token!
                            tokens[`${source} [Extracted]: ${nk}`] = String(obj[nk]);
                        }
                    }

                    // Handle specific cases like generic 'user' object having 'stsTokenManager' (Firebase)
                    if (obj.stsTokenManager && obj.stsTokenManager.accessToken) {
                        tokens[`${source} [Firebase]: accessToken`] = obj.stsTokenManager.accessToken;
                    }
                }
            } catch (e) {
                // Not JSON, ignore
            }
        }
    };

    // 1. Scan LocalStorage
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            processEntry('Local', key, localStorage.getItem(key));
        }
    } catch (e) { }

    // 2. Scan SessionStorage
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            processEntry('Session', key, sessionStorage.getItem(key));
        }
    } catch (e) { }

    // 3. Scan Cookies
    try {
        if (document.cookie) {
            // Add the full raw cookie string for Header usage
            tokens['HEAD: Cookie'] = document.cookie;

            // Check for accessToken inside the full cookie string specially
            if (document.cookie.includes('accessToken=')) {
                try {
                    const match = document.cookie.match(/accessToken=([^;]+)/);
                    if (match && match[0]) {
                        tokens['EXTRACTED: accessToken'] = match[0]; // Shows "accessToken=..."
                        // If they just want the value: match[1]
                        // User said "Start from word accessToken=", so match[0] is appropriate.
                    }
                } catch (e) { }
            }

            const cookies = document.cookie.split(';');
            cookies.forEach(cookie => {
                if (!cookie.trim()) return;
                const parts = cookie.split('=');
                const name = parts[0].trim();
                const value = parts.slice(1).join('=').trim();

                // Decode cookie value for better readability
                let decodedValue = value;
                try { decodedValue = decodeURIComponent(value); } catch (e) { }

                processEntry('Cookie', name, decodedValue);
            });
        }
    } catch (e) { }

    return tokens;
}

function createTokenOverlay() {
    try {
        removeTokenOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'mte-token-viewer';
        overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 450px;
            max-height: 80vh;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            z-index: 2147483647; /* Max z-index */
            display: flex;
            flex-direction: column;
            color: #0f172a;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
        `;

        const tokens = scanTokens();
        const hasTokens = Object.keys(tokens).length > 0;

        let contentHtml = '';
        if (hasTokens) {
            // Sort: EXTRACTED first, then HEAD, then others
            const sortedKeys = Object.keys(tokens).sort((a, b) => {
                const getPriority = (k) => {
                    if (k.startsWith('EXTRACTED:')) return 0;
                    if (k.startsWith('HEAD:')) return 1;
                    return 2;
                };
                const pA = getPriority(a);
                const pB = getPriority(b);
                if (pA !== pB) return pA - pB;
                return a.localeCompare(b);
            });

            for (const key of sortedKeys) {
                const value = tokens[key];
                const isExtracted = key.startsWith('EXTRACTED:');
                const isHeader = key.startsWith('HEAD:');

                let borderColor = '#e2e8f0';
                let titleColor = '#475569';
                let displayKey = key;

                if (isExtracted) {
                    borderColor = '#10b981'; // Green for specific match
                    titleColor = '#059669';
                    displayKey = '🎯 ' + key.replace('EXTRACTED: ', '');
                } else if (isHeader) {
                    borderColor = '#6366f1'; // Blue
                    titleColor = '#4f46e5';
                    displayKey = 'Raw Cookie Header';
                }

                contentHtml += `
                <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid ${borderColor}; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 700; font-size: 12px; color: ${titleColor};">${escapeHtml(displayKey)}</span>
                        <button class="mte-copy-btn" data-value="${escapeHtml(value)}" style="
                            background: #e2e8f0; border: none; padding: 4px 8px; border-radius: 4px; 
                            font-size: 11px; cursor: pointer; color: #334155; font-weight: 600;">Copy</button>
                    </div>
                    <div style="
                        font-family: monospace; font-size: 11px; color: #64748b; 
                        word-break: break-all; max-height: ${isHeader ? '80px' : '60px'}; overflow-y: auto;
                        background: #f8fafc; padding: 6px; border-radius: 4px;">
                        ${escapeHtml(value)}
                    </div>
                </div>`;
            }
        } else {
            contentHtml = `<div style="text-align: center; color: #64748b; padding: 20px;">No typical token keys or cookies found.</div>`;
        }

        overlay.innerHTML = `
            <div style="
                padding: 12px; 
                border-bottom: 1px solid #e2e8f0; 
                background: white; 
                border-top-left-radius: 8px; 
                border-top-right-radius: 8px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center;
                cursor: default;
            ">
                <span style="font-weight: 700; font-size: 14px;">Token Viewer</span>
                <button id="mte-token-close" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: #64748b;">✕</button>
            </div>
            <div style="padding: 12px; overflow-y: auto; flex: 1;">
                ${contentHtml}
            </div>
        `;

        document.body.appendChild(overlay);
        tokenOverlay = overlay;

        // Add Listeners
        const closeBtn = overlay.querySelector('#mte-token-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                toggleTokenViewer(false);
            });
        }

        overlay.querySelectorAll('.mte-copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const val = e.target.getAttribute('data-value');
                navigator.clipboard.writeText(val).then(() => {
                    const originalText = e.target.textContent;
                    e.target.textContent = 'Copied!';
                    e.target.style.background = '#10b981';
                    e.target.style.color = 'white';
                    setTimeout(() => {
                        e.target.textContent = originalText;
                        e.target.style.background = '#e2e8f0';
                        e.target.style.color = '#334155';
                    }, 1500);
                });
            });
        });
    } catch (err) {
        console.error('Error creating token overlay:', err);
        showToast('Error showing tokens');
    }
}

function removeTokenOverlay() {
    const el = document.getElementById('mte-token-viewer');
    if (el) el.remove();
    tokenOverlay = null;
}

function showFloatingControl(text, callback) {
    removeFloatingControl();

    const control = document.createElement('div');
    control.id = 'mte-floating-control';
    control.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: white;
        padding: 8px 16px;
        border-radius: 9999px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 9999999;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        border: 1px solid #334155;
    `;

    control.innerHTML = `
        <span style="font-weight:500;">${text}</span>
        <button id="mte-stop-btn" style="
            background: #ef4444;
            color: white;
            border: none;
            padding: 4px 12px;
            border-radius: 99px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        ">Stop</button>
    `;

    document.body.appendChild(control);

    document.getElementById('mte-stop-btn').addEventListener('click', () => {
        callback(); // Call the toggle function to turn it off
    });
}

function removeFloatingControl() {
    const el = document.getElementById('mte-floating-control');
    if (el) el.remove();
}
