/**
 * Live Editor Tool - 6 Modes with Floating Toolbar
 */
class LiveEditorTool {
    constructor(manager) {
        this.manager = manager;
        this.mode = null;
        this.active = false;
        this.styleElement = null;
        this.cssPanel = null;
        this.toolbar = null;

        this.handleClick = this.handleClick.bind(this);
        this.handleHover = this.handleHover.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDrag = this.handleDrag.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.blockInteraction = this.blockInteraction.bind(this);

        this.draggedElement = null;
        this.dragOffset = { x: 0, y: 0 };

        // Toolbar drag state
        this._toolbarDrag = null;

        this.modes = [
            { key: 'editText', icon: '✏️', label: 'Edit Text' },
            { key: 'moveElements', icon: '↔️', label: 'Move' },
            { key: 'deleteElements', icon: '🗑️', label: 'Delete' },
            { key: 'cloneElements', icon: '📋', label: 'Clone' },
            { key: 'outlineAll', icon: '📦', label: 'Outline' },
            { key: 'editCSS', icon: '🎨', label: 'Edit CSS' }
        ];
    }

    toggle(mode) {
        // If no toolbar yet, show it first
        if (!this.toolbar) {
            this.showToolbar();
        }

        // If same mode, toggle off (but keep toolbar)
        if (this.active && this.mode === mode) {
            this.deactivateMode();
            this.updateToolbarHighlight();
            return;
        }

        // Deactivate previous mode (but keep toolbar)
        if (this.active) {
            this.deactivateMode();
        }

        this.mode = mode;
        this.active = true;
        this.activateMode();
        this.updateToolbarHighlight();
    }

    activateMode() {
        switch (this.mode) {
            case 'editText':
                document.body.contentEditable = 'true';
                document.body.style.cursor = 'text';
                // Block clicks on buttons, links, form elements so they can be edited
                document.addEventListener('click', this.blockInteraction, true);
                document.addEventListener('submit', this.blockInteraction, true);
                this.manager.showToast('Click anywhere to edit text (buttons disabled)');
                break;

            case 'moveElements':
                document.body.style.cursor = 'move';
                document.addEventListener('mousedown', this.handleDragStart, true);
                document.addEventListener('mousemove', this.handleDrag, true);
                document.addEventListener('mouseup', this.handleDragEnd, true);
                document.addEventListener('mouseover', this.handleHover, true);
                document.addEventListener('click', this.blockInteraction, true);
                this.manager.showToast('Drag elements to move them');
                break;

            case 'deleteElements':
                document.body.style.cursor = 'crosshair';
                document.addEventListener('click', this.handleClick, true);
                document.addEventListener('mouseover', this.handleHover, true);
                this.addHoverStyle('rgba(239, 68, 68, 0.3)', '#ef4444');
                this.manager.showToast('Click elements to delete');
                break;

            case 'cloneElements':
                document.body.style.cursor = 'copy';
                document.addEventListener('click', this.handleClick, true);
                document.addEventListener('mouseover', this.handleHover, true);
                this.addHoverStyle('rgba(16, 185, 129, 0.3)', '#10b981');
                this.manager.showToast('Click element to clone');
                break;

            case 'outlineAll':
                this.showAllOutlines();
                this.manager.showToast('All elements outlined');
                break;

            case 'editCSS':
                document.body.style.cursor = 'crosshair';
                document.addEventListener('click', this.handleClick, true);
                document.addEventListener('mouseover', this.handleHover, true);
                this.addHoverStyle('rgba(99, 102, 241, 0.2)', '#6366f1');
                this.manager.showToast('Click element to edit CSS');
                break;
        }
    }

