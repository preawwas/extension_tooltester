document.addEventListener('DOMContentLoaded', () => {
    // Feature 7: Screenshot (with submenu)
    const screenshotBtn = document.getElementById('btn-screenshot');
    const screenshotResult = document.getElementById('result-screenshot');

    screenshotBtn.addEventListener('click', () => {
        const isOpen = !screenshotResult.classList.contains('hidden');
        closeAllPanels();
        if (!isOpen) {
            screenshotBtn.classList.add('active');
            screenshotResult.classList.remove('hidden');
        }
    });

    // 1. Crop Screenshot
    document.getElementById('btn-crop-screenshot').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startCropCapture' });
        window.close();
    });

    // 2. Screenshot (Browser) — visible area of current tab
    document.getElementById('btn-browser-screenshot').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'captureVisible' });
        window.close();
    });

    // 3. Full Page Screenshot (original behavior)
    document.getElementById('btn-fullpage-screenshot').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startCapture' });
        window.close();
    });

    // Quick Screenshot (shot) — immediate visible capture
    document.getElementById('btn-quick-screenshot').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'quickCapture' });
        window.close();
    });

    // Persistence Logic
    const persistChk = document.getElementById('chk-persistence');
    chrome.storage.local.get(['persistentMode'], (result) => {
        persistChk.checked = result.persistentMode || false;
    });

    persistChk.addEventListener('change', () => {
        const isChecked = persistChk.checked;
        chrome.storage.local.set({ persistentMode: isChecked });
    });

    // Feature 0: Voice Recorder (with submenu)
    const voiceBtn = document.getElementById('btn-voice-recorder');
    const voiceResult = document.getElementById('result-voice-recorder');

    voiceBtn.addEventListener('click', () => {
        const isOpen = !voiceResult.classList.contains('hidden');
        closeAllPanels();
        if (!isOpen) {
            voiceBtn.classList.add('active');
            voiceResult.classList.remove('hidden');
        }
    });

    // 0.1 Mic only
    document.getElementById('btn-voice-mic').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleVoiceRecorder', mode: 'mic' });
            window.close();
        });
    });

    // 0.2 Desktop audio
    document.getElementById('btn-voice-desktop').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleVoiceRecorder', mode: 'desktop' });
            window.close();
        });
    });

    // Feature 1: Font Scanner
    const fontBtn = document.getElementById('btn-font-scanner');
    const fontResult = document.getElementById('result-font-scanner');

    fontBtn.addEventListener('click', () => {
        // Toggle the panel display
        const isOpen = !fontResult.classList.contains('hidden');
        closeAllPanels();

        if (!isOpen) {
            fontBtn.classList.add('active');
            fontResult.classList.remove('hidden');
            fontResult.innerHTML = '<p class="panel-msg">Scanning…</p>';
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'scanFonts' });
            });
        }
    });

    // Feature 2: Inspector
    document.getElementById('btn-inspector').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleInspector' });
            window.close();
        });
    });

    // Feature 2.5: Locator Recorder
    const locatorBtn = document.getElementById('btn-locator-recorder');
    const locatorResult = document.getElementById('result-locator-recorder');

    locatorBtn.addEventListener('click', () => {
        const isOpen = !locatorResult.classList.contains('hidden');
        closeAllPanels();

        if (!isOpen) {
            locatorBtn.classList.add('active');
            locatorResult.classList.remove('hidden');

            chrome.storage.local.get(['mteLocatorRecords'], (res) => {
                const n = Array.isArray(res.mteLocatorRecords) ? res.mteLocatorRecords.length : 0;
                const label = document.getElementById('locator-count-label');
                if (label) {
                    label.textContent = n > 0
                        ? `เก็บไว้แล้ว ${n} locator — กดเพื่อล้างทั้งหมด`
                        : 'ยังไม่มี locator ที่เก็บไว้';
                }
            });
        }
    });

    document.getElementById('btn-locator-start').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleLocatorRecorder' });
            window.close();
        });
    });

    document.getElementById('btn-locator-clear').addEventListener('click', () => {
        chrome.storage.local.set({ mteLocatorRecords: [] }, () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'clearLocatorRecords' }).catch(() => { });
            });
            const label = document.getElementById('locator-count-label');
            if (label) label.textContent = '✓ ล้างเรียบร้อย';
        });
    });

    // Feature 3: Color Picker
    const colorBtn = document.getElementById('btn-color-picker');
    const colorResult = document.getElementById('result-color-picker');

    colorBtn.addEventListener('click', () => {
        const isOpen = !colorResult.classList.contains('hidden');
        closeAllPanels();

        if (!isOpen) {
            colorBtn.classList.add('active');
            colorResult.classList.remove('hidden');
            colorResult.innerHTML = `
                <div class="sub-list">
                    <button id="btn-css-color" class="sub-btn">
                        <span class="sub-icon" aria-hidden="true">🎨</span>
                        <span>
                            <span class="sub-title">CSS Color</span>
                            <span class="sub-desc">ดึงค่า CSS (text, bg, border)</span>
                        </span>
                    </button>
                    <button id="btn-eyedropper" class="sub-btn">
                        <span class="sub-icon" aria-hidden="true">💧</span>
                        <span>
                            <span class="sub-title">Eyedropper</span>
                            <span class="sub-desc">ดูดสีจาก pixel จริง</span>
                        </span>
                    </button>
                </div>
            `;

            // CSS Color Mode
            document.getElementById('btn-css-color').onclick = () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleColorPicker' });
                    window.close();
                });
            };

            // Eyedropper Mode
            document.getElementById('btn-eyedropper').onclick = async () => {
                if ('EyeDropper' in window) {
                    try {
                        const eyeDropper = new EyeDropper();
                        const result = await eyeDropper.open();
                        // Copy to clipboard
                        await navigator.clipboard.writeText(result.sRGBHex);
                        // Show result
                        colorResult.innerHTML = `
                            <div class="swatch-result">
                                <div class="swatch-chip"></div>
                                <div class="swatch-hex"></div>
                                <div class="swatch-note">✓ Copied to clipboard!</div>
                            </div>
                        `;
                        colorResult.querySelector('.swatch-chip').style.background = result.sRGBHex;
                        colorResult.querySelector('.swatch-hex').textContent = result.sRGBHex;
                    } catch (e) {
                        // User cancelled
                        closeAllPanels();
                    }
                } else {
                    colorResult.innerHTML =
                        '<p class="panel-msg is-error">⚠️ Eyedropper API ไม่รองรับใน browser นี้</p>';
                }
            };
        }
    });

    // Feature 4: Responsive Viewer
    document.getElementById('btn-responsive').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0].url;
            chrome.storage.local.set({ viewerUrl: url }, () => {
                chrome.tabs.create({ url: 'popup/viewer.html' });
            });
        });
    });

    // Feature 5: Clear Cache
    const cacheBtn = document.getElementById('btn-clear-cache');
    const cacheResult = document.getElementById('result-clear-cache');

    cacheBtn.addEventListener('click', () => {
        const isOpen = !cacheResult.classList.contains('hidden');
        closeAllPanels();

        if (!isOpen) {
            cacheBtn.classList.add('active');
            cacheResult.classList.remove('hidden');
            cacheResult.innerHTML = `
                <div class="sub-list">
                    <label class="check-row"><input type="checkbox" id="chk-cache" checked> Cache</label>
                    <label class="check-row"><input type="checkbox" id="chk-cookies" checked> Cookies</label>
                    <label class="check-row"><input type="checkbox" id="chk-storage" checked> Local Storage</label>
                    <label class="check-row"><input type="checkbox" id="chk-history"> History</label>
                    <button id="btn-confirm-clear" class="btn-block">Clear Selected</button>
                </div>
            `;

            document.getElementById('btn-confirm-clear').addEventListener('click', () => {
                const options = {
                    cache: document.getElementById('chk-cache').checked,
                    cookies: document.getElementById('chk-cookies').checked,
                    localStorage: document.getElementById('chk-storage').checked,
                    history: document.getElementById('chk-history').checked
                };

                chrome.runtime.sendMessage({ action: 'clearCache', options: options }, () => {
                    const btn = document.getElementById('btn-confirm-clear');
                    btn.textContent = '✓ Cleared!';
                    btn.classList.add('is-done');
                    setTimeout(() => {
                        closeAllPanels();
                    }, 1000);
                });
            });
        }
    });

    // Feature 6: Live Editor — directly open toolbar on page
    document.getElementById('btn-live-editor').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'showLiveEditorToolbar' });
            window.close();
        });
    });

    // Feature 7: API Activity Monitor
    document.getElementById('btn-api-monitor').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleApiMonitor' });
            window.close();
        });
    });

    // Helper: Close all panels
    function closeAllPanels() {
        document.querySelectorAll('.tool-result').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.premium-btn').forEach(el => {
            el.classList.remove('active');
            if (el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', 'false');
        });
    }

    // Keep aria-expanded in sync with the visual state after any menu click.
    // Runs in the bubble phase, so it sees the state the button handlers just set.
    document.querySelector('.tool-menu').addEventListener('click', () => {
        document.querySelectorAll('.premium-btn[aria-expanded]').forEach(btn => {
            btn.setAttribute('aria-expanded', String(btn.classList.contains('active')));
        });
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'fontScanResults') {
            renderFontResults(request.data);
        }
    });

    function renderFontResults(fonts) {
        const resultArea = document.getElementById('result-font-scanner');
        resultArea.innerHTML = '';

        if (fonts.length === 0) {
            resultArea.innerHTML = '<p class="panel-msg">No fonts found.</p>';
            return;
        }

        // Custom Font Input
        const inputRow = document.createElement('div');
        inputRow.className = 'custom-input-row';
        inputRow.innerHTML = `
            <input type="text" id="mte-custom-font-input" placeholder="Size (e.g. 16)" pattern="[0-9]*" inputmode="numeric">
            <button id="mte-custom-font-btn" class="btn-check">Check</button>
            <button id="mte-custom-font-clear" class="btn-clear">✕</button>
        `;
        resultArea.appendChild(inputRow);

        // Font Grid
        const grid = document.createElement('div');
        grid.className = 'font-grid';

        fonts.forEach(size => {
            const btn = document.createElement('button');
            btn.className = 'font-btn';
            btn.textContent = size;
            btn.onclick = () => {
                grid.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: size });
                });
            };
            grid.appendChild(btn);
        });
        resultArea.appendChild(grid);

        // Bind input events
        setTimeout(() => {
            // Restrict input to numbers only
            const input = document.getElementById('mte-custom-font-input');
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });

            document.getElementById('mte-custom-font-btn').onclick = () => {
                let val = document.getElementById('mte-custom-font-input').value.trim();
                if (val && /^\d+$/.test(val)) val += 'px';
                if (val) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: val });
                    });
                }
            };

            document.getElementById('mte-custom-font-clear').onclick = () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: null });
                    document.getElementById('mte-custom-font-input').value = '';
                    grid.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                });
            };
        }, 0);
    }
});
