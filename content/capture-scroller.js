
// Capture Scroller Logic
(function () {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let targetElement = null;
    let originalOverflow = '';
    let captureType = 'window'; // 'window' | 'element'
    let fixedElements = [];
    let fixedHidden = false;
    let rootScrollableAtInit = false;
    let scrollbarWidthAtInit = 0;
    let nativeScrollbarWidth = 0;

    function measureNativeScrollbarWidth() {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:120px;height:120px;overflow:scroll;';
        document.body.appendChild(probe);
        const w = probe.offsetWidth - probe.clientWidth;
        probe.remove();
        return Math.max(0, w || 0);
    }

    function collectFixedElements() {
        fixedElements = [];
        const all = document.querySelectorAll('*');
        all.forEach((el) => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') {
                fixedElements.push({
                    el,
                    visibility: el.style.visibility,
                });
            }
        });
    }

    function setFixedElementsHidden(hidden) {
        if (hidden === fixedHidden) return;
        if (fixedElements.length === 0) collectFixedElements();

        fixedElements.forEach(({ el, visibility }) => {
            if (hidden) {
                el.style.setProperty('visibility', 'hidden', 'important');
            } else {
                el.style.visibility = visibility;
            }
        });
        fixedHidden = hidden;
    }

    function injectStyle() {
        if (document.getElementById('capture-style-hide-scroll')) return;
        const style = document.createElement('style');
        style.id = 'capture-style-hide-scroll';
        style.innerHTML = `
            * {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }
            *::-webkit-scrollbar {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeStyle() {
        const s = document.getElementById('capture-style-hide-scroll');
        if (s) s.remove();

        if (targetElement) {
            targetElement.classList.remove('capture-hide-scroll');
            targetElement.style.overflow = originalOverflow;
        }
    }

    function isScrollable(ele) {
        const hasScrollableContent = ele.scrollHeight > ele.clientHeight;
        const overflowY = window.getComputedStyle(ele).overflowY;
        const isOverflowHidden = overflowY.indexOf('hidden') !== -1;
        return hasScrollableContent && !isOverflowHidden;
    }

    function isRootScrollable() {
        const body = document.body;
        const html = document.documentElement;
        const scrollHeight = Math.max(body.scrollHeight, html.scrollHeight);
        const clientHeight = html.clientHeight;
        return scrollHeight > clientHeight + 10;
    }

    function findMainScrollable() {
        const candidates = document.querySelectorAll('div, main, section, article, aside, ul');
        let bestCandidate = null;
        let maxArea = 0;
        const windowArea = window.innerHeight * window.innerWidth;

        candidates.forEach(el => {
            if (isScrollable(el)) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const visibleArea = rect.width * rect.height;
                    if (visibleArea > windowArea * 0.3) {
                        if (visibleArea > maxArea) {
                            maxArea = visibleArea;
                            bestCandidate = el;
                        }
                    }
                }
            }
        });

        return bestCandidate;
    }

    function findPrimaryContentRect() {
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const candidates = document.querySelectorAll('main, [role="main"], #content, .content, .main, article, section, div');

        let best = null;
        let bestScore = 0;

        candidates.forEach((el) => {
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' || style.position === 'sticky') return;
            if (style.display === 'none' || style.visibility === 'hidden') return;

            const rect = el.getBoundingClientRect();
            if (rect.width < viewportW * 0.3 || rect.height < viewportH * 0.3) return;

            const left = Math.max(0, rect.left);
            const top = Math.max(0, rect.top);
            const right = Math.min(viewportW, rect.right);
            const bottom = Math.min(viewportH, rect.bottom);
            const w = right - left;
            const h = bottom - top;
            if (w <= 0 || h <= 0) return;

            const area = w * h;
            const centerX = left + w / 2;
            const centerPenalty = Math.abs(centerX - viewportW / 2) / viewportW;
            const hasLongContent = el.scrollHeight > viewportH * 1.1 || el.scrollHeight > el.clientHeight * 1.2;

            const score = area * (hasLongContent ? 1.4 : 1.0) * (1 - centerPenalty * 0.35);

            if (score > bestScore) {
                bestScore = score;
                best = { x: Math.round(left), y: Math.round(top), w: Math.round(w), h: Math.round(h) };
            }
        });

        if (!best) {
            return { x: 0, y: 0, w: viewportW, h: viewportH };
        }

        return best;
    }

    // Get Dimensions
    function getDimensions() {
        const body = document.body;
        const html = document.documentElement;
        const pageScrollbarWidth = rootScrollableAtInit
            ? Math.max(scrollbarWidthAtInit, nativeScrollbarWidth)
            : 0;

        // Reset
        targetElement = null;
        captureType = 'window';

        // 1. Check Root Scroll FIRST
        if (isRootScrollable()) {
            const fullHeight = Math.max(
                body.scrollHeight, body.offsetHeight,
                html.clientHeight, html.scrollHeight, html.offsetHeight
            );

            const fullWidth = Math.max(
                body.scrollWidth, body.offsetWidth,
                html.clientWidth, html.scrollWidth, html.offsetWidth
            );

            return {
                captureType: 'window',
                fullHeight,
                fullWidth,
                visibleHeight: window.innerHeight,
                visibleWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                windowWidth: window.innerWidth,
                pixelRatio: window.devicePixelRatio,
                scrollbarWidth: pageScrollbarWidth,
                contentRect: findPrimaryContentRect(),
                x: 0, y: 0, w: window.innerWidth, h: window.innerHeight
            };
        }

        // 2. Only if Root is NOT scrollable, look for inner scroller
        const foundEl = findMainScrollable();

        let dims = {};

        if (foundEl) {
            targetElement = foundEl;
            captureType = 'element';

            originalOverflow = targetElement.style.overflow;
            targetElement.classList.add('capture-hide-scroll');

            const rect = targetElement.getBoundingClientRect();

            dims = {
                captureType: 'element',
                fullHeight: targetElement.scrollHeight,
                fullWidth: window.innerWidth,
                visibleHeight: targetElement.clientHeight,
                visibleWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                windowWidth: window.innerWidth,
                pixelRatio: window.devicePixelRatio,
                x: 0,
                y: rect.y,
                w: window.innerWidth,
                h: rect.height
            };
        } else {
            const fullHeight = Math.max(
                body.scrollHeight, body.offsetHeight,
                html.clientHeight, html.scrollHeight, html.offsetHeight
            );

            const fullWidth = Math.max(
                body.scrollWidth, body.offsetWidth,
                html.clientWidth, html.scrollWidth, html.offsetWidth
            );

            dims = {
                captureType: 'window',
                fullHeight,
                fullWidth,
                visibleHeight: window.innerHeight,
                visibleWidth: window.innerWidth,
                windowHeight: window.innerHeight,
                windowWidth: window.innerWidth,
                pixelRatio: window.devicePixelRatio,
                scrollbarWidth: pageScrollbarWidth,
                contentRect: findPrimaryContentRect(),
                x: 0, y: 0, w: window.innerWidth, h: window.innerHeight
            };
        }

        return dims;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'initCapture') {
            // Measure BEFORE hiding scrollbars, otherwise width becomes zero.
            rootScrollableAtInit = isRootScrollable();
            scrollbarWidthAtInit = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
            nativeScrollbarWidth = measureNativeScrollbarWidth();

            injectStyle();
            collectFixedElements();
            setFixedElementsHidden(false);
            // Small delay for CSS to take effect
            setTimeout(() => {
                const dims = getDimensions();
                sendResponse(dims);
            }, 120);
            return true;
        } else if (request.action === 'scrollTo') {
            if (targetElement && captureType === 'element') {
                targetElement.scrollTo(request.x, request.y);
            } else {
                // Keep fixed/sticky UI in first shot (y=0), hide for subsequent shots.
                setFixedElementsHidden((request.y || 0) > 0);
                window.scrollTo(request.x, request.y);
            }

            // Wait for scroll, fixed/sticky visibility updates, and potential lazy loading
            sleep(320).then(() => {
                let currentX, currentY, currentFullHeight;

                if (targetElement && captureType === 'element') {
                    currentX = targetElement.scrollLeft;
                    currentY = targetElement.scrollTop;
                    currentFullHeight = targetElement.scrollHeight;
                } else {
                    currentX = window.scrollX;
                    currentY = window.scrollY;
                    const b = document.body;
                    const h = document.documentElement;
                    currentFullHeight = Math.max(
                        b.scrollHeight, b.offsetHeight,
                        h.clientHeight, h.scrollHeight, h.offsetHeight
                    );
                }

                sendResponse({
                    status: 'scrolled',
                    x: currentX,
                    y: currentY,
                    fullHeight: currentFullHeight
                });
            });

            return true;
        } else if (request.action === 'finishCapture') {
            setFixedElementsHidden(false);
            removeStyle();
            if (targetElement && captureType === 'element') {
                targetElement.scrollTo(0, 0);
            } else {
                window.scrollTo(0, 0);
            }
            sendResponse({ status: 'finished' });
        }

        return true;
    });
})();