    deactivateMode() {
        document.body.contentEditable = 'false';
        document.body.style.cursor = 'default';
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('mouseover', this.handleHover, true);
        document.removeEventListener('mousedown', this.handleDragStart, true);
        document.removeEventListener('mousemove', this.handleDrag, true);
        document.removeEventListener('mouseup', this.handleDragEnd, true);
        // Remove edit text interaction blockers
        document.removeEventListener('click', this.blockInteraction, true);
        document.removeEventListener('submit', this.blockInteraction, true);

        this.removeHoverStyle();
        this.removeAllOutlines();
        this.removeCSSPanel();

        document.querySelectorAll('[data-mte-hovered]').forEach(el => {
            el.removeAttribute('data-mte-hovered');
            el.style.outline = '';
            el.style.backgroundColor = '';
        });

        this.active = false;
        this.mode = null;
    }

    deactivate() {
        this.deactivateMode();
        this.removeToolbar();
        this.manager.showToast('Live Editor Inactive');
    }

    // --- Floating Toolbar ---

    showToolbar() {
        this.removeToolbar();

        const toolbar = document.createElement('div');
        toolbar.className = 'mte-live-editor-toolbar';

        // Mode buttons
        this.modes.forEach(m => {
            const btn = document.createElement('button');
            btn.className = 'mte-toolbar-btn';
            btn.dataset.mode = m.key;
            btn.innerHTML = `<span class="mte-toolbar-icon">${m.icon}</span>${m.label}`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle(m.key);
            });
            toolbar.appendChild(btn);
        });

        // Divider
        const divider = document.createElement('div');
        divider.className = 'mte-toolbar-divider';
        toolbar.appendChild(divider);

        // Stop button
        const stopBtn = document.createElement('button');
        stopBtn.className = 'mte-toolbar-stop';
        stopBtn.textContent = '✕ Stop';
        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deactivate();
        });
        toolbar.appendChild(stopBtn);

        // Drag support for toolbar
        toolbar.addEventListener('mousedown', (e) => {
            // Only drag from the toolbar background, not from buttons
            if (e.target !== toolbar) return;
            e.preventDefault();
            const rect = toolbar.getBoundingClientRect();
            this._toolbarDrag = {
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                onMove: (ev) => {
                    toolbar.style.left = (ev.clientX - this._toolbarDrag.offsetX) + 'px';
                    toolbar.style.top = (ev.clientY - this._toolbarDrag.offsetY) + 'px';
                    toolbar.style.transform = 'none';
                },
                onUp: () => {
                    document.removeEventListener('mousemove', this._toolbarDrag.onMove, true);
                    document.removeEventListener('mouseup', this._toolbarDrag.onUp, true);
                    this._toolbarDrag = null;
                }
            };
            document.addEventListener('mousemove', this._toolbarDrag.onMove, true);
            document.addEventListener('mouseup', this._toolbarDrag.onUp, true);
        });

        document.body.appendChild(toolbar);
        this.toolbar = toolbar;
    }

    removeToolbar() {
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
        // Also clean up old floating control if any
        this.manager.removeFloatingControl();
    }

    updateToolbarHighlight() {
        if (!this.toolbar) return;
        this.toolbar.querySelectorAll('.mte-toolbar-btn').forEach(btn => {
            if (btn.dataset.mode === this.mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // --- Block interaction for Edit Text mode ---

    blockInteraction(e) {
        // Allow toolbar clicks
        if (e.target.closest('.mte-live-editor-toolbar')) return;

        const el = e.target.closest('a, button, input, select, textarea, [onclick], [role="button"]');
        if (el) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    }

    // --- Event Handlers (unchanged) ---

    handleHover(e) {
        if (e.target.closest('.mte-live-editor-toolbar') || e.target.closest('.mte-floating-control') || e.target.closest('#mte-css-panel')) return;

        e.stopPropagation();

        document.querySelectorAll('[data-mte-hovered]').forEach(el => {
            el.removeAttribute('data-mte-hovered');
        });

        e.target.setAttribute('data-mte-hovered', 'true');
    }

    handleClick(e) {
        if (e.target.closest('.mte-live-editor-toolbar') || e.target.closest('.mte-floating-control') || e.target.closest('#mte-css-panel')) return;

        e.preventDefault();
        e.stopPropagation();

        const el = e.target;

        switch (this.mode) {
            case 'deleteElements':
                el.remove();
                this.manager.showToast('Element deleted');
                break;

            case 'cloneElements':
                const clone = el.cloneNode(true);
                el.parentNode.insertBefore(clone, el.nextSibling);
                this.manager.showToast('Element cloned');
                break;

            case 'editCSS':
                this.showCSSPanel(el);
                break;
        }
    }

    handleDragStart(e) {
        if (e.target.closest('.mte-live-editor-toolbar') || e.target.closest('.mte-floating-control')) return;
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        this.draggedElement = e.target;
        const rect = this.draggedElement.getBoundingClientRect();

        // Store original position info
        const style = window.getComputedStyle(this.draggedElement);
        if (style.position === 'static') {
            this.draggedElement.style.position = 'relative';
        }

        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            startX: e.clientX,
            startY: e.clientY,
            origTransform: style.transform === 'none' ? '' : style.transform
        };

        this.draggedElement.style.opacity = '0.8';
        this.draggedElement.style.zIndex = '99999';
    }

    handleDrag(e) {
        if (!this.draggedElement) return;

        e.preventDefault();

        const dx = e.clientX - this.dragOffset.startX;
        const dy = e.clientY - this.dragOffset.startY;

        this.draggedElement.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    handleDragEnd(e) {
        if (!this.draggedElement) return;

        this.draggedElement.style.opacity = '';
        this.draggedElement.style.zIndex = '';
        this.draggedElement = null;
    }

    // --- Style Helpers (unchanged) ---

    addHoverStyle(bgColor, outlineColor) {
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'mte-live-editor-style';
        this.styleElement.textContent = `
            [data-mte-hovered] {
                outline: 2px dashed ${outlineColor} !important;
                background-color: ${bgColor} !important;
            }
        `;
        document.head.appendChild(this.styleElement);
    }

    removeHoverStyle() {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
    }

    showAllOutlines() {
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'mte-outline-all-style';
        this.styleElement.textContent = `
            * {
                outline: 1px solid rgba(99, 102, 241, 0.5) !important;
            }
            *:hover {
                outline: 2px solid #6366f1 !important;
            }
        `;
        document.head.appendChild(this.styleElement);
    }

    removeAllOutlines() {
        const style = document.getElementById('mte-outline-all-style');
        if (style) style.remove();
    }

    showCSSPanel(el) {
        this.removeCSSPanel();
        this.selectedCSSElement = el;

        // Snapshot original computed styles BEFORE any edits
        const computed = window.getComputedStyle(el);
        const origValues = {
            width: computed.width,
            height: computed.height,
            backgroundColor: computed.backgroundColor,
            color: computed.color,
            fontSize: computed.fontSize,
            padding: computed.padding,
            margin: computed.margin,
            border: computed.border,
            borderRadius: computed.borderRadius
        };

        // Safe hex conversion - returns #000000 if transparent/unparseable (for color picker)
        const safeHex = (val) => {
            const hex = Utils.rgbToHex(val);
            return (hex && hex.startsWith('#')) ? hex : '#000000';
        };

        const panel = Utils.createEl('div', 'mte-css-panel');
        panel.id = 'mte-css-panel';

        // Helper to build a numeric row with stepper buttons
        const numericRow = (label, prop, value) => `
            <div class="mte-css-group">
                <label>${label}</label>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <input type="text" data-prop="${prop}" value="${value}" style="flex: 1;">
                    <button class="mte-css-step" data-prop="${prop}" data-dir="-1" title="-1px">▼</button>
                    <button class="mte-css-step" data-prop="${prop}" data-dir="1" title="+1px">▲</button>
                </div>
            </div>`;

        // Helper to build a color row
        const colorRow = (label, prop, value) => `
            <div class="mte-css-group">
                <label>${label}</label>
                <div style="display: flex; gap: 6px;">
                    <input type="color" data-prop="${prop}" value="${safeHex(value)}" style="width: 40px; height: 32px; padding: 2px; border: 1px solid #334155; border-radius: 4px; cursor: pointer;">
                    <input type="text" data-prop="${prop}" value="${value}" style="flex: 1;">
                </div>
            </div>`;

        panel.innerHTML = `
            <div class="mte-panel-header">
                <strong>Edit CSS</strong>
                <button class="mte-panel-close" id="mte-css-close">✕</button>
            </div>
            <div class="mte-panel-content" style="padding: 12px; max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 12px; font-size: 11px; color: #64748b;">&lt;${el.tagName.toLowerCase()}&gt;</div>
                
                ${numericRow('Width', 'width', origValues.width)}
                ${numericRow('Height', 'height', origValues.height)}
                ${colorRow('Background', 'backgroundColor', origValues.backgroundColor)}
                ${colorRow('Color', 'color', origValues.color)}
                ${numericRow('Font Size', 'fontSize', origValues.fontSize)}
                ${numericRow('Padding', 'padding', origValues.padding)}
                ${numericRow('Margin', 'margin', origValues.margin)}
                <div class="mte-css-group">
                    <label>Border</label>
                    <input type="text" data-prop="border" value="${origValues.border}">
                </div>
                ${numericRow('Border Radius', 'borderRadius', origValues.borderRadius)}
                
                <button id="mte-css-apply" style="
                    width: 100%;
                    margin-top: 12px;
                    padding: 10px;
                    background: #6366f1;
                    color: #fff;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 500;
                ">Apply All</button>
            </div>
            <style>
                .mte-css-group {
                    margin-bottom: 10px;
                }
                .mte-css-group label {
                    display: block;
                    font-size: 11px;
                    color: #94a3b8;
                    margin-bottom: 4px;
                }
                .mte-css-group input[type="text"] {
                    width: 100%;
                    padding: 6px 8px;
                    background: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 4px;
                    color: #e2e8f0;
                    font-size: 12px;
                    font-family: monospace;
                    box-sizing: border-box;
                }
                .mte-css-group input[type="text"]:focus {
                    outline: none;
                    border-color: #6366f1;
                }
                .mte-css-step {
                    width: 28px;
                    height: 28px;
                    background: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 4px;
                    color: #e2e8f0;
                    cursor: pointer;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all 0.1s;
                }
                .mte-css-step:hover {
                    background: #334155;
                    border-color: #6366f1;
                }
                .mte-css-step:active {
                    background: #6366f1;
                }
            </style>
        `;

        document.body.appendChild(panel);
        this.cssPanel = panel;

        // Close button
        document.getElementById('mte-css-close').onclick = () => this.removeCSSPanel();

        // Stepper buttons (▲▼)
        panel.querySelectorAll('.mte-css-step').forEach(stepBtn => {
            stepBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const prop = stepBtn.dataset.prop;
                const dir = parseInt(stepBtn.dataset.dir, 10);
                const textInput = panel.querySelector(`input[type="text"][data-prop="${prop}"]`);
                if (!textInput) return;

                const current = textInput.value;
                // Parse numeric value and unit
                const match = current.match(/^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|pt)?$/);
                if (match) {
                    const num = parseFloat(match[1]) + dir;
                    const unit = match[2] || 'px';
                    const newVal = num + unit;
                    textInput.value = newVal;
                    el.style[prop] = newVal;
                }
            });
        });

        // Sync color picker with text input
        panel.querySelectorAll('input[type="color"]').forEach(colorInput => {
            colorInput.addEventListener('input', (e) => {
                const prop = e.target.dataset.prop;
                const textInput = panel.querySelector(`input[type="text"][data-prop="${prop}"]`);
                if (textInput) textInput.value = e.target.value;
                el.style[prop] = e.target.value;
            });
        });

        // Live preview on text change
        panel.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const prop = e.target.dataset.prop;
                el.style[prop] = e.target.value;
            });
        });

        // Apply all button
        document.getElementById('mte-css-apply').onclick = () => {
            panel.querySelectorAll('input[type="text"]').forEach(input => {
                const prop = input.dataset.prop;
                if (prop) el.style[prop] = input.value;
            });
            this.manager.showToast('CSS applied');
        };
    }

    removeCSSPanel() {
        if (this.cssPanel) {
            this.cssPanel.remove();
            this.cssPanel = null;
        }
    }
}
