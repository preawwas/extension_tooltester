/**
 * Live Editor Tool - 6 Modes
 */
class LiveEditorTool {
    constructor(manager) {
        this.manager = manager;
        this.mode = null;
        this.active = false;
        this.styleElement = null;
        this.cssPanel = null;

        this.handleClick = this.handleClick.bind(this);
        this.handleHover = this.handleHover.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDrag = this.handleDrag.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);

        this.draggedElement = null;
        this.dragOffset = { x: 0, y: 0 };
    }

    toggle(mode) {
        // If same mode, toggle off
        if (this.active && this.mode === mode) {
            this.deactivate();
            return;
        }

        // Deactivate previous mode
        if (this.active) {
            this.deactivate();
        }

        this.mode = mode;
        this.active = true;
        this.activate();
    }

    activate() {
        const modeNames = {
            editText: 'Edit Text',
            moveElements: 'Move Elements',
            deleteElements: 'Delete Elements',
            cloneElements: 'Clone Elements',
            outlineAll: 'Outline All',
            editCSS: 'Edit CSS'
        };

        this.manager.showFloatingControl(`Live Editor: ${modeNames[this.mode]}`, () => this.deactivate());

        switch (this.mode) {
            case 'editText':
                document.body.contentEditable = 'true';
                document.body.style.cursor = 'text';
                this.manager.showToast('Click anywhere to edit text');
                break;

            case 'moveElements':
                document.body.style.cursor = 'move';
                document.addEventListener('mousedown', this.handleDragStart, true);
                document.addEventListener('mousemove', this.handleDrag, true);
                document.addEventListener('mouseup', this.handleDragEnd, true);
                document.addEventListener('mouseover', this.handleHover, true);
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

    deactivate() {
        document.body.contentEditable = 'false';
        document.body.style.cursor = 'default';
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('mouseover', this.handleHover, true);
        document.removeEventListener('mousedown', this.handleDragStart, true);
        document.removeEventListener('mousemove', this.handleDrag, true);
        document.removeEventListener('mouseup', this.handleDragEnd, true);

        this.removeHoverStyle();
        this.removeAllOutlines();
        this.removeCSSPanel();

        document.querySelectorAll('[data-mte-hovered]').forEach(el => {
            el.removeAttribute('data-mte-hovered');
            el.style.outline = '';
            el.style.backgroundColor = '';
        });

        this.manager.removeFloatingControl();
        this.manager.showToast('Live Editor Inactive');
        this.active = false;
        this.mode = null;
    }

    handleHover(e) {
        if (e.target.closest('.mte-floating-control') || e.target.closest('#mte-css-panel')) return;

        e.stopPropagation();

        document.querySelectorAll('[data-mte-hovered]').forEach(el => {
            el.removeAttribute('data-mte-hovered');
        });

        e.target.setAttribute('data-mte-hovered', 'true');
    }

    handleClick(e) {
        if (e.target.closest('.mte-floating-control') || e.target.closest('#mte-css-panel')) return;

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
        if (e.target.closest('.mte-floating-control')) return;
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

        const computed = window.getComputedStyle(el);
        const panel = Utils.createEl('div', 'mte-css-panel');
        panel.id = 'mte-css-panel';

        panel.innerHTML = `
            <div class="mte-panel-header">
                <strong>Edit CSS</strong>
                <button class="mte-panel-close" id="mte-css-close">✕</button>
            </div>
            <div class="mte-panel-content" style="padding: 12px; max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 12px; font-size: 11px; color: #64748b;">&lt;${el.tagName.toLowerCase()}&gt;</div>
                
                <div class="mte-css-group">
                    <label>Width</label>
                    <input type="text" data-prop="width" value="${computed.width}">
                </div>
                <div class="mte-css-group">
                    <label>Height</label>
                    <input type="text" data-prop="height" value="${computed.height}">
                </div>
                <div class="mte-css-group">
                    <label>Background</label>
                    <div style="display: flex; gap: 6px;">
                        <input type="color" data-prop="backgroundColor" value="${Utils.rgbToHex(computed.backgroundColor)}" style="width: 40px; height: 32px; padding: 2px; border: 1px solid #334155; border-radius: 4px; cursor: pointer;">
                        <input type="text" data-prop="backgroundColor" value="${computed.backgroundColor}" style="flex: 1;">
                    </div>
                </div>
                <div class="mte-css-group">
                    <label>Color</label>
                    <div style="display: flex; gap: 6px;">
                        <input type="color" data-prop="color" value="${Utils.rgbToHex(computed.color)}" style="width: 40px; height: 32px; padding: 2px; border: 1px solid #334155; border-radius: 4px; cursor: pointer;">
                        <input type="text" data-prop="color" value="${computed.color}" style="flex: 1;">
                    </div>
                </div>
                <div class="mte-css-group">
                    <label>Font Size</label>
                    <input type="text" data-prop="fontSize" value="${computed.fontSize}">
                </div>
                <div class="mte-css-group">
                    <label>Padding</label>
                    <input type="text" data-prop="padding" value="${computed.padding}">
                </div>
                <div class="mte-css-group">
                    <label>Margin</label>
                    <input type="text" data-prop="margin" value="${computed.margin}">
                </div>
                <div class="mte-css-group">
                    <label>Border</label>
                    <input type="text" data-prop="border" value="${computed.border}">
                </div>
                <div class="mte-css-group">
                    <label>Border Radius</label>
                    <input type="text" data-prop="borderRadius" value="${computed.borderRadius}">
                </div>
                
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
                }
                .mte-css-group input[type="text"]:focus {
                    outline: none;
                    border-color: #6366f1;
                }
            </style>
        `;

        document.body.appendChild(panel);
        this.cssPanel = panel;

        // Close button
        document.getElementById('mte-css-close').onclick = () => this.removeCSSPanel();

        // Sync color picker with text input
        panel.querySelectorAll('input[type="color"]').forEach(colorInput => {
            colorInput.addEventListener('input', (e) => {
                const prop = e.target.dataset.prop;
                const textInput = panel.querySelector(`input[type="text"][data-prop="${prop}"]`);
                if (textInput) textInput.value = e.target.value;
                // Live preview
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
