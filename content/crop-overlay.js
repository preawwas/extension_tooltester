/**
 * Crop Overlay — injected on demand for crop screenshot
 * Draws a full-viewport dim with a clear selection rect on a canvas.
 */
(function () {
    if (document.getElementById('__devtool-crop-overlay__')) return;

    const pixelRatio = window.devicePixelRatio || 1;

    /* ---- Overlay container (catches all pointer events) ---- */
    const overlay = document.createElement('div');
    overlay.id = '__devtool-crop-overlay__';
    overlay.style.cssText = [
        'position:fixed', 'top:0', 'left:0',
        'width:100vw', 'height:100vh',
        'z-index:2147483647',
        'cursor:crosshair',
        'user-select:none',
    ].join(';');

    /* ---- Canvas for dim + selection visuals ---- */
    const cvs = document.createElement('canvas');
    cvs.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    overlay.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    /* ---- Instruction hint ---- */
    const hint = document.createElement('div');
    hint.style.cssText = [
        'position:fixed', 'top:12px', 'left:50%',
        'transform:translateX(-50%)',
        'background:#1e293b', 'color:#fff',
        'padding:6px 16px', 'border-radius:6px',
        'font:600 13px/1.5 -apple-system,sans-serif',
        'pointer-events:none', 'z-index:2147483648',
        'letter-spacing:0.2px',
    ].join(';');
    hint.textContent = 'Drag to select area  —  Esc to cancel';
    overlay.appendChild(hint);

    document.documentElement.appendChild(overlay);

    let startX = 0, startY = 0, curX = 0, curY = 0, active = false;

    /* ---- Drawing ---- */
    function draw() {
        const W = cvs.width, H = cvs.height;
        ctx.clearRect(0, 0, W, H);

        /* Dim whole viewport */
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);

        if (active) {
            const x = Math.min(startX, curX);
            const y = Math.min(startY, curY);
            const w = Math.abs(curX - startX);
            const h = Math.abs(curY - startY);

            if (w > 1 && h > 1) {
                /* Punch clear hole for selection */
                ctx.clearRect(x, y, w, h);

                /* Selection border */
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);

                /* Corner handles */
                const handles = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
                ctx.fillStyle = '#3b82f6';
                handles.forEach(([hx, hy]) => {
                    ctx.beginPath();
                    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
                    ctx.fill();
                });

                /* Size label */
                const label = `${Math.round(w)} × ${Math.round(h)}`;
                ctx.font = 'bold 12px -apple-system, sans-serif';
                const labelW = ctx.measureText(label).width + 12;
                const labelX = Math.max(0, Math.min(x, W - labelW - 2));
                const labelY = y > 24 ? y - 6 : y + h + 20;
                ctx.fillStyle = '#3b82f6';
                ctx.beginPath();
                ctx.roundRect(labelX, labelY - 17, labelW, 20, 4);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillText(label, labelX + 6, labelY - 3);
            }
        }
    }

    /* Initial dim draw */
    draw();

    /* ---- Cleanup ---- */
    function cleanup() {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (e.key === 'Escape') cleanup();
    }
    document.addEventListener('keydown', onKey);

    /* ---- Mouse events ---- */
    overlay.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        active = true;
        startX = curX = e.clientX;
        startY = curY = e.clientY;
        draw();
    });

    overlay.addEventListener('mousemove', e => {
        curX = e.clientX;
        curY = e.clientY;
        if (active) draw();
    });

    overlay.addEventListener('mouseup', e => {
        if (!active) return;
        active = false;
        e.preventDefault();

        const x = Math.min(startX, e.clientX);
        const y = Math.min(startY, e.clientY);
        const width = Math.abs(e.clientX - startX);
        const height = Math.abs(e.clientY - startY);

        if (width < 5 || height < 5) { cleanup(); return; }

        /* Hide overlay before screenshot so it's not in the capture */
        overlay.style.visibility = 'hidden';

        setTimeout(() => {
            chrome.runtime.sendMessage({
                action: 'cropCaptureReady',
                rect: { x, y, width, height },
                pixelRatio,
                windowWidth: window.innerWidth,
                windowHeight: window.innerHeight,
            });
            cleanup();
        }, 80);
    });
})();
