const standardDevices = {
    mobile: [
        { name: 'iPhone SE', w: 375, h: 667 },
        { name: 'iPhone XR/11', w: 414, h: 896 },
        { name: 'iPhone 12/13/14 Pro', w: 390, h: 844 },
        { name: 'iPhone 14 Pro Max', w: 430, h: 932 },
        { name: 'Pixel 7', w: 412, h: 915 },
        { name: 'Galaxy S8+', w: 360, h: 740 },
        { name: 'Galaxy S20 Ultra', w: 412, h: 915 }
    ],
    tablet: [
        { name: 'iPad Mini', w: 768, h: 1024 },
        { name: 'iPad Air', w: 820, h: 1180 },
        { name: 'iPad Pro 11"', w: 834, h: 1194 },
        { name: 'iPad Pro 12.9"', w: 1024, h: 1366 },
        { name: 'Surface Pro 7', w: 912, h: 1368 }
    ],
    desktop: [
        { name: 'Laptop', w: 1024, h: 768 },
        { name: 'Laptop L', w: 1440, h: 900 },
        { name: 'FHD', w: 1920, h: 1080 },
        { name: '2K', w: 2560, h: 1440 }
    ]
};

let currentWidth = 375;
let currentHeight = 667;
let isRotated = false;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load URL
    chrome.storage.local.get(['viewerUrl'], (result) => {
        const url = result.viewerUrl;
        if (url) {
            const frame = document.getElementById('main-frame');
            if (frame) frame.src = url;
        }
    });

    // 2. Render Device Lists
    renderStandardDevices();
    loadAndRenderCustomDevices();

    // 3. Select Default (Laptop if available, else first mobile)
    // Since Desktop is fast first now, let's pick first desktop
    if (standardDevices.desktop && standardDevices.desktop.length > 0) {
        selectDevice(standardDevices.desktop[0].name, standardDevices.desktop[0].w, standardDevices.desktop[0].h);
    } else {
        selectDevice(standardDevices.mobile[0].name, standardDevices.mobile[0].w, standardDevices.mobile[0].h);
    }

    // 4. Rotate Handler
    document.getElementById('rotate-btn').addEventListener('click', () => {
        isRotated = !isRotated;
        updateFrameSize();
    });

    // 5. Add Custom Device Handler
    document.getElementById('add-device-btn').addEventListener('click', () => {
        const nameInput = document.getElementById('custom-name');
        const wInput = document.getElementById('custom-w');
        const hInput = document.getElementById('custom-h');

        const name = nameInput.value.trim() || 'Custom';
        const w = parseInt(wInput.value);
        const h = parseInt(hInput.value);

        if (w && h && w > 0 && h > 0) {
            addCustomDevice(name, w, h);
            // Clear inputs
            nameInput.value = '';
            wInput.value = '';
            hInput.value = '';
        }
    });

    // 6. Zoom Handler
    document.getElementById('zoom-select').addEventListener('change', (e) => {
        const scale = parseFloat(e.target.value);
        updateZoom(scale);
    });
});

function updateZoom(scale) {
    const frame = document.getElementById('main-frame');
    frame.style.transform = `scale(${scale})`;
    // Adjust margin/container size if needed, but transform: scale usually needs spacing
    // Since we use transform-origin top center, it should just shrink in place.
    // However, the container triggers scroll based on original size (sometimes).
    // Actually, transform doesn't affect flow layout.
    // To make scroll work nicely with zoom, we might need to wrap it specifically or just let it be.
    // For now, scaling down works visually.

    // Optional: Update margin bottom to reduce white space if scaled down?
    // frame.style.marginBottom = `-${(1 - scale) * 100}%` ... tricky calculation.
    // Simpler: Just scale.
}

function renderStandardDevices() {
    renderList('list-mobile', standardDevices.mobile);
    renderList('list-tablet', standardDevices.tablet);
    renderList('list-desktop', standardDevices.desktop);
}

function renderList(containerId, devices, isCustom = false) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    devices.forEach((dev, index) => {
        const btn = document.createElement('div');
        btn.className = 'device-item';
        btn.innerHTML = `
            <span class="device-name">${dev.name}</span>
            <span class="device-dims">${dev.w}x${dev.h}</span>
            ${isCustom ? `<button class="delete-custom" data-index="${index}">×</button>` : ''}
        `;

        btn.onclick = (e) => {
            // If click was on delete button, don't select
            if (e.target.classList.contains('delete-custom')) return;

            // Remove active class from all
            document.querySelectorAll('.device-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            isRotated = false; // Reset rotation on switch
            selectDevice(dev.name, dev.w, dev.h);
        };

        if (isCustom) {
            btn.querySelector('.delete-custom').onclick = (e) => {
                e.stopPropagation();
                removeCustomDevice(index);
            };
        }

        container.appendChild(btn);
    });
}

function selectDevice(name, w, h) {
    currentWidth = w;
    currentHeight = h;
    document.getElementById('current-device-name').textContent = name;
    updateFrameSize();
}

function updateFrameSize() {
    const frame = document.getElementById('main-frame');

    let finalW = isRotated ? currentHeight : currentWidth;
    let finalH = isRotated ? currentWidth : currentHeight;

    frame.style.width = finalW + 'px';
    frame.style.height = finalH + 'px';

    document.getElementById('current-device-dims').textContent = `${finalW} x ${finalH}`;

    checkAutoZoom(finalW);
}

function checkAutoZoom(frameW) {
    const container = document.querySelector('.viewport-container');
    if (!container) return;

    // padding is 80px on each side = 160px total
    // We use a safe buffer to ensure scrollbars don't incorrectly trigger or overlap too much
    const availableW = container.clientWidth - 160;

    let newScale = 1;

    if (frameW > availableW) {
        // Try 0.75
        if (frameW * 0.75 <= availableW) {
            newScale = 0.75;
        } else {
            // Default to 0.5 if 0.75 is still too big
            newScale = 0.5;
        }
    }

    // Apply
    updateZoom(newScale);

    // Sync Dropdown
    const dd = document.getElementById('zoom-select');
    if (dd) {
        dd.value = newScale.toString();
    }
}

// Custom Device Storage Logic
function loadAndRenderCustomDevices() {
    chrome.storage.local.get(['customDevices'], (result) => {
        const customs = result.customDevices || [];
        renderList('list-custom', customs, true);
    });
}

function addCustomDevice(name, w, h) {
    chrome.storage.local.get(['customDevices'], (result) => {
        const customs = result.customDevices || [];
        customs.push({ name, w, h });
        chrome.storage.local.set({ customDevices: customs }, () => {
            loadAndRenderCustomDevices();
            // Auto select new device
            // (Optional, maybe user wants to add multiple first)
        });
    });
}

function removeCustomDevice(index) {
    chrome.storage.local.get(['customDevices'], (result) => {
        const customs = result.customDevices || [];
        customs.splice(index, 1);
        chrome.storage.local.set({ customDevices: customs }, () => {
            loadAndRenderCustomDevices();
        });
    });
}
