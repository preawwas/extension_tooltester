
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const loading = document.getElementById('loading');
    const previewContainer = document.getElementById('preview-container');
    const actions = document.getElementById('actions');
    const btnDownload = document.getElementById('btn-download');
    const btnDelete = document.getElementById('btn-delete');

    chrome.storage.local.get(['latestScreenshot'], (result) => {
        const data = result.latestScreenshot;
        if (!data || !data.captures || data.captures.length === 0) {
            loading.textContent = 'No screenshot data found.';
            return;
        }

        const { captures, dims } = data;
        const { fullWidth, fullHeight, windowWidth, windowHeight, pixelRatio, captureType } = dims;

        // Ensure valid dimensions
        if (!fullWidth || !fullHeight || !pixelRatio) {
            loading.textContent = 'Invalid screenshot dimensions.';
            console.error('Invalid dims:', dims);
            return;
        }

        // Determine Canvas Size
        // Restrict to Window Width to avoid empty white space on right if page has horizontal overflow but we didn't scroll it.
        const effectiveWidth = windowWidth;

        canvas.width = effectiveWidth * pixelRatio;
        canvas.height = fullHeight * pixelRatio;

        // Fill with white background (to handle transparent pages)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw segments
        let imagesLoaded = 0;
        let hasError = false;
        let canvasCursorY = 0;
        let safetyTimeout = null;

        const checkDone = () => {
            imagesLoaded++;
            if (imagesLoaded === captures.length) {
                loading.style.display = 'none';
                if (safetyTimeout) clearTimeout(safetyTimeout);

                if (hasError) {
                    const err = document.createElement('div');
                    err.style.color = 'red';
                    err.style.textAlign = 'center';
                    err.textContent = 'Some segments failed to load.';
                    previewContainer.prepend(err);
                }
                previewContainer.style.display = 'block';
                actions.style.display = 'flex';
            }
        };

        // SAFETY TIMEOUT: Force completion after 10 seconds if something hangs
        safetyTimeout = setTimeout(() => {
            if (loading.style.display !== 'none') {
                console.warn('Screenshot processing timed out. Forcing display.');
                loading.style.display = 'none';
                const err = document.createElement('div');
                err.style.color = '#f59e0b';
                err.textContent = 'Processing timed out. Showing partial result.';
                previewContainer.prepend(err);
                previewContainer.style.display = 'block';
                actions.style.display = 'flex';
            }
        }, 10000);

        // Sort captures by Y just in case
        captures.sort((a, b) => a.y - b.y);

        captures.forEach((capture, index) => {
            if (!capture.dataUrl) {
                console.warn('Skipping empty capture frame', index);
                checkDone();
                return;
            }

            const img = new Image();
            img.onload = () => {
                try {
                    const logicalY = capture.y * pixelRatio;

                    if (captureType === 'element') {
                        // SMART STITCHING (APPEND ONLY)
                        const drawY = Math.max(canvasCursorY, logicalY);
                        const skipTop = drawY - logicalY;
                        const drawH = img.height - skipTop;

                        if (drawH > 0) {
                            ctx.drawImage(img,
                                0, skipTop, img.width, drawH,
                                0, drawY, img.width, drawH
                            );
                            canvasCursorY = Math.max(canvasCursorY, drawY + drawH);
                        }
                    } else {
                        // WINDOW MODE
                        ctx.drawImage(img, 0, logicalY);
                    }
                } catch (e) {
                    console.error('Error drawing segment', index, e);
                    hasError = true;
                }
                checkDone();
            };
            img.onerror = () => {
                console.error('Failed to load image segment', index);
                hasError = true;
                checkDone();
            };
            img.src = capture.dataUrl;
        });
    });

    btnDownload.addEventListener('click', () => {
        try {
            const link = document.createElement('a');
            link.download = `screenshot-${Date.now()}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (e) {
            console.error('Download error:', e);
            alert('Failed to generate image for download.');
        }
    });

    btnDelete.addEventListener('click', () => {
        chrome.storage.local.remove('latestScreenshot', () => {
            window.close();
        });
    });
});
