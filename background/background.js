// State Management
let tabStates = {}; // { [tabId]: 'apiMonitor' }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle Tool State Updates from Content Script
    if (request.action === 'toolStateUpdated') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId && request.tool === 'apiMonitor') {
            if (request.active) {
                tabStates[tabId] = 'apiMonitor';
            } else {
                delete tabStates[tabId];
            }
        }
        // Keep global logic for other tools if needed
        chrome.storage.local.set({ activeTool: request.active ? request.tool : null, activeToolArgs: request.args || null });
    }

    if (request.action === 'requestCloseAll') {
        // Global Kill Switch
        tabStates = {}; // Clear all states
        // Broadcast to all tabs in all windows
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'toggleApiMonitor',
                    force: false
                }).catch(() => { });
            });
        });
    }

    if (request.action === 'clearCache') {
        const opts = request.options || {};
        const dataToRemove = {
            "cache": opts.cache !== false, // default true
            "cookies": opts.cookies !== false,
            "localStorage": opts.localStorage !== false,
            "history": opts.history === true, // default false
            "appcache": opts.cache !== false,
            "cacheStorage": opts.cache !== false,
            "indexedDB": opts.localStorage !== false,
            "webSQL": opts.localStorage !== false,
            "serviceWorkers": opts.cache !== false
        };

        chrome.browsingData.remove({
            "since": 0
        }, dataToRemove, () => {
            sendResponse({ status: 'success' });
        });
        return true; // Keep channel open
    }

    if (request.action === 'forwardApiData') {
        // Relay this data to the top frame (ID 0) of the specific tab
        if (sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
                action: 'receiveApiData',
                data: request.data
            }, { frameId: 0 }).catch(() => {
                // Ignore errors if top frame is not ready
            });
        }
    }
});

// Persistence Handler
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Trigger on 'loading' (for early injection) OR 'complete' (for robustness) OR URL change
    const isNavigation = changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url;

    if (isNavigation && tab.url && !tab.url.startsWith('chrome://')) {
        chrome.storage.local.get(['persistentMode', 'activeTool', 'activeToolArgs'], (result) => {

            // API Monitor Persistence Logic (Per Tab)
            if (result.persistentMode && tabStates[tabId] === 'apiMonitor') {
                // Re-activate specific tab
                const sendMessage = () => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'toggleApiMonitor',
                        force: true,
                        silent: true
                    }).catch(() => { });
                };
                sendMessage();
                setTimeout(sendMessage, 1000);
            }

            // Other Tools Logic (Legacy Global)
            if (result.persistentMode && result.activeTool && result.activeTool !== 'apiMonitor') {
                let action = '';
                if (result.activeTool === 'inspector') action = 'toggleInspector';
                else if (result.activeTool === 'colorPicker') action = 'toggleColorPicker';
                else if (result.activeTool === 'fontScanner') action = 'highlightFont';

                if (action) {
                    const payload = { action: action, force: true };
                    if (result.activeTool === 'fontScanner' && result.activeToolArgs) {
                        payload.fontSize = result.activeToolArgs.fontSize;
                    }
                    chrome.tabs.sendMessage(tabId, payload).catch(() => { });
                }
            }
        });
    }
});
