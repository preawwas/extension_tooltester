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

    // --- FULL PAGE CAPTURE LOGIC ---
    if (request.action === 'startCapture') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (!currentTab) return;

            // Inject scroller script
            chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                files: ['content/capture-scroller.js']
            }, () => {
                // Initialize capture
                chrome.tabs.sendMessage(currentTab.id, { action: 'initCapture' }, (dims) => {
                    if (chrome.runtime.lastError || !dims) {
                        console.error('Failed to init capture', chrome.runtime.lastError);
                        return;
                    }
                    captureLoop(currentTab.id, dims);
                });
            });
        });
    }
});

async function captureLoop(tabId, dims) {
    let { fullHeight, fullWidth, windowHeight, windowWidth, pixelRatio, visibleHeight } = dims;
    // Fallback if visibleHeight is missing (old content script version?)
    const stepHeight = visibleHeight || windowHeight;

    let y = 0;
    const captures = [];

    // Safety limit to prevent infinite loops
    const maxLoops = 100;
    let loopCount = 0;

    // --- TRY to hide scrollbars via Chrome DevTools Protocol ---
    let debuggerAttached = false;
    try {
        await new Promise((resolve, reject) => {
            chrome.debugger.attach({ tabId }, '1.3', () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
        debuggerAttached = true;

        // Try different CDP commands to hide scrollbars
        try {
            await new Promise((resolve, reject) => {
                chrome.debugger.sendCommand({ tabId }, 'Emulation.setScrollbarsHidden', { hidden: true }, (result) => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(result);
                });
            });
        } catch (e) {
            console.warn('Emulation.setScrollbarsHidden not available, trying CSS override');
            // Fallback: inject CSS via CDP
            try {
                await new Promise((resolve, reject) => {
                    chrome.debugger.sendCommand({ tabId }, 'CSS.enable', {}, (result) => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(result);
                    });
                });
                await new Promise((resolve, reject) => {
                    chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
                        expression: `
                            (function() {
                                var s = document.createElement('style');
                                s.id = '__cdp_scrollbar_hide__';
                                s.textContent = '* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
                                document.head.appendChild(s);
                            })();
                        `
                    }, (result) => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(result);
                    });
                });
            } catch (e2) {
                console.warn('CSS via CDP also failed:', e2);
            }
        }

        // Wait for re-render
        await new Promise(r => setTimeout(r, 200));
    } catch (e) {
        console.warn('Debugger attach failed (maybe DevTools open?), capturing without hiding scrollbar:', e.message);
        debuggerAttached = false;
    }

    // --- CAPTURE LOOP (same as original) ---
    while (y < fullHeight && loopCount < maxLoops) {
        loopCount++;

        // Scroll to position
        const scrollResult = await new Promise(resolve => {
            chrome.tabs.sendMessage(tabId, { action: 'scrollTo', x: 0, y: y }, resolve);
        });

        // Use the ACTUAL scroll position for stitching (vital for the last segment)
        const actualY = scrollResult.y;

        // Update fullHeight in case page grew (lazy load)
        if (scrollResult.fullHeight > fullHeight) {
            fullHeight = scrollResult.fullHeight;
        }

        // Capture visible tab
        const dataUrl = await new Promise(resolve => {
            // wait a bit for rendering after scroll
            setTimeout(() => {
                chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 90 }, (data) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Capture failed:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(data);
                    }
                });
            }, 250); // Increased delay for stability
        });

        if (dataUrl) {
            captures.push({ y: actualY, dataUrl });
        } else {
            // If capture failed, should we abort or continue?
            console.warn('Skipping failed capture frame at y=' + y);
        }

        // Prepare next scroll
        y += stepHeight;
    }

    // --- CLEANUP: Restore scrollbars and detach debugger ---
    if (debuggerAttached) {
        try {
            await new Promise((resolve) => {
                chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
                    expression: `(function(){ var s = document.getElementById('__cdp_scrollbar_hide__'); if(s) s.remove(); })()`
                }, () => resolve());
            });
        } catch (e) { /* ignore */ }
        try {
            await new Promise((resolve) => {
                chrome.debugger.detach({ tabId }, () => resolve());
            });
        } catch (e) { /* ignore */ }
    }

    // Finish
    chrome.tabs.sendMessage(tabId, { action: 'finishCapture' });

    // Store data and open result page
    const captureData = {
        captures,
        dims: dims, // Store all dims including captureType and bounding box
        timestamp: Date.now()
    };

    chrome.storage.local.set({ 'latestScreenshot': captureData }, () => {
        chrome.tabs.create({ url: 'popup/screenshot.html' });
    });
}


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
