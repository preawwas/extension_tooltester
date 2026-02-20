
// Capture Scroller Logic
(function () {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let targetElement = null;
    let originalOverflow = '';
    let captureType = 'window'; // 'window' | 'element'

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

    // Get Dimensions
    function getDimensions() {
        const body = document.body;
        const html = document.documentElement;

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
                x: 0, y: 0, w: window.innerWidth, h: window.innerHeight
            };
        }

        return dims;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'initCapture') {
            injectStyle();
            // Small delay for CSS to take effect
            setTimeout(() => {
                const dims = getDimensions();
                sendResponse(dims);
            }, 100);
            return true;
        } else if (request.action === 'scrollTo') {
            if (targetElement && captureType === 'element') {
                targetElement.scrollTo(request.x, request.y);
            } else {
                window.scrollTo(request.x, request.y);
            }

            // Wait for scroll and potential lazy loading
            sleep(250).then(() => {
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
