chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle Tool State Updates from Content Script
    if (request.action === 'toolStateUpdated') {
        chrome.storage.local.set({ activeTool: request.active ? request.tool : null, activeToolArgs: request.args || null });
    }

    if (request.action === 'clearCache') {
        const opts = request.options || {};
        const dataToRemove = {
            "cache": opts.cache !== false, // default true
            "cookies": opts.cookies !== false,
            "localStorage": opts.localStorage !== false,
            "history": opts.history === true, // default false
            // Always clear these if cache/cookies are cleared? Or logic?
            // For now let's strict to what user asked + reasonable defaults for "cleaning"
            "appcache": opts.cache !== false,
            "cacheStorage": opts.cache !== false,
            "indexedDB": opts.localStorage !== false,
            "webSQL": opts.localStorage !== false,
            "serviceWorkers": opts.cache !== false
        };

        // Filter keys where value is false (API might not like false?, actually it wants true to remove)
        // browsingData.remove expects object with properties set to true to remove them.

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
// Persistence Handler
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Trigger on complete load OR on URL change (SPA navigation)
    const isNavigation = changeInfo.status === 'complete' || changeInfo.url;

    if (isNavigation && tab.url && !tab.url.startsWith('chrome://')) {
        chrome.storage.local.get(['persistentMode', 'activeTool', 'activeToolArgs'], (result) => {
            if (result.persistentMode && result.activeTool === 'apiMonitor') {
                // Re-activate the tool
                let action = '';
                if (result.activeTool === 'inspector') action = 'toggleInspector';
                else if (result.activeTool === 'colorPicker') action = 'toggleColorPicker';
                else if (result.activeTool === 'fontScanner') action = 'highlightFont';
                else if (result.activeTool === 'apiMonitor') action = 'toggleApiMonitor';

                if (action) {
                    const payload = { action: action, force: true };
                    // If simply toggling, we might prefer "enable" action to avoid flipping off if already on.
                    // However, we assume navigation resets state.
                    // For SPA (url change but no reload), content script state MIGHT persist.
                    // So we should ideally send an "ensureActive" or check state first.
                    // But 'toggle' is what we have.
                    // Fix: Add 'force: true' or similar if we can modify content.js, or just send it.
                    // For now, let's assume reload resets it. For SPA, it might be tricky.
                    // Let's send a generic "reapply" message if it's SPA?
                    // Simpler: Just send the action. 

                    if (result.activeTool === 'fontScanner' && result.activeToolArgs) {
                        payload.fontSize = result.activeToolArgs.fontSize;
                    }

                    // Retry logic for 'complete' status which ensures content script is ready
                    const sendMessage = () => {
                        chrome.tabs.sendMessage(tabId, payload).catch(() => { });
                    };

                    sendMessage();
                    // Retry once after a second just in case
                    setTimeout(sendMessage, 1000);
                }
            }
        });
    }
});
