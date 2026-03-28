document.addEventListener('DOMContentLoaded', () => {
    const btnFullPage = document.getElementById('btn-full-page');

    if (btnFullPage) {
        btnFullPage.addEventListener('click', () => {
            // Send message to background to start the process
            chrome.runtime.sendMessage({ action: 'startCapture' });
            window.close(); // Close popup
        });
    }

    // Persistence Logic
    const persistChk = document.getElementById('chk-persistence');
    chrome.storage.local.get(['persistentMode'], (result) => {
        persistChk.checked = result.persistentMode || false;
    });

    persistChk.addEventListener('change', () => {
        const isChecked = persistChk.checked;
        chrome.storage.local.set({ persistentMode: isChecked });
    });

    // Feature 0: Voice Recorder
    const voiceBtn = document.getElementById('btn-voice-recorder');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleVoiceRecorder' });
                window.close();
            });
        });
    }

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
            fontResult.innerHTML = '<p style="color:#64748b;font-size:12px;">Scanning...</p>';
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
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="btn-css-color" style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        text-align: left;
                    ">
                        <span style="font-size: 18px;">🎨</span>
                        <div>
                            <div style="font-weight: 600; color: #1e293b;">CSS Color</div>
                            <div style="font-size: 11px; color: #64748b;">ดึงค่า CSS (text, bg, border)</div>
                        </div>
                    </button>
                    <button id="btn-eyedropper" style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 12px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 13px;
                        text-align: left;
                    ">
                        <span style="font-size: 18px;">💧</span>
                        <div>
                            <div style="font-weight: 600; color: #1e293b;">Eyedropper</div>
                            <div style="font-size: 11px; color: #64748b;">ดูดสีจาก pixel จริง</div>
                        </div>
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
                            <div style="text-align: center; padding: 16px;">
                                <div style="
                                    width: 60px;
                                    height: 60px;
                                    background: ${result.sRGBHex};
                                    border-radius: 8px;
                                    margin: 0 auto 12px;
                                    border: 2px solid #e2e8f0;
                                "></div>
                                <div style="font-size: 18px; font-weight: 700; color: #1e293b;">${result.sRGBHex}</div>
                                <div style="font-size: 12px; color: #10b981; margin-top: 8px;">✓ Copied to clipboard!</div>
                            </div>
                        `;
                    } catch (e) {
                        // User cancelled
                        closeAllPanels();
                    }
                } else {
                    colorResult.innerHTML = `
                        <div style="padding: 12px; text-align: center; color: #ef4444;">
                            ⚠️ Eyedropper API ไม่รองรับใน browser นี้
                        </div>
                    `;
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
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="chk-cache" checked> Cache
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="chk-cookies" checked> Cookies
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="chk-storage" checked> Local Storage
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="chk-history"> History
                    </label>
                    <button id="btn-confirm-clear" style="
                        margin-top: 8px;
                        padding: 10px;
                        background: #6366f1;
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        font-weight: 500;
                        cursor: pointer;
                    ">Clear Selected</button>
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
                    btn.style.background = '#10b981';
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
        document.querySelectorAll('.premium-btn').forEach(el => el.classList.remove('active'));
    }

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
            resultArea.innerHTML = '<p style="color:#64748b;font-size:12px;">No fonts found.</p>';
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
