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

    // --- VISIBLE TAB CAPTURE (Browser Screenshot) ---
    if (request.action === 'captureVisible') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                    windowWidth: window.innerWidth,
                    windowHeight: window.innerHeight,
                    pixelRatio: window.devicePixelRatio || 1,
                }),
            }, (results) => {
                if (chrome.runtime.lastError || !results) return;
                const { windowWidth, windowHeight, pixelRatio } = results[0].result;
                chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError || !dataUrl) return;
                    const captureData = {
                        captures: [{ y: 0, dataUrl }],
                        dims: {
                            fullWidth: windowWidth,
                            fullHeight: windowHeight,
                            windowWidth,
                            windowHeight,
                            pixelRatio,
                            captureType: 'window',
                        },
                        timestamp: Date.now(),
                        autoCopy: true,
                    };
                    chrome.storage.local.set({ latestScreenshot: captureData }, () => {
                        chrome.tabs.create({ url: 'popup/screenshot.html' });
                    });
                });
            });
        });
    }

    // --- QUICK CAPTURE (shot) — capture visible + auto-copy, open editor ---
    if (request.action === 'quickCapture') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => ({
                    windowWidth: window.innerWidth,
                    windowHeight: window.innerHeight,
                    pixelRatio: window.devicePixelRatio || 1,
                }),
            }, (results) => {
                if (chrome.runtime.lastError || !results) return;
                const { windowWidth, windowHeight, pixelRatio } = results[0].result;
                chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError || !dataUrl) return;
                    const captureData = {
                        captures: [{ y: 0, dataUrl }],
                        dims: {
                            fullWidth: windowWidth,
                            fullHeight: windowHeight,
                            windowWidth,
                            windowHeight,
                            pixelRatio,
                            captureType: 'window',
                        },
                        timestamp: Date.now(),
                        autoCopy: true,
                    };
                    chrome.storage.local.set({ latestScreenshot: captureData }, () => {
                        chrome.tabs.create({ url: 'popup/screenshot.html' });
                    });
                });
            });
        });
    }

    // --- INJECT CROP OVERLAY ---
    if (request.action === 'startCropCapture') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab) return;
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/crop-overlay.js'],
            });
        });
    }

    // --- CROP AREA SELECTED — capture, crop, store ---
    if (request.action === 'cropCaptureReady') {
        const { rect, pixelRatio } = request;
        const tabId = sender.tab ? sender.tab.id : null;
        if (!tabId) return;

        // Capture after a short delay so the overlay is fully hidden
        setTimeout(() => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) return;

                // Crop via OffscreenCanvas (available in modern Chrome service workers)
                (async () => {
                    try {
                        const response = await fetch(dataUrl);
                        const imgBlob = await response.blob();
                        const imgBitmap = await createImageBitmap(imgBlob);

                        const scale = pixelRatio;
                        const cropX = Math.round(rect.x * scale);
                        const cropY = Math.round(rect.y * scale);
                        const cropW = Math.max(1, Math.round(rect.width * scale));
                        const cropH = Math.max(1, Math.round(rect.height * scale));

                        // Clamp to image bounds
                        const safeW = Math.min(cropW, imgBitmap.width - cropX);
                        const safeH = Math.min(cropH, imgBitmap.height - cropY);
                        if (safeW <= 0 || safeH <= 0) return;

                        const offscreen = new OffscreenCanvas(safeW, safeH);
                        const ctx = offscreen.getContext('2d');
                        ctx.drawImage(imgBitmap, -cropX, -cropY);

                        const blob = await offscreen.convertToBlob({ type: 'image/png' });

                        // Convert blob → base64 data URL (FileReader not available in SW)
                        const arrayBuffer = await blob.arrayBuffer();
                        const bytes = new Uint8Array(arrayBuffer);
                        let binary = '';
                        for (let i = 0; i < bytes.length; i += 8192) {
                            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                        }
                        const croppedDataUrl = `data:image/png;base64,${btoa(binary)}`;

                        const captureData = {
                            captures: [{ y: 0, dataUrl: croppedDataUrl }],
                            dims: {
                                fullWidth: rect.width,
                                fullHeight: rect.height,
                                windowWidth: rect.width,
                                windowHeight: rect.height,
                                pixelRatio: 1,
                                captureType: 'window',
                            },
                            timestamp: Date.now(),
                            autoCopy: true,
                        };
                        chrome.storage.local.set({ latestScreenshot: captureData }, () => {
                            chrome.tabs.create({ url: 'popup/screenshot.html' });
                        });
                    } catch (err) {
                        console.error('Crop capture failed:', err);
                    }
                })();
            });
        }, 120);
    }
});

async function captureLoop(tabId, dims) {
    let { fullHeight, fullWidth, windowHeight, windowWidth, pixelRatio, visibleHeight } = dims;
    const stepHeight = visibleHeight || windowHeight;

    let y = 0;
    const captures = [];
    const maxLoops = 100;
    let loopCount = 0;

    // --- CAPTURE LOOP ---
    while (y < fullHeight && loopCount < maxLoops) {
        loopCount++;

        // Scroll to position
        const scrollResult = await new Promise(resolve => {
            chrome.tabs.sendMessage(tabId, { action: 'scrollTo', x: 0, y: y }, resolve);
        });

        const actualY = scrollResult.y;

        // Update fullHeight in case page grew
        if (scrollResult.fullHeight > fullHeight) {
            fullHeight = scrollResult.fullHeight;
        }

        // Capture visible tab
        const dataUrl = await new Promise(resolve => {
            setTimeout(() => {
                chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 90 }, (data) => {
                    if (chrome.runtime.lastError) {
                        console.warn('Capture failed:', chrome.runtime.lastError.message);
                        resolve(null);
                    } else {
                        resolve(data);
                    }
                });
            }, 250);
        });

        if (dataUrl) {
            captures.push({ y: actualY, dataUrl });
        }

        y += stepHeight;
    }

    // Finish
    chrome.tabs.sendMessage(tabId, { action: 'finishCapture' });

    // Store data and open result page
    const captureData = {
        captures,
        dims: dims, // Store all dims including captureType and bounding box
        timestamp: Date.now(),
        autoCopy: true,
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
