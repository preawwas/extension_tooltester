document.addEventListener('DOMContentLoaded', () => {
    const resultArea = document.getElementById('result-area');

    // Persistence Logic
    const persistChk = document.getElementById('chk-persistence');
    chrome.storage.local.get(['persistentMode'], (result) => {
        persistChk.checked = result.persistentMode || false;
    });

    persistChk.addEventListener('change', () => {
        const isChecked = persistChk.checked;
        chrome.storage.local.set({ persistentMode: isChecked });
        // Optional: Notify background immediately, or just rely on storage
    });

    // Feature 1: Font Scanner
    document.getElementById('btn-font-scanner').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'scanFonts' });
        });
    });

    // Feature 2: Inspector
    document.getElementById('btn-inspector').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleInspector' });
            window.close(); // Close popup to let user interact with page
        });
    });

    // Feature 3: Color Picker
    document.getElementById('btn-color-picker').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleColorPicker' });
            window.close();
        });
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
    document.getElementById('btn-clear-cache').addEventListener('click', () => {
        const resultArea = document.getElementById('result-area');
        resultArea.classList.remove('hidden');
        resultArea.innerHTML = `
        <h3 class="font-bold mb-2 p-2">Clear Browsing Data</h3>
        <div class="flex col gap-2 p-2">
            <label class="flex items-center gap-2"><input type="checkbox" id="chk-cache" checked> Cache</label>
            <label class="flex items-center gap-2"><input type="checkbox" id="chk-cookies" checked> Cookies</label>
            <label class="flex items-center gap-2"><input type="checkbox" id="chk-storage" checked> Local Storage</label>
            <label class="flex items-center gap-2"><input type="checkbox" id="chk-history"> History</label>
            <button id="btn-confirm-clear" class="btn btn-primary w-full mt-2">Clear Selected</button>
        </div>
    `;

        document.getElementById('btn-confirm-clear').addEventListener('click', () => {
            const options = {
                cache: document.getElementById('chk-cache').checked,
                cookies: document.getElementById('chk-cookies').checked,
                localStorage: document.getElementById('chk-storage').checked,
                history: document.getElementById('chk-history').checked
            };

            chrome.runtime.sendMessage({ action: 'clearCache', options: options }, (response) => {
                const btn = document.getElementById('btn-confirm-clear');
                btn.textContent = 'Cleared!';
                btn.classList.replace('btn-primary', 'btn-success'); // Assuming success class or just style
                btn.style.borderColor = 'var(--success-color)';
                btn.style.backgroundColor = 'var(--success-color)';
                setTimeout(() => {
                    resultArea.classList.add('hidden');
                }, 1500);
            });
        });
    });

    // Feature 6: API Activity Monitor
    document.getElementById('btn-api-monitor').addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleApiMonitor' });
            window.close();
        });
    });



    // Listen for messages from content script (e.g., font results)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'fontScanResults') {
            renderFontResults(request.data);
        }
    });

    function renderFontResults(fonts) {
        const resultArea = document.getElementById('result-area');
        resultArea.innerHTML = '';
        resultArea.classList.toggle('hidden', fonts.length === 0);

        if (fonts.length === 0) {
            resultArea.innerHTML = '<p class="text-muted p-2">No fonts found.</p>';
            return;
        }

        const header = document.createElement('h3');
        header.textContent = 'Font Sizes';
        header.className = 'font-bold mb-2 p-2';
        resultArea.appendChild(header);

        // Custom Font Input
        const customInputContainer = document.createElement('div');
        customInputContainer.className = 'flex gap-2 p-2 mb-2 border-b';
        customInputContainer.innerHTML = `
            <input type="text" id="mte-custom-font-input" placeholder="Size (e.g. 16)" class="input flex-1 px-2 py-1 border rounded text-sm text-black">
            <button id="mte-custom-font-btn" class="btn btn-sm btn-primary">Check</button>
            <button id="mte-custom-font-clear" class="btn btn-sm" style="color: #ef4444; border-color: #ef4444;">✕</button>
        `;
        resultArea.appendChild(customInputContainer);

        // Bind event for custom font button
        // Need a slight delay or direct binding after append
        setTimeout(() => {
            // Check Button
            document.getElementById('mte-custom-font-btn').onclick = () => {
                let val = document.getElementById('mte-custom-font-input').value.trim();
                if (val && /^\d+$/.test(val)) val += 'px';

                if (val) {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: val });
                    });
                }
            };

            // Clear Button
            document.getElementById('mte-custom-font-clear').onclick = () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: null }); // null clears it
                    document.getElementById('mte-custom-font-input').value = '';
                });
            };
        }, 0);

        const list = document.createElement('div');
        list.className = 'grid gap-2';
        list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';

        fonts.forEach(size => {
            const btn = document.createElement('button');
            btn.className = 'btn text-sm';
            btn.style.justifyContent = 'center';
            btn.textContent = size;
            btn.onclick = () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightFont', fontSize: size });
                });
            };
            list.appendChild(btn);
        });
        resultArea.appendChild(list);
    }
});
