/**
 * Screenshot Editor Engine
 * Full annotation editor with drawing tools, layer system, undo/redo, and viewport controls.
 */
(function () {
    'use strict';

    // ===== STATE =====
    const state = {
        // Tool
        currentTool: 'select',
        strokeColor: '#e51c23',
        strokeWidth: 3,
        fillEnabled: false,
        fontSize: 18,
        // Objects
        objects: [],
        selectedId: null,
        // History
        undoStack: [],
        redoStack: [],
        maxHistory: 50,
        // Step counter
        stepCounter: 1,
        // Viewport
        zoom: 1,
        panX: 0,
        panY: 0,
        // Canvas dims (logical, not pixel)
        canvasW: 0,
        canvasH: 0,
        // Snap
        snapEnabled: false,
        snapSize: 20,
        // Interaction
        isDragging: false,
        isResizing: false,
        isPanning: false,
        dragStartX: 0,
        dragStartY: 0,
        dragObjStartX: 0,
        dragObjStartY: 0,
        resizeHandle: null,
        resizeStartBounds: null,
        resizeTarget: null,
        drawingObj: null,
        // Background image
        bgImage: null,
        baseImageRect: null,
        // Id counter
        nextId: 1,
        // text editing
        editingTextId: null,
        // Pending canvas bounds while resizing the editable area
        cropRect: null, // { x, y, w, h }
    };

    // ===== DOM REFS =====
    const $ = (s) => document.getElementById(s) || document.querySelector(s);
    
    // Preview Mode Refs
    const previewMode = $('preview-mode');
    const previewLoading = $('preview-loading');
    const previewContent = $('preview-content');
    const previewCanvas = $('preview-canvas');
    const previewBtnDiscard = $('preview-btn-discard');
    const previewBtnEdit = $('preview-btn-edit');
    const previewBtnCopy = $('preview-btn-copy');
    const previewBtnDownload = $('preview-btn-download');

    // Editor Mode Refs
    const editorLayout = $('editor-layout');
    const canvasBg = $('canvas-bg');
    const canvasOverlay = $('canvas-overlay');
    const ctxBg = canvasBg.getContext('2d');
    const ctxOv = canvasOverlay.getContext('2d');
    const canvasArea = $('canvas-area');
    const canvasWrapper = $('canvas-wrapper');
    const zoomDisplay = $('zoom-display');
    const stepCounterDisplay = $('step-counter-display');
    const stepCounterValue = $('step-counter-value');

    // Text Modal Refs
    const textModalBackdrop = $('text-modal-backdrop');
    const textModalInput = $('text-modal-input');
    const textModalOk = $('text-modal-ok');
    const textModalCancel = $('text-modal-cancel');
    const textModalCancel2 = $('text-modal-cancel2');

    // Loupe Mode Refs
    const loupeWrap = $('loupe-wrap');
    const loupeCanvas = $('loupe-canvas');
    const loupeHex = $('loupe-hex');
    const ctxLoupe = loupeCanvas.getContext('2d');

    // ===== HELPERS =====
    const AUTO_FIT_IDLE_MS = 2000;
    const LIVE_SYNC_THROTTLE_MS = 120;
    let autoFitTimerId = null;
    let lastLiveSyncTs = 0;

    function genId() { return state.nextId++; }

    function snap(val) {
        if (!state.snapEnabled) return val;
        return Math.round(val / state.snapSize) * state.snapSize;
    }

    // Toast notification
    function showToast(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #1f2937;
            color: #ffffff;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        if (!document.querySelector('style[data-toast-animation]')) {
            style.setAttribute('data-toast-animation', 'true');
            document.head.appendChild(style);
        }
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function scheduleAutoFitAfterIdle() {
        if (autoFitTimerId !== null) {
            clearTimeout(autoFitTimerId);
        }
        autoFitTimerId = setTimeout(() => {
            autoFitTimerId = null;
            fitToScreen();
        }, AUTO_FIT_IDLE_MS);
    }

    function maybeSyncCanvasDuringInteraction(interaction) {
        const now = performance.now();
        if (now - lastLiveSyncTs < LIVE_SYNC_THROTTLE_MS) {
            return false;
        }
        lastLiveSyncTs = now;
        const changed = syncCanvasToContent(interaction);
        if (changed) scheduleAutoFitAfterIdle();
        return changed;
    }

    function screenToCanvas(sx, sy) {
        const rect = canvasArea.getBoundingClientRect();
        const x = (sx - rect.left - state.panX) / state.zoom;
        const y = (sy - rect.top - state.panY) / state.zoom;
        return { x, y };
    }

    function cloneObjects() {
        return state.objects.map(obj => {
            const copy = { ...obj };
            // Image elements cannot be JSON-cloned, so we keep the reference
            // but the rest of the object properties are shallow-copied.
            return copy;
        });
    }

    // ===== HISTORY =====
    function pushHistory() {
        state.undoStack.push({
            objects: cloneObjects(),
            bgImage: state.bgImage,
            baseImageRect: state.baseImageRect ? { ...state.baseImageRect } : null,
            w: state.canvasW,
            h: state.canvasH
        });
        if (state.undoStack.length > state.maxHistory) state.undoStack.shift();
        state.redoStack = [];
    }

    function undo() {
        if (state.undoStack.length === 0) return;
        state.redoStack.push({
            objects: cloneObjects(),
            bgImage: state.bgImage,
            baseImageRect: state.baseImageRect ? { ...state.baseImageRect } : null,
            w: state.canvasW,
            h: state.canvasH
        });
        const snap = state.undoStack.pop();
        restoreSnapshot(snap);
    }

    function redo() {
        if (state.redoStack.length === 0) return;
        state.undoStack.push({
            objects: cloneObjects(),
            bgImage: state.bgImage,
            baseImageRect: state.baseImageRect ? { ...state.baseImageRect } : null,
            w: state.canvasW,
            h: state.canvasH
        });
        const snap = state.redoStack.pop();
        restoreSnapshot(snap);
    }

    function restoreSnapshot(snap) {
        state.objects = snap.objects;
        state.bgImage = snap.bgImage;
        state.baseImageRect = snap.baseImageRect ? { ...snap.baseImageRect } : null;
        state.canvasW = snap.w;
        state.canvasH = snap.h;
        
        // Resize canvases
        canvasBg.width = snap.w;
        canvasBg.height = snap.h;
        canvasOverlay.width = snap.w;
        canvasOverlay.height = snap.h;
        canvasWrapper.style.width = snap.w + 'px';
        canvasWrapper.style.height = snap.h + 'px';

        redrawBackgroundLayer();
        state.selectedId = null;
        render();
    }

    // ===== OBJECT HELPERS =====
    function getObj(id) { return state.objects.find(o => o.id === id); }

    function getBounds(obj) {
        switch (obj.type) {
            case 'rect':
            case 'highlight':
            case 'blur':
                return { x: Math.min(obj.x, obj.x + obj.w), y: Math.min(obj.y, obj.y + obj.h), w: Math.abs(obj.w), h: Math.abs(obj.h) };
            case 'circle':
                return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 };
            case 'arrow':
            case 'line': {
                const mx = Math.min(obj.x1, obj.x2), my = Math.min(obj.y1, obj.y2);
                return { x: mx, y: my, w: Math.abs(obj.x2 - obj.x1) || 2, h: Math.abs(obj.y2 - obj.y1) || 2 };
            }
            case 'step':
                return { x: obj.x - 16, y: obj.y - 16, w: 32, h: 32 };
            case 'text': {
                ctxOv.save();
                ctxOv.font = `${obj.fontSize || 18}px "Segoe UI", sans-serif`;
                const lines = (obj.text || 'Text').split('\n');
                let maxW = 0;
                lines.forEach(l => { const m = ctxOv.measureText(l); if (m.width > maxW) maxW = m.width; });
                ctxOv.restore();
                const h = lines.length * (obj.fontSize || 18) * 1.3;
                return { x: obj.x, y: obj.y, w: Math.max(maxW + 8, 20), h: Math.max(h, 20) };
            }
            case 'image':
                return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
            default:
                return { x: 0, y: 0, w: 0, h: 0 };
        }
    }

    function hitTest(x, y) {
        // Reverse order (top layer first)
        for (let i = state.objects.length - 1; i >= 0; i--) {
            const obj = state.objects[i];
            const b = getBounds(obj);
            const pad = 6;
            if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) {
                return obj.id;
            }
        }
        return null;
    }

    function getResizeHandle(obj, x, y) {
        const b = getBounds(obj);
        const hs = 8 / state.zoom; // handle size in canvas coords
        const handles = [
            { name: 'nw', hx: b.x, hy: b.y },
            { name: 'n', hx: b.x + b.w / 2, hy: b.y },
            { name: 'ne', hx: b.x + b.w, hy: b.y },
            { name: 'e', hx: b.x + b.w, hy: b.y + b.h / 2 },
            { name: 'se', hx: b.x + b.w, hy: b.y + b.h },
            { name: 's', hx: b.x + b.w / 2, hy: b.y + b.h },
            { name: 'sw', hx: b.x, hy: b.y + b.h },
            { name: 'w', hx: b.x, hy: b.y + b.h / 2 },
        ];
        for (const h of handles) {
            if (Math.abs(x - h.hx) <= hs && Math.abs(y - h.hy) <= hs) return h.name;
        }
        return null;
    }

    function getCropHandle(x, y) {
        const b = (state.cropRect) ? {
            x: Math.min(state.cropRect.x, state.cropRect.x + state.cropRect.w),
            y: Math.min(state.cropRect.y, state.cropRect.y + state.cropRect.h),
            w: Math.abs(state.cropRect.w),
            h: Math.abs(state.cropRect.h)
        } : { x: 0, y: 0, w: state.canvasW, h: state.canvasH };

        const hs = 15 / state.zoom; // More generous hit area for expansion
        const handles = [
            { name: 'nw', hx: b.x, hy: b.y },
            { name: 'n', hx: b.x + b.w / 2, hy: b.y },
            { name: 'ne', hx: b.x + b.w, hy: b.y },
            { name: 'e', hx: b.x + b.w, hy: b.y + b.h / 2 },
            { name: 'se', hx: b.x + b.w, hy: b.y + b.h },
            { name: 's', hx: b.x + b.w / 2, hy: b.y + b.h },
            { name: 'sw', hx: b.x, hy: b.y + b.h },
            { name: 'w', hx: b.x, hy: b.y + b.h / 2 },
        ];
        for (const h of handles) {
            if (Math.abs(x - h.hx) <= hs && Math.abs(y - h.hy) <= hs) return h.name;
        }
        return null;
    }

    function applyResize(obj, handle, dx, dy, startBounds) {
        const b = { ...startBounds };
        switch (handle) {
            case 'nw': b.x += dx; b.y += dy; b.w -= dx; b.h -= dy; break;
            case 'n': b.y += dy; b.h -= dy; break;
            case 'ne': b.w += dx; b.y += dy; b.h -= dy; break;
            case 'e': b.w += dx; break;
            case 'se': b.w += dx; b.h += dy; break;
            case 's': b.h += dy; break;
            case 'sw': b.x += dx; b.w -= dx; b.h += dy; break;
            case 'w': b.x += dx; b.w -= dx; break;
        }

        // Maintain aspect ratio for images during resize
        if (obj.type === 'image' && handle !== 'n' && handle !== 's' && handle !== 'e' && handle !== 'w') {
            const ratio = startBounds.w / startBounds.h;
            if (handle === 'se' || handle === 'nw') {
                if (Math.abs(dx) > Math.abs(dy)) b.h = b.w / ratio;
                else b.w = b.h * ratio;
            } else {
                // ne, sw
                if (Math.abs(dx) > Math.abs(dy)) b.h = b.w / ratio;
                else b.w = b.h * ratio;
            }
        }

        // Apply snapping
        b.x = snap(b.x); b.y = snap(b.y);
        b.w = snap(b.w); b.h = snap(b.h);

        switch (obj.type) {
            case 'rect':
            case 'highlight':
            case 'blur':
                obj.x = b.x; obj.y = b.y; obj.w = b.w; obj.h = b.h; break;
            case 'circle':
                obj.cx = b.x + b.w / 2; obj.cy = b.y + b.h / 2; obj.rx = Math.abs(b.w / 2); obj.ry = Math.abs(b.h / 2); break;
            case 'arrow':
            case 'line':
                obj.x1 = b.x; obj.y1 = b.y; obj.x2 = b.x + b.w; obj.y2 = b.y + b.h; break;
            case 'step':
                obj.x = b.x + b.w / 2; obj.y = b.y + b.h / 2; break;
            case 'text':
                obj.x = b.x; obj.y = b.y; break;
            case 'image':
                obj.x = b.x; obj.y = b.y; obj.w = b.w; obj.h = b.h; break;
        }
    }

    function moveObject(obj, dx, dy) {
        switch (obj.type) {
            case 'rect':
            case 'highlight':
            case 'blur':
                obj.x = snap(state.dragObjStartX + dx);
                obj.y = snap(state.dragObjStartY + dy);
                break;
            case 'circle':
                obj.cx = snap(state.dragObjStartX + dx);
                obj.cy = snap(state.dragObjStartY + dy);
                break;
            case 'arrow':
            case 'line': {
                const ddx = snap(dx); const ddy = snap(dy);
                obj.x1 = state.dragObjStartX + ddx;
                obj.y1 = state.dragObjStartY + ddy;
                obj.x2 = state._dragX2Start + ddx;
                obj.y2 = state._dragY2Start + ddy;
                break;
            }
            case 'step':
            case 'text':
            case 'image':
                obj.x = snap(state.dragObjStartX + dx);
                obj.y = snap(state.dragObjStartY + dy);
                break;
        }
    }

    function resizeCanvasSurface(width, height) {
        state.canvasW = width;
        state.canvasH = height;
        canvasBg.width = width;
        canvasBg.height = height;
        canvasOverlay.width = width;
        canvasOverlay.height = height;
        canvasWrapper.style.width = width + 'px';
        canvasWrapper.style.height = height + 'px';
    }

    function cloneCanvasSurface(sourceCanvas) {
        const clone = document.createElement('canvas');
        clone.width = sourceCanvas.width;
        clone.height = sourceCanvas.height;
        clone.getContext('2d').drawImage(sourceCanvas, 0, 0);
        return clone;
    }

    function redrawBackgroundLayer() {
        ctxBg.clearRect(0, 0, canvasBg.width, canvasBg.height);
        ctxBg.fillStyle = '#ffffff';
        ctxBg.fillRect(0, 0, canvasBg.width, canvasBg.height);
        if (state.bgImage) {
            ctxBg.drawImage(state.bgImage, 0, 0);
        }
    }

    function shiftObjects(dx, dy) {
        if (!dx && !dy) return;

        state.objects.forEach(obj => {
            if (obj.type === 'circle') {
                obj.cx += dx;
                obj.cy += dy;
            } else if (obj.type === 'arrow' || obj.type === 'line') {
                obj.x1 += dx;
                obj.y1 += dy;
                obj.x2 += dx;
                obj.y2 += dy;
            } else {
                obj.x += dx;
                obj.y += dy;
            }
        });
    }

    function shiftBaseImageRect(dx, dy) {
        if (!state.baseImageRect || (!dx && !dy)) return;
        state.baseImageRect.x += dx;
        state.baseImageRect.y += dy;
    }

    function clampRectToCanvas(rect, canvasW, canvasH) {
        if (!rect) return null;
        const left = Math.max(0, rect.x);
        const top = Math.max(0, rect.y);
        const right = Math.min(canvasW, rect.x + rect.w);
        const bottom = Math.min(canvasH, rect.y + rect.h);
        return {
            x: left,
            y: top,
            w: Math.max(0, right - left),
            h: Math.max(0, bottom - top)
        };
    }

    function getContentBounds() {
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;

        const include = (rect) => {
            if (!rect || rect.w <= 0 || rect.h <= 0) return;
            left = Math.min(left, rect.x);
            top = Math.min(top, rect.y);
            right = Math.max(right, rect.x + rect.w);
            bottom = Math.max(bottom, rect.y + rect.h);
        };

        include(state.baseImageRect);
        state.objects.forEach(obj => include(getBounds(obj)));

        if (!Number.isFinite(left)) {
            return { x: 0, y: 0, w: state.canvasW, h: state.canvasH };
        }

        return {
            x: Math.floor(left),
            y: Math.floor(top),
            w: Math.ceil(right - left),
            h: Math.ceil(bottom - top)
        };
    }

    function syncCanvasToContent(interaction = null) {
        const bounds = getContentBounds();
        if (!bounds) return false;

        const left = bounds.x;
        const top = bounds.y;
        const newW = Math.max(1, bounds.w);
        const newH = Math.max(1, bounds.h);

        if (newW === state.canvasW && newH === state.canvasH && left === 0 && top === 0) {
            return false;
        }

        const shiftX = -left;
        const shiftY = -top;
        const offCanvas = document.createElement('canvas');
        offCanvas.width = newW;
        offCanvas.height = newH;
        const offCtx = offCanvas.getContext('2d');
        offCtx.drawImage(state.bgImage, shiftX, shiftY);

        state.bgImage = offCanvas;
        shiftObjects(shiftX, shiftY);
        shiftBaseImageRect(shiftX, shiftY);
        resizeCanvasSurface(newW, newH);
        redrawBackgroundLayer();

        if (shiftX || shiftY) {
            state.panX -= shiftX * state.zoom;
            state.panY -= shiftY * state.zoom;

            if (interaction?.kind === 'move') {
                state.dragStartX += shiftX;
                state.dragStartY += shiftY;
                state.dragObjStartX += shiftX;
                state.dragObjStartY += shiftY;
                if (interaction.object?.type === 'arrow' || interaction.object?.type === 'line') {
                    state._dragX2Start += shiftX;
                    state._dragY2Start += shiftY;
                }
            }

            if (interaction?.kind === 'resize') {
                state.dragStartX += shiftX;
                state.dragStartY += shiftY;
                if (state.resizeStartBounds) {
                    state.resizeStartBounds = {
                        ...state.resizeStartBounds,
                        x: state.resizeStartBounds.x + shiftX,
                        y: state.resizeStartBounds.y + shiftY
                    };
                }
            }

            updateViewport();
        }

        render();
        return true;
    }

    // ===== RENDER =====
    function render() {
        const ctx = ctxOv;
        ctx.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);

        // Draw all objects
        state.objects.forEach(obj => drawObject(ctx, obj));

        // Draw crop overlay
        if (state.cropRect) {
            drawCanvasResizeOverlay(ctx);
        } else if (state.currentTool === 'select') {
            drawCanvasResizeOverlay(ctx, true);
        }

        // Draw selection
        if (state.selectedId !== null) {
            const obj = getObj(state.selectedId);
            if (obj) drawSelection(ctx, obj);
        }

        // Draw snap grid  
        if (state.snapEnabled) drawSnapGrid(ctx);
    }

    function drawCanvasResizeOverlay(ctx, hintsOnly = false) {
        const r = state.cropRect || { x: 0, y: 0, w: state.canvasW, h: state.canvasH };
        const x = Math.min(r.x, r.x + r.w);
        const y = Math.min(r.y, r.y + r.h);
        const w = Math.abs(r.w);
        const h = Math.abs(r.h);

        ctx.save();
        if (!hintsOnly) {
            // Dark area outside crop box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            
            // To support expansion, we fill a very large area
            const big = 10000;
            // Top
            ctx.fillRect(-big, -big, big * 2, y + big);
            // Bottom
            ctx.fillRect(-big, y + h, big * 2, big);
            // Left
            ctx.fillRect(-big, y, x + big, h);
            // Right
            ctx.fillRect(x + w, y, big, h);
        }

        // Border
        ctx.strokeStyle = hintsOnly ? 'rgba(255, 255, 255, 0.3)' : '#fff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x, y, w, h);

        // Handles
        ctx.setLineDash([]);
        ctx.fillStyle = hintsOnly ? 'rgba(26, 115, 232, 0.3)' : '#1a73e8';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const hs = (hintsOnly ? 4 : 6) / state.zoom;
        const handles = [
            { hx: x, hy: y }, { hx: x + w / 2, hy: y }, { hx: x + w, hy: y },
            { hx: x + w, hy: y + h / 2 }, { hx: x + w, hy: y + h },
            { hx: x + w / 2, hy: y + h }, { hx: x, hy: y + h }, { hx: x, hy: y + h / 2 }
        ];
        handles.forEach(h => {
            ctx.beginPath();
            ctx.arc(h.hx, h.hy, hs, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        ctx.restore();
    }

    function drawObject(ctx, obj) {
        ctx.save();
        ctx.lineWidth = obj.lineWidth || state.strokeWidth;
        ctx.strokeStyle = obj.stroke || state.strokeColor;
        ctx.fillStyle = obj.fill || 'transparent';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (obj.type) {
            case 'rect': {
                const x = Math.min(obj.x, obj.x + obj.w);
                const y = Math.min(obj.y, obj.y + obj.h);
                const w = Math.abs(obj.w);
                const h = Math.abs(obj.h);
                if (obj.fill && obj.fill !== 'transparent') {
                    ctx.fillRect(x, y, w, h);
                }
                ctx.strokeRect(x, y, w, h);
                break;
            }
            case 'circle': {
                ctx.beginPath();
                ctx.ellipse(obj.cx, obj.cy, Math.abs(obj.rx), Math.abs(obj.ry), 0, 0, Math.PI * 2);
                if (obj.fill && obj.fill !== 'transparent') ctx.fill();
                ctx.stroke();
                break;
            }
            case 'arrow': {
                const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
                const headLen = 14 + (obj.lineWidth || 3) * 1.5;

                ctx.beginPath();
                ctx.moveTo(obj.x1, obj.y1);
                ctx.lineTo(obj.x2, obj.y2);
                ctx.stroke();

                // Arrowhead
                ctx.beginPath();
                ctx.moveTo(obj.x2, obj.y2);
                ctx.lineTo(obj.x2 - headLen * Math.cos(angle - Math.PI / 7), obj.y2 - headLen * Math.sin(angle - Math.PI / 7));
                ctx.lineTo(obj.x2 - headLen * Math.cos(angle + Math.PI / 7), obj.y2 - headLen * Math.sin(angle + Math.PI / 7));
                ctx.closePath();
                ctx.fillStyle = obj.stroke || state.strokeColor;
                ctx.fill();
                break;
            }
            case 'line': {
                ctx.beginPath();
                ctx.moveTo(obj.x1, obj.y1);
                ctx.lineTo(obj.x2, obj.y2);
                ctx.stroke();
                break;
            }
            case 'step': {
                const r = 16;
                const color = obj.color || state.strokeColor;
                // Circle bg
                ctx.beginPath();
                ctx.arc(obj.x, obj.y, r, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                // White border
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
                // Number
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 14px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(obj.number), obj.x, obj.y + 1);
                break;
            }
            case 'text': {
                const fs = obj.fontSize || 18;
                ctx.font = `${fs}px "Segoe UI", sans-serif`;
                ctx.fillStyle = obj.color || obj.stroke || state.strokeColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                const lines = (obj.text || 'Text').split('\n');
                lines.forEach((line, i) => {
                    ctx.fillText(line, obj.x, obj.y + i * fs * 1.3);
                });
                break;
            }
            case 'highlight': {
                const x = Math.min(obj.x, obj.x + obj.w);
                const y = Math.min(obj.y, obj.y + obj.h);
                const w = Math.abs(obj.w);
                const h = Math.abs(obj.h);
                ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
                ctx.fillRect(x, y, w, h);
                break;
            }
            case 'blur': {
                const x = Math.min(obj.x, obj.x + obj.w);
                const y = Math.min(obj.y, obj.y + obj.h);
                const w = Math.abs(obj.w);
                const h = Math.abs(obj.h);
                if (w > 0 && h > 0 && state.bgImage) {
                    // Draw pixelated version from background
                    const pxSize = 10;
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    const smW = Math.max(1, Math.ceil(w / pxSize));
                    const smH = Math.max(1, Math.ceil(h / pxSize));
                    tempCanvas.width = smW;
                    tempCanvas.height = smH;
                    tempCtx.imageSmoothingEnabled = false;
                    tempCtx.drawImage(state.bgImage, x, y, w, h, 0, 0, smW, smH);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(tempCanvas, 0, 0, smW, smH, x, y, w, h);
                    ctx.imageSmoothingEnabled = true;

                    // Border
                    ctx.strokeStyle = 'rgba(150,150,150,0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.strokeRect(x, y, w, h);
                    ctx.setLineDash([]);
                }
                break;
            }
            case 'image': {
                if (obj.img) {
                    ctx.drawImage(obj.img, obj.x, obj.y, obj.w, obj.h);
                }
                break;
            }
        }
        ctx.restore();
    }

    function drawSelection(ctx, obj) {
        const b = getBounds(obj);
        ctx.save();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5 / state.zoom;
        ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
        ctx.setLineDash([]);

        // Draw resize handles
        const hs = 5 / state.zoom;
        const handles = [
            { hx: b.x, hy: b.y },
            { hx: b.x + b.w / 2, hy: b.y },
            { hx: b.x + b.w, hy: b.y },
            { hx: b.x + b.w, hy: b.y + b.h / 2 },
            { hx: b.x + b.w, hy: b.y + b.h },
            { hx: b.x + b.w / 2, hy: b.y + b.h },
            { hx: b.x, hy: b.y + b.h },
            { hx: b.x, hy: b.y + b.h / 2 },
        ];
        handles.forEach(h => {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 1.5 / state.zoom;
            ctx.fillRect(h.hx - hs, h.hy - hs, hs * 2, hs * 2);
            ctx.strokeRect(h.hx - hs, h.hy - hs, hs * 2, hs * 2);
        });
        ctx.restore();
    }

    function drawSnapGrid(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
        ctx.lineWidth = 0.5 / state.zoom;
        const gs = state.snapSize;
        for (let x = 0; x <= state.canvasW; x += gs) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, state.canvasH);
            ctx.stroke();
        }
        for (let y = 0; y <= state.canvasH; y += gs) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(state.canvasW, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ===== VIEWPORT =====
    function updateViewport() {
        canvasWrapper.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
        zoomDisplay.textContent = Math.round(state.zoom * 100) + '%';
    }

    function zoomTo(newZoom, pivotScreenX, pivotScreenY) {
        newZoom = Math.max(0.1, Math.min(5, newZoom));
        if (pivotScreenX !== undefined) {
            const rect = canvasArea.getBoundingClientRect();
            const px = pivotScreenX - rect.left;
            const py = pivotScreenY - rect.top;
            state.panX = px - (px - state.panX) * (newZoom / state.zoom);
            state.panY = py - (py - state.panY) * (newZoom / state.zoom);
        }
        state.zoom = newZoom;
        updateViewport();
    }

    function fitToScreen() {
        const areaRect = canvasArea.getBoundingClientRect();
        const padding = 40;
        const scaleX = (areaRect.width - padding * 2) / state.canvasW;
        const scaleY = (areaRect.height - padding * 2) / state.canvasH;
        state.zoom = Math.min(scaleX, scaleY, 1);
        state.panX = (areaRect.width - state.canvasW * state.zoom) / 2;
        state.panY = (areaRect.height - state.canvasH * state.zoom) / 2;
        updateViewport();
    }

    // ===== EYEDROPPER LOUPE =====
    function updateLoupe(cx, cy, ex, ey) {
        if (!loupeWrap || !state.bgImage) return;

        // Position loupe offset from cursor
        const areaRect = canvasArea.getBoundingClientRect();
        const lx = ex - areaRect.left + 60;
        const ly = ey - areaRect.top - 60;
        loupeWrap.style.left = lx + 'px';
        loupeWrap.style.top = ly + 'px';

        // Draw zoomed area
        const zoom = 12; // 12x zoom
        const size = 120;
        const srcSize = size / zoom;
        const sx = cx - srcSize / 2;
        const sy = cy - srcSize / 2;

        ctxLoupe.imageSmoothingEnabled = false;
        ctxLoupe.clearRect(0, 0, size, size);
        ctxLoupe.drawImage(state.bgImage, sx, sy, srcSize, srcSize, 0, 0, size, size);

        // Get center pixel color
        const pixel = ctxBg.getImageData(cx, cy, 1, 1).data;
        const hex = '#' + Array.from(pixel.slice(0, 3)).map(c => c.toString(16).padStart(2, '0')).join('');
        loupeHex.textContent = hex.toUpperCase();
    }

    // ===== TEXT EDITING (MODAL) =====
    function startTextEdit(obj) {
        state.editingTextId = obj.id;
        textModalInput.value = obj.text === 'Text' ? '' : obj.text;
        textModalBackdrop.style.display = 'flex';
        setTimeout(() => textModalInput.focus(), 50);
    }

    function finishTextEdit() {
        const value = textModalInput.value.trim();
        if (value) {
            const obj = getObj(state.editingTextId);
            if (obj) {
                pushHistory();
                obj.text = value;
                render();
            }
        } else if (getObj(state.editingTextId)?.text === 'Text') {
            // Remove if it's new and empty
            state.objects = state.objects.filter(o => o.id !== state.editingTextId);
        }
        
        closeTextModal();
        setTool('select');
    }

    function closeTextModal() {
        textModalBackdrop.style.display = 'none';
        state.editingTextId = null;
        render();
    }

    // ===== MOUSE HANDLERS =====
    
    function onPointerDown(e) {

        if (e.button !== 0) return;

        if (autoFitTimerId !== null) {
            clearTimeout(autoFitTimerId);
            autoFitTimerId = null;
        }

        const { x, y } = screenToCanvas(e.clientX, e.clientY);

        if (state.currentTool === 'select') {
            // Check resize handle on selected object
            if (state.selectedId !== null) {
                const selObj = getObj(state.selectedId);
                if (selObj) {
                    const handle = getResizeHandle(selObj, x, y);
                    if (handle) {
                        state.isResizing = true;
                        state.resizeHandle = handle;
                        state.resizeStartBounds = getBounds(selObj);
                        state.resizeTarget = 'object';
                        state.dragStartX = x;
                        state.dragStartY = y;
                        pushHistory();
                        e.preventDefault();
                        return;
                    }
                }
            }

            const canvasHandle = getCropHandle(x, y);
            if (canvasHandle) {
                state.isResizing = true;
                state.resizeHandle = canvasHandle;
                state.resizeTarget = 'canvas';
                state.resizeStartBounds = { x: 0, y: 0, w: state.canvasW, h: state.canvasH };
                state.cropRect = { ...state.resizeStartBounds };
                state.dragStartX = x;
                state.dragStartY = y;
                state.selectedId = null;
                render();
                e.preventDefault();
                return;
            }

            // Hit test
            const hitId = hitTest(x, y);
            if (hitId !== null) {
                state.selectedId = hitId;
                const obj = getObj(hitId);
                state.isDragging = true;
                state.dragStartX = x;
                state.dragStartY = y;
                // Save starting positions
                if (obj.type === 'circle') {
                    state.dragObjStartX = obj.cx;
                    state.dragObjStartY = obj.cy;
                } else if (obj.type === 'arrow' || obj.type === 'line') {
                    state.dragObjStartX = obj.x1;
                    state.dragObjStartY = obj.y1;
                    state._dragX2Start = obj.x2;
                    state._dragY2Start = obj.y2;
                } else {
                    state.dragObjStartX = obj.x;
                    state.dragObjStartY = obj.y;
                }
                syncToolbarToSelection();
                pushHistory();
            } else {
                state.selectedId = null;
            }
            render();
            e.preventDefault();
            return;
        }

        // Drawing tools
        pushHistory();
        const snx = snap(x), sny = snap(y);

        switch (state.currentTool) {
            case 'rect': {
                const obj = { id: genId(), type: 'rect', x: snx, y: sny, w: 0, h: 0, stroke: state.strokeColor, fill: state.fillEnabled ? state.strokeColor + '33' : 'transparent', lineWidth: state.strokeWidth };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'circle': {
                const obj = { id: genId(), type: 'circle', cx: snx, cy: sny, rx: 0, ry: 0, stroke: state.strokeColor, fill: state.fillEnabled ? state.strokeColor + '33' : 'transparent', lineWidth: state.strokeWidth };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'arrow': {
                const obj = { id: genId(), type: 'arrow', x1: snx, y1: sny, x2: snx, y2: sny, stroke: state.strokeColor, lineWidth: state.strokeWidth };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'line': {
                const obj = { id: genId(), type: 'line', x1: snx, y1: sny, x2: snx, y2: sny, stroke: state.strokeColor, lineWidth: state.strokeWidth };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'step': {
                const obj = { id: genId(), type: 'step', x: snx, y: sny, number: state.stepCounter, color: state.strokeColor };
                state.objects.push(obj);
                state.stepCounter++;
                stepCounterValue.textContent = state.stepCounter;
                state.selectedId = obj.id;
                render();
                break;
            }
            case 'text': {
                const obj = { id: genId(), type: 'text', x: snx, y: sny, text: 'Text', fontSize: state.fontSize, color: state.strokeColor };
                state.objects.push(obj);
                render();
                startTextEdit(obj);
                break;
            }
            case 'highlight': {
                const obj = { id: genId(), type: 'highlight', x: snx, y: sny, w: 0, h: 0 };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'blur': {
                const obj = { id: genId(), type: 'blur', x: snx, y: sny, w: 0, h: 0 };
                state.objects.push(obj);
                state.drawingObj = obj;
                break;
            }
            case 'eyedropper': {
                const pixel = ctxBg.getImageData(x, y, 1, 1).data;
                const hex = '#' + Array.from(pixel.slice(0, 3)).map(c => c.toString(16).padStart(2, '0')).join('');
                state.strokeColor = hex;
                $('tool-color').value = hex;
                $('color-wrap').style.borderColor = hex;
                if (state.selectedId !== null) {
                    const obj = getObj(state.selectedId);
                    if (obj) {
                        if (obj.stroke) obj.stroke = hex;
                        if (obj.color) obj.color = hex;
                        if (obj.fill && obj.fill !== 'transparent') obj.fill = hex + '33';
                    }
                }
                loupeWrap.style.display = 'none';
                setTool('select');
                render();
                return;
            }
        }

        state.dragStartX = snx;
        state.dragStartY = sny;
        state.isDragging = true;
        e.preventDefault();
    }

    function onPointerMove(e) {
        const { x, y } = screenToCanvas(e.clientX, e.clientY);

        // Eyedropper Loupe Update (Must be at the top to bypass dragging checks)
        if (state.currentTool === 'eyedropper' && !state.isDragging) {
            updateLoupe(x, y, e.clientX, e.clientY);
        }

        if (state.isPanning) {
            state.panX = e.clientX - state.dragStartX;
            state.panY = e.clientY - state.dragStartY;
            updateViewport();
            return;
        }

        if (!state.isDragging && !state.isResizing) {
            // Cursor hints for select mode
            if (state.currentTool === 'select') {
                if (state.selectedId !== null) {
                    const obj = getObj(state.selectedId);
                    if (obj) {
                        const handle = getResizeHandle(obj, x, y);
                        if (handle) {
                            const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
                            canvasOverlay.style.cursor = cursors[handle];
                            return;
                        }
                    }
                }
                const canvasHandle = getCropHandle(x, y);
                if (canvasHandle) {
                    const cursors = { nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
                    canvasOverlay.style.cursor = cursors[canvasHandle];
                    return;
                }
                const hid = hitTest(x, y);
                canvasOverlay.style.cursor = hid ? 'move' : 'default';
            }
            return;
        }

        if (state.isResizing) {
            const dx = x - state.dragStartX;
            const dy = y - state.dragStartY;

            if (state.resizeTarget === 'canvas') {
                applyCanvasResizePreview(dx, dy);
                render();
                return;
            }

            const obj = getObj(state.selectedId);
            if (obj) {
                applyResize(obj, state.resizeHandle, dx, dy, state.resizeStartBounds);
                if (obj.type === 'image' && maybeSyncCanvasDuringInteraction({ kind: 'resize', object: obj })) {
                    return;
                }
                render();
            }
            return;
        }

        // Select mode drag (move object)
        if (state.currentTool === 'select' && state.selectedId !== null) {
            const obj = getObj(state.selectedId);
            if (obj) {
                const dx = x - state.dragStartX;
                const dy = y - state.dragStartY;
                moveObject(obj, dx, dy);
                if (obj.type === 'image' && maybeSyncCanvasDuringInteraction({ kind: 'move', object: obj })) {
                    return;
                }
                render();
            }
            return;
        }

        // Drawing
        if (state.drawingObj) {
            const snx = snap(x), sny = snap(y);
            const obj = state.drawingObj;
            switch (obj.type) {
                case 'rect':
                case 'highlight':
                case 'blur':
                case 'image':
                    obj.w = snx - obj.x;
                    obj.h = sny - obj.y;
                    break;
                case 'circle':
                    obj.rx = Math.abs(snx - obj.cx);
                    obj.ry = Math.abs(sny - obj.cy);
                    break;
                case 'arrow':
                case 'line':
                    obj.x2 = snx;
                    obj.y2 = sny;
                    // Shift = constrain to 45° angles
                    if (e.shiftKey) {
                        const dx = obj.x2 - obj.x1;
                        const dy = obj.y2 - obj.y1;
                        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                        const len = Math.sqrt(dx * dx + dy * dy);
                        obj.x2 = obj.x1 + Math.cos(angle) * len;
                        obj.y2 = obj.y1 + Math.sin(angle) * len;
                    }
                    break;
            }
            render();
        }
    }

    function applyCanvasResizePreview(dx, dy) {
        const b = { ...state.resizeStartBounds };
        switch (state.resizeHandle) {
            case 'nw': b.x += dx; b.y += dy; b.w -= dx; b.h -= dy; break;
            case 'n': b.y += dy; b.h -= dy; break;
            case 'ne': b.w += dx; b.y += dy; b.h -= dy; break;
            case 'e': b.w += dx; break;
            case 'se': b.w += dx; b.h += dy; break;
            case 's': b.h += dy; break;
            case 'sw': b.x += dx; b.w -= dx; b.h += dy; break;
            case 'w': b.x += dx; b.w -= dx; break;
        }
        state.cropRect = b;
    }

    function onPointerUp(e) {
        if (state.isPanning) {
            state.isPanning = false;
            canvasArea.classList.remove('panning');
            return;
        }

        if (state.isResizing) {
            const resizedImage = state.resizeTarget === 'object' && state.selectedId !== null ? getObj(state.selectedId) : null;
            const canvasResizeChanged = state.resizeTarget === 'canvas' && state.cropRect && (
                Math.abs(state.cropRect.x) > 0.5 ||
                Math.abs(state.cropRect.y) > 0.5 ||
                Math.abs(state.cropRect.w - state.canvasW) > 0.5 ||
                Math.abs(state.cropRect.h - state.canvasH) > 0.5
            );
            state.isResizing = false;
            state.resizeHandle = null;
            state.resizeStartBounds = null;
            const resizeTarget = state.resizeTarget;
            state.resizeTarget = null;

            if (resizeTarget === 'canvas') {
                if (canvasResizeChanged) {
                    commitCanvasResize();
                    return;
                }
                state.cropRect = null;
            } else if (resizedImage && resizedImage.type === 'image') {
                if (syncCanvasToContent()) {
                    scheduleAutoFitAfterIdle();
                    return;
                }
            }

            render();
            return;
        }

        if (state.drawingObj) {
            const obj = state.drawingObj;
            const isTiny = (type) => {
                if (type === 'rect' || type === 'highlight' || type === 'blur' || type === 'image') return Math.abs(obj.w) < 3 && Math.abs(obj.h) < 3;
                if (type === 'arrow' || type === 'line') return Math.abs(obj.x2 - obj.x1) < 3 && Math.abs(obj.y2 - obj.y1) < 3;
                if (type === 'circle') return obj.rx < 3 && obj.ry < 3;
                return false;
            };

            if (isTiny(obj.type)) {
                state.objects.pop();
                state.undoStack.pop();
            } else {
                state.selectedId = obj.id;
                setTool('select');
                syncToolbarToSelection();
            }
            state.drawingObj = null;
        }

        const movedImage = state.isDragging && state.selectedId !== null ? getObj(state.selectedId) : null;
        state.isDragging = false;

        if (movedImage && movedImage.type === 'image') {
            if (syncCanvasToContent()) {
                scheduleAutoFitAfterIdle();
                return;
            }
        }

        render();
    }

    function onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomTo(state.zoom * delta, e.clientX, e.clientY);
    }

    // ===== KEYBOARD =====
    function onKeyDown(e) {
        // If modal is open, only handle modal shortcuts
        if (state.editingTextId !== null) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finishTextEdit();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeTextModal();
            }
            return;
        }

        // Ctrl/Cmd shortcuts for undo/redo using e.code for better keyboard layout compatibility (Thai, etc.)
        if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ')) {
            e.preventDefault();
            undo();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY')) {
            e.preventDefault();
            redo();
            return;
        }
        // Also support Ctrl+Shift+Z for redo (common on Mac)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyZ')) {
            e.preventDefault();
            redo();
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId !== null) {
            pushHistory();
            state.objects = state.objects.filter(o => o.id !== state.selectedId);
            state.selectedId = null;
            render();
            e.preventDefault();
            return;
        }

        // Tool shortcuts
        switch (e.key.toLowerCase()) {
            case 'v': setTool('select'); break;
            case 'r': setTool('rect'); break;
            case 'c': setTool('circle'); break;
            case 'a': setTool('arrow'); break;
            case 'l': setTool('line'); break;
            case 'n': setTool('step'); break;
            case 't': setTool('text'); break;
            case 'h': setTool('highlight'); break;
            case 'b': setTool('blur'); break;
            case 'i': setTool('eyedropper'); break;
            case 'g': toggleGrid(); break;
            case 'escape':
                state.cropRect = null;
                state.selectedId = null;
                render();
                break;
        }

        if (e.key === 'Enter') {
            if (state.selectedId !== null) {
                const obj = getObj(state.selectedId);
                if (obj && obj.type === 'text') {
                    startTextEdit(obj);
                    e.preventDefault();
                }
            }
        }
    }

    // ===== TOOL SWITCHING =====
    function setTool(tool) {
        state.currentTool = tool;
        document.querySelectorAll('#toolbar-tools .tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        canvasArea.dataset.tool = tool;
        stepCounterDisplay.style.display = tool === 'step' ? 'flex' : 'none';
        
        // Loupe visibility
        if (loupeWrap) {
            loupeWrap.style.display = tool === 'eyedropper' ? 'flex' : 'none';
        }
        state.cropRect = null;
        render();
    }

    function toggleGrid() {
        state.snapEnabled = !state.snapEnabled;
        $('btn-grid').classList.toggle('active', state.snapEnabled);
        render();
    }

    // Update current selection styles
    function syncToolbarToSelection() {
        if (state.selectedId === null) return;
        const obj = getObj(state.selectedId);
        if (!obj) return;

        if (obj.stroke || obj.color) {
            const color = obj.stroke || obj.color;
            state.strokeColor = color;
            $('tool-color').value = color.substring(0, 7);
            $('color-wrap').style.borderColor = color;
        }
        if (obj.lineWidth) {
            state.strokeWidth = obj.lineWidth;
            $('tool-stroke-width').value = obj.lineWidth;
        }
        if (obj.fontSize) {
            state.fontSize = obj.fontSize;
            $('tool-font-size').value = obj.fontSize;
        }
        if (obj.fill) {
            state.fillEnabled = obj.fill !== 'transparent';
            $('tool-fill-toggle').classList.toggle('active', state.fillEnabled);
        }
    }

    // ===== DOWNLOAD & COPY =====
    function buildMergedExportCanvas() {
        const mergedCanvas = document.createElement('canvas');
        mergedCanvas.width = canvasBg.width;
        mergedCanvas.height = canvasBg.height;
        const mergedCtx = mergedCanvas.getContext('2d', { alpha: true });

        if (state.bgImage) {
            mergedCtx.drawImage(state.bgImage, 0, 0);
        }

        // Render objects without selection/grid
        state.objects.forEach(obj => drawObject(mergedCtx, obj));
        return mergedCanvas;
    }

    function downloadImage() {
        const mergedCanvas = buildMergedExportCanvas();
        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.png`;
        link.href = mergedCanvas.toDataURL('image/png');
        link.click();
    }

    async function copyImageToClipboard() {
        try {
            if (!navigator.clipboard || !window.ClipboardItem) {
                showToast('Clipboard image not supported in this browser');
                return;
            }

            const mergedCanvas = buildMergedExportCanvas();
            // Use PNG data URL -> Blob path to preserve alpha consistently.
            const pngDataUrl = mergedCanvas.toDataURL('image/png');
            const pngBlob = await (await fetch(pngDataUrl)).blob();
            const item = new ClipboardItem({ 'image/png': pngBlob });
            await navigator.clipboard.write([item]);
            showToast('Image copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            showToast('Failed to copy image');
        }
    }

    // ===== CANVAS RESIZE =====
    function commitCanvasResize() {
        if (!state.cropRect || (Math.abs(state.cropRect.w) < 5 && Math.abs(state.cropRect.h) < 5)) {
            state.cropRect = null;
            render();
            return;
        }

        const r = state.cropRect;
        const x = Math.min(r.x, r.x + r.w);
        const y = Math.min(r.y, r.y + r.h);
        const w = Math.abs(r.w);
        const h = Math.abs(r.h);

        pushHistory();

        // Canvas Expansion/Shrink Logic (Like MS Paint)
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d');

        // Draw current background at offset
        // If x is negative, we add space to the left
        const drawX = -x;
        const drawY = -y;
        offCtx.drawImage(state.bgImage, drawX, drawY);

        state.bgImage = offCanvas;

        // 2. Shift all objects
        shiftObjects(drawX, drawY);
        shiftBaseImageRect(drawX, drawY);

        // 3. Update Canvas Dims
        resizeCanvasSurface(w, h);
        state.baseImageRect = clampRectToCanvas(state.baseImageRect, w, h);

        redrawBackgroundLayer();
        
        // 4. Reset
        state.cropRect = null;
        setTool('select');
        fitToScreen();
        render();
    }

    // ===== INIT =====
    function init() {
        chrome.storage.local.get(['latestScreenshot'], (result) => {
            const data = result.latestScreenshot;
            if (!data || !data.captures || data.captures.length === 0) {
                previewLoading.querySelector('span').textContent = 'No screenshot data found.';
                return;
            }

            const { captures, dims } = data;
            const { fullWidth, fullHeight, windowWidth, windowHeight, pixelRatio, captureType } = dims;

            const effectiveWidth = windowWidth;
            const scrollbarPx = captureType === 'window'
                ? Math.max(0, Math.floor((dims.scrollbarWidth || 0) * pixelRatio))
                : 0;
            const cw = Math.max(1, effectiveWidth * pixelRatio - scrollbarPx);
            const ch = fullHeight * pixelRatio;

            // Set canvases
            canvasBg.width = cw;
            canvasBg.height = ch;
            canvasOverlay.width = cw;
            canvasOverlay.height = ch;
            previewCanvas.width = cw;
            previewCanvas.height = ch;

            state.canvasW = cw;
            state.canvasH = ch;
            state.baseImageRect = { x: 0, y: 0, w: cw, h: ch };
            canvasWrapper.style.width = cw + 'px';
            canvasWrapper.style.height = ch + 'px';

            const pCtx = previewCanvas.getContext('2d');
            pCtx.fillStyle = '#ffffff';
            pCtx.fillRect(0, 0, cw, ch);

            let imagesLoaded = 0;
            const sortedCaptures = [...captures].sort((a, b) => a.y - b.y);
            const loadedFrames = new Array(sortedCaptures.length);
            const contentRect = captureType === 'window' && dims.contentRect ? dims.contentRect : null;

            function detectStaticBands(imgA, imgB) {
                if (!imgA || !imgB) return { left: 0, right: 0, top: 0, bottom: 0 };

                const w = Math.min(imgA.width, imgB.width, cw);
                const h = Math.min(imgA.height, imgB.height);
                if (w < 50 || h < 50) return { left: 0, right: 0, top: 0, bottom: 0 };

                const probe = document.createElement('canvas');
                probe.width = w;
                probe.height = h;
                const pctx = probe.getContext('2d');

                pctx.clearRect(0, 0, w, h);
                pctx.drawImage(imgA, 0, 0, w, h);
                const dataA = pctx.getImageData(0, 0, w, h).data;

                pctx.clearRect(0, 0, w, h);
                pctx.drawImage(imgB, 0, 0, w, h);
                const dataB = pctx.getImageData(0, 0, w, h).data;

                const stepX = 12;
                const stepY = 12;

                const pixelNear = (x, y) => {
                    const i = (y * w + x) * 4;
                    const dr = Math.abs(dataA[i] - dataB[i]);
                    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
                    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);
                    return (dr + dg + db) < 20;
                };

                const columnSimilarity = (x) => {
                    let same = 0;
                    let total = 0;
                    for (let y = 0; y < h; y += stepY) {
                        total++;
                        if (pixelNear(x, y)) same++;
                    }
                    return total ? (same / total) : 0;
                };

                const rowSimilarity = (y, minX, maxX) => {
                    let same = 0;
                    let total = 0;
                    for (let x = minX; x < maxX; x += stepX) {
                        total++;
                        if (pixelNear(x, y)) same++;
                    }
                    return total ? (same / total) : 0;
                };

                const threshold = 0.975;
                const maxLeft = Math.floor(w * 0.4);
                const maxRight = Math.floor(w * 0.4);
                const maxTop = Math.floor(h * 0.25);
                const maxBottom = Math.floor(h * 0.25);

                let left = 0;
                while (left < maxLeft && columnSimilarity(left) >= threshold) left++;

                let right = 0;
                while (right < maxRight && columnSimilarity(w - 1 - right) >= threshold) right++;

                const coreStart = Math.max(left, 0);
                const coreEnd = Math.max(coreStart + 1, w - right);

                let top = 0;
                while (top < maxTop && rowSimilarity(top, coreStart, coreEnd) >= threshold) top++;

                let bottom = 0;
                while (bottom < maxBottom && rowSimilarity(h - 1 - bottom, coreStart, coreEnd) >= threshold) bottom++;

                if (left < 16) left = 0;
                if (right < 16) right = 0;
                if (top < 10) top = 0;
                if (bottom < 10) bottom = 0;

                return { left, right, top, bottom };
            }

            function composeFrames() {
                let canvasCursorY = 0;
                let contentCursorY = 0;

                const staticBands = captureType === 'window'
                    ? detectStaticBands(loadedFrames[0]?.img, loadedFrames[1]?.img)
                    : { left: 0, right: 0, top: 0, bottom: 0 };

                loadedFrames.forEach((frame, captureIndex) => {
                    if (!frame || !frame.img) return;
                    const img = frame.img;
                    const logicalY = frame.capture.y * pixelRatio;

                    if (captureType === 'element') {
                        const drawY = Math.max(canvasCursorY, logicalY);
                        const skipTop = drawY - logicalY;
                        const drawH = img.height - skipTop;
                        if (drawH > 0) {
                            ctxBg.drawImage(img, 0, skipTop, img.width, drawH, 0, drawY, img.width, drawH);
                            pCtx.drawImage(img, 0, skipTop, img.width, drawH, 0, drawY, img.width, drawH);
                            canvasCursorY = Math.max(canvasCursorY, drawY + drawH);
                        }
                        return;
                    }

                    if (captureType === 'window') {
                        if (captureIndex === 0) {
                            const baseW = Math.min(cw, img.width);
                            ctxBg.drawImage(img, 0, 0, baseW, img.height, 0, logicalY, baseW, img.height);
                            pCtx.drawImage(img, 0, 0, baseW, img.height, 0, logicalY, baseW, img.height);
                            contentCursorY = img.height;
                            return;
                        }

                        let srcX = staticBands.left;
                        let srcY = staticBands.top;
                        let srcW = img.width - staticBands.left - staticBands.right;
                        let srcH = img.height - staticBands.top - staticBands.bottom;

                        if (contentRect) {
                            const cX = Math.max(0, Math.floor(contentRect.x * pixelRatio));
                            const cY = Math.max(0, Math.floor(contentRect.y * pixelRatio));
                            const cW = Math.max(1, Math.floor(contentRect.w * pixelRatio));
                            const cH = Math.max(1, Math.floor(contentRect.h * pixelRatio));

                            const clipX1 = Math.max(srcX, cX);
                            const clipY1 = Math.max(srcY, cY);
                            const clipX2 = Math.min(srcX + srcW, cX + cW);
                            const clipY2 = Math.min(srcY + srcH, cY + cH);

                            srcX = clipX1;
                            srcY = clipY1;
                            srcW = clipX2 - clipX1;
                            srcH = clipY2 - clipY1;
                        }

                        if (srcX + srcW > cw) {
                            srcW = Math.max(0, cw - srcX);
                        }

                        if (srcW > 0 && srcH > 0) {
                            const baseDestY = logicalY + srcY;
                            const drawY = Math.max(contentCursorY, baseDestY);
                            const skipTop = drawY - baseDestY;
                            const drawH = srcH - skipTop;

                            if (drawH > 0) {
                                ctxBg.drawImage(img, srcX, srcY + skipTop, srcW, drawH, srcX, drawY, srcW, drawH);
                                pCtx.drawImage(img, srcX, srcY + skipTop, srcW, drawH, srcX, drawY, srcW, drawH);
                                contentCursorY = Math.max(contentCursorY, drawY + drawH);
                            }
                        }
                        return;
                    }

                    ctxBg.drawImage(img, 0, logicalY);
                    pCtx.drawImage(img, 0, logicalY);
                });
            }

            const checkReady = () => {
                imagesLoaded++;
                if (imagesLoaded === sortedCaptures.length) {
                    composeFrames();
                    previewLoading.style.display = 'none';
                    previewContent.style.display = 'flex';
                    // Keep a canvas-backed snapshot so transparent extensions remain transparent.
                    state.bgImage = cloneCanvasSurface(canvasBg);
                    redrawBackgroundLayer();
                }
            };

            sortedCaptures.forEach((capture, captureIndex) => {
                if (!capture.dataUrl) { checkReady(); return; }
                const img = new Image();
                img.onload = () => {
                    loadedFrames[captureIndex] = { capture, img };
                    checkReady();
                };
                img.onerror = checkReady;
                img.src = capture.dataUrl;
            });
        });

        // ===== BIND EVENTS =====
        // Preview Actions
        previewBtnDiscard.onclick = () => {
            chrome.storage.local.remove('latestScreenshot', () => window.close());
        };
        previewBtnDownload.onclick = () => {
            const link = document.createElement('a');
            link.download = `screenshot-${Date.now()}.png`;
            link.href = previewCanvas.toDataURL('image/png');
            link.click();
        };
        previewBtnCopy.onclick = async () => {
            try {
                if (!navigator.clipboard || !window.ClipboardItem) {
                    showToast('Clipboard image not supported in this browser');
                    return;
                }

                const blob = await new Promise((resolve) => {
                    previewCanvas.toBlob(resolve, 'image/png');
                });

                if (!blob) {
                    showToast('Failed to prepare preview image');
                    return;
                }

                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                showToast('Preview copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy preview:', err);
                showToast('Failed to copy preview');
            }
        };
        previewBtnEdit.onclick = () => {
            previewMode.style.display = 'none';
            editorLayout.style.display = 'flex';
            fitToScreen();
            render();
        };

        // Editor Events
        canvasOverlay.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        canvasArea.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('keydown', onKeyDown);

        // Context menu for copying/downloading
        canvasOverlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const menu = confirm('Copy to clipboard? (OK=Copy, Cancel=Download)');
            if (menu) {
                copyImageToClipboard();
            } else {
                downloadImage();
            }
        });

        // Copy button
        $('btn-copy').onclick = copyImageToClipboard;

        document.querySelectorAll('#toolbar-tools .tool-btn').forEach(btn => {
            btn.onclick = () => setTool(btn.dataset.tool);
        });

        const updateStrokeColor = (color) => {
            state.strokeColor = color;
            $('tool-color').value = color.substring(0, 7);
            $('color-wrap').style.borderColor = color;
            if (state.selectedId !== null) {
                const obj = getObj(state.selectedId);
                if (obj) {
                    if (obj.stroke !== undefined) obj.stroke = color;
                    if (obj.color !== undefined) obj.color = color;
                    if (obj.fill && obj.fill !== 'transparent') obj.fill = color + '33';
                    render();
                }
            }
        };

        $('tool-color').oninput = (e) => updateStrokeColor(e.target.value);

        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.onclick = () => updateStrokeColor(btn.dataset.color);
        });
        $('tool-stroke-width').onchange = (e) => {
            const val = parseInt(e.target.value);
            state.strokeWidth = val;
            if (state.selectedId !== null) {
                const obj = getObj(state.selectedId);
                if (obj && obj.lineWidth !== undefined) {
                    obj.lineWidth = val;
                    render();
                }
            }
        };
        $('tool-fill-toggle').onclick = () => {
            state.fillEnabled = !state.fillEnabled;
            $('tool-fill-toggle').classList.toggle('active', state.fillEnabled);
            if (state.selectedId !== null) {
                const obj = getObj(state.selectedId);
                if (obj && (obj.type === 'rect' || obj.type === 'circle')) {
                    obj.fill = state.fillEnabled ? (obj.stroke || state.strokeColor) + '33' : 'transparent';
                    render();
                }
            }
        };
        $('tool-font-size').onchange = (e) => {
            const val = parseInt(e.target.value) || 18;
            state.fontSize = val;
            if (state.selectedId !== null) {
                const obj = getObj(state.selectedId);
                if (obj && obj.fontSize !== undefined) {
                    obj.fontSize = val;
                    render();
                }
            }
        };

        $('btn-undo').onclick = undo;
        $('btn-redo').onclick = redo;
        $('btn-grid').onclick = toggleGrid;
        $('btn-reset-steps').onclick = () => {
            state.stepCounter = 1;
            stepCounterValue.textContent = '1';
        };

        $('btn-zoom-in').onclick = () => zoomTo(state.zoom * 1.2);
        $('btn-zoom-out').onclick = () => zoomTo(state.zoom / 1.2);
        $('btn-zoom-fit').onclick = fitToScreen;

        $('btn-download').onclick = downloadImage;
        $('btn-discard').onclick = () => {
            chrome.storage.local.remove('latestScreenshot', () => window.close());
        };

        // Text Modal Bindings
        textModalOk.onclick = finishTextEdit;
        textModalCancel.onclick = closeTextModal;
        textModalCancel2.onclick = closeTextModal;

        canvasOverlay.ondblclick = (e) => {
            const { x, y } = screenToCanvas(e.clientX, e.clientY);
            const hitId = hitTest(x, y);
            if (hitId) {
                const obj = getObj(hitId);
                if (obj && obj.type === 'text') startTextEdit(obj);
            }
        };

        $('color-wrap').style.borderColor = state.strokeColor;
        
        // Listen for Clipboard Paste
        window.addEventListener('paste', handlePaste);

    }

    function handlePaste(e) {
        const items = (e.clipboardData || window.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const dataUrl = event.target.result;
                    const img = new Image();
                    img.onload = () => {
                        // Place image in the middle of current view
                        const rect = canvasArea.getBoundingClientRect();
                        const centerX = (rect.width / 2 - state.panX) / state.zoom;
                        const centerY = (rect.height / 2 - state.panY) / state.zoom;
                        
                        // Initial scaling: don't let it exceed 60% of viewport
                        let w = img.width;
                        let h = img.height;
                        const maxW = (rect.width * 0.6) / state.zoom;
                        const maxH = (rect.height * 0.6) / state.zoom;
                        
                        if (w > maxW || h > maxH) {
                            const ratio = Math.min(maxW / w, maxH / h);
                            w *= ratio;
                            h *= ratio;
                        }

                        pushHistory();
                        const obj = {
                            id: genId(),
                            type: 'image',
                            img: img,
                            src: dataUrl,
                            x: centerX - w / 2,
                            y: centerY - h / 2,
                            w: w,
                            h: h
                        };
                        state.objects.push(obj);
                        state.selectedId = obj.id;
                        setTool('select');
                        syncCanvasToContent();
                        render();
                        // Auto-fit pasted image to screen
                        setTimeout(() => fitToScreen(), 50);
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(blob);
            }
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
