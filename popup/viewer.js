document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['viewerUrl'], (result) => {
        const url = result.viewerUrl;
        if (url) {
            document.getElementById('target-url').textContent = url;
            const frames = document.querySelectorAll('iframe');
            frames.forEach(frame => {
                frame.src = url;
            });
        }
    });

    const rotateBtn = document.getElementById('rotate-btn');
    let isRotated = false;

    rotateBtn.addEventListener('click', () => {
        isRotated = !isRotated;
        const frames = document.querySelectorAll('iframe');
        frames.forEach(frame => {
            const w = frame.getAttribute('width');
            const h = frame.getAttribute('height');
            // Swap
            frame.setAttribute('width', h);
            frame.setAttribute('height', w);
        });
    });

    // Custom Device Logic
    document.getElementById('add-device-btn').addEventListener('click', () => {
        const w = document.getElementById('custom-w').value;
        const h = document.getElementById('custom-h').value;

        if (w && h) {
            const grid = document.querySelector('.view-grid');
            const wrapper = document.createElement('div');
            wrapper.className = 'device-wrapper';

            // Get current URL from one of the frames or storage
            chrome.storage.local.get(['viewerUrl'], (result) => {
                const url = result.viewerUrl;
                wrapper.innerHTML = `
                    <div class="device-label">Custom (${w}x${h})</div>
                    <iframe class="device-frame" width="${w}" height="${h}" src="${url}"></iframe>
                 `;
                grid.appendChild(wrapper);
            });
        }
    });
});
