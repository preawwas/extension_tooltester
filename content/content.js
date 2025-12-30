console.log('Modern Tester Extension loaded');

/**
 * Utility Functions
 */
const Utils = {
    rgbToHex(rgb) {
        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return 'transparent';
        if (rgb.startsWith('#')) return rgb;
        if (rgb === 'inherit' || rgb === 'initial') return rgb;

        // Extract numbers from rgb() or rgba()
        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return rgb; // Return original if can't parse

        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);

        // Check for NaN
        if (isNaN(r) || isNaN(g) || isNaN(b)) return rgb;

        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    },

    createEl(tag, className, text = null) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

/**
 * Inspector Tool
 */
class InspectorTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.hoveredElement = null;
        this.tooltip = null;
        this.panel = null;
        this.selectedElement = null;

        this.handleHover = this.handleHover.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }

    toggle(forceState = null) {
        this.active = forceState !== null ? forceState : !this.active;

        if (this.active) {
            document.body.style.cursor = 'crosshair';
            document.addEventListener('mouseover', this.handleHover, true);
            document.addEventListener('mousemove', this.handleMouseMove, true);
            document.addEventListener('click', this.handleClick, true);
            this.manager.showToast('Inspector Mode Active');
            this.manager.showFloatingControl('Inspector Mode', () => this.toggle(false));
        } else {
            document.body.style.cursor = 'default';
            document.removeEventListener('mouseover', this.handleHover, true);
            document.removeEventListener('mousemove', this.handleMouseMove, true);
            document.removeEventListener('click', this.handleClick, true);
            this.removeTooltip();
            this.removePanel();
            if (this.hoveredElement) {
                this.hoveredElement.style.outline = '';
            }
            this.manager.showToast('Inspector Mode Inactive');
            this.manager.removeFloatingControl();
        }
        this.manager.updateToolState('inspector', this.active);
    }

    handleHover(e) {
        if (!this.active) return;

        // Skip MTE UI elements (panel, tooltip, floating control)
        if (e.target.closest('#mte-inspector-panel') ||
            e.target.closest('.mte-inspector-tooltip') ||
            e.target.closest('.mte-floating-control')) {
            return;
        }

        e.stopPropagation();

        if (this.hoveredElement && this.hoveredElement !== this.selectedElement) {
            this.hoveredElement.style.outline = '';
        }

        this.hoveredElement = e.target;
        if (this.hoveredElement !== this.selectedElement) {
            this.hoveredElement.style.outline = '2px dashed #6366f1';
        }

        this.updateTooltip(e.target);
    }

    handleMouseMove(e) {
        if (!this.active || !this.tooltip) return;

        // Hide tooltip when over MTE UI
        if (e.target.closest('#mte-inspector-panel') ||
            e.target.closest('.mte-floating-control')) {
            this.tooltip.style.display = 'none';
            return;
        }
        this.tooltip.style.display = 'flex';

        this.tooltip.style.left = `${e.clientX + 15}px`;
        this.tooltip.style.top = `${e.clientY + 15}px`;
    }

    handleClick(e) {
        if (!this.active) return;

        // Skip MTE UI elements
        if (e.target.closest('#mte-inspector-panel') ||
            e.target.closest('.mte-inspector-tooltip') ||
            e.target.closest('.mte-floating-control')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Clear previous selection outline
        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
        }

        this.selectedElement = e.target;
        this.selectedElement.style.outline = '2px solid #6366f1';

        const el = e.target;
        const computed = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const info = {
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            classes: Array.from(el.classList).join(' ') || '',
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            color: computed.color,
            bg: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontFamily: computed.fontFamily.split(',')[0].replace(/"/g, ''),
            margin: computed.margin,
            padding: computed.padding,
            position: computed.position,
            display: computed.display
        };

        this.showPanel(info);
    }

    updateTooltip(el) {
        if (!this.tooltip) {
            this.tooltip = Utils.createEl('div', 'mte-inspector-tooltip');
            document.body.appendChild(this.tooltip);
        }

        const rect = el.getBoundingClientRect();
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.classList.length > 0 ? `.${Array.from(el.classList).slice(0, 2).join('.')}` : '';

        this.tooltip.innerHTML = `
            <strong>${tag}${id}${cls}</strong>
            <span>${Math.round(rect.width)} × ${Math.round(rect.height)}</span>
        `;
    }

    removeTooltip() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }

    showPanel(info) {
        this.removePanel();

        const panel = Utils.createEl('div', 'mte-inspector-panel');
        panel.id = 'mte-inspector-panel';

        // Header
        const header = Utils.createEl('div', 'mte-panel-header');
        header.innerHTML = `<strong>&lt;${info.tag}&gt;</strong>`;
        const closeBtn = Utils.createEl('button', 'mte-panel-close', '✕');
        closeBtn.onclick = () => this.removePanel();
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Content
        const content = Utils.createEl('div', 'mte-panel-content');

        // ID & Classes section
        if (info.id || info.classes) {
            const idSection = Utils.createEl('div', 'mte-panel-section');
            if (info.id) idSection.appendChild(this.createRow('ID', `#${info.id}`));
            if (info.classes) idSection.appendChild(this.createRow('Class', `.${info.classes.split(' ').join('.')}`));
            content.appendChild(idSection);
        }

        // Size section
        const sizeSection = Utils.createEl('div', 'mte-panel-section');
        sizeSection.appendChild(this.createRow('Size', `${info.width} × ${info.height}px`));
        sizeSection.appendChild(this.createRow('Display', info.display));
        sizeSection.appendChild(this.createRow('Position', info.position));
        content.appendChild(sizeSection);

        // Typography section
        const typoSection = Utils.createEl('div', 'mte-panel-section');
        typoSection.appendChild(this.createColorRow('Color', info.color));
        typoSection.appendChild(this.createColorRow('Background', info.bg));
        typoSection.appendChild(this.createRow('Font', `${info.fontSize} ${info.fontFamily}`));
        content.appendChild(typoSection);

        // Spacing section
        const spaceSection = Utils.createEl('div', 'mte-panel-section');
        spaceSection.appendChild(this.createRow('Margin', info.margin));
        spaceSection.appendChild(this.createRow('Padding', info.padding));
        content.appendChild(spaceSection);

        // Copy All button
        const copyAllSection = Utils.createEl('div', 'mte-panel-section');
        const copyAllBtn = Utils.createEl('button', 'mte-copy-all-btn', '📋 Copy All');
        copyAllBtn.onclick = (e) => {
            e.stopPropagation();
            const allData = [
                info.id ? `ID: #${info.id}` : '',
                info.classes ? `Class: .${info.classes.split(' ').join('.')}` : '',
                `Size: ${info.width} × ${info.height}px`,
                `Display: ${info.display}`,
                `Position: ${info.position}`,
                `Color: ${info.color}`,
                `Background: ${info.bg}`,
                `Font: ${info.fontSize} ${info.fontFamily}`,
                `Margin: ${info.margin}`,
                `Padding: ${info.padding}`
            ].filter(Boolean).join('\n');

            navigator.clipboard.writeText(allData);
            copyAllBtn.textContent = '✓ Copied!';
            setTimeout(() => copyAllBtn.textContent = '📋 Copy All', 1500);
        };
        copyAllSection.appendChild(copyAllBtn);
        content.appendChild(copyAllSection);

        panel.appendChild(content);
        document.body.appendChild(panel);
        this.panel = panel;
    }

    createRow(label, value) {
        const row = Utils.createEl('div', 'mte-panel-row');
        row.innerHTML = `<span class="mte-label">${label}</span><span class="mte-value">${value}</span>`;

        const copyBtn = Utils.createEl('button', 'mte-copy-btn', '📋');
        copyBtn.title = 'Copy';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(value);
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1000);
        };
        row.appendChild(copyBtn);
        return row;
    }

    createColorRow(label, value) {
        const row = Utils.createEl('div', 'mte-panel-row');
        const swatch = `<span class="mte-swatch" style="background:${value}"></span>`;
        row.innerHTML = `<span class="mte-label">${label}</span><span class="mte-value">${swatch}${value}</span>`;

        const copyBtn = Utils.createEl('button', 'mte-copy-btn', '📋');
        copyBtn.title = 'Copy';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(value);
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1000);
        };
        row.appendChild(copyBtn);
        return row;
    }

    removePanel() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
            this.selectedElement = null;
        }
    }
}

/**
 * Color Picker Tool
 */
class ColorPickerTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.tooltip = null;
        this.panel = null;
        this.selectedElement = null;

        this.handleHover = this.handleHover.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }

    toggle(forceState = null) {
        this.active = forceState !== null ? forceState : !this.active;

        if (this.active && this.manager.inspector.active) {
            this.manager.inspector.toggle(false);
        }

        if (this.active) {
            document.body.style.cursor = 'crosshair';
            document.addEventListener('mousemove', this.handleHover, true);
            document.addEventListener('click', this.handleClick, true);
            this.manager.showToast('Color Picker Active');
            this.manager.showFloatingControl('Color Picker Mode', () => this.toggle(false));
        } else {
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', this.handleHover, true);
            document.removeEventListener('click', this.handleClick, true);
            this.removeTooltip();
            this.removePanel();
            this.manager.showToast('Color Picker Inactive');
            this.manager.removeFloatingControl();
        }
    }

    handleHover(e) {
        if (!this.active) return;

        // Skip MTE UI elements
        if (e.target.closest('#mte-color-panel') ||
            e.target.closest('.mte-color-tooltip') ||
            e.target.closest('.mte-floating-control')) {
            if (this.tooltip) this.tooltip.style.display = 'none';
            return;
        }

        e.stopPropagation();

        const el = e.target;
        const style = window.getComputedStyle(el);
        this.showTooltip(e.clientX, e.clientY, style.color, style.backgroundColor);
    }

    handleClick(e) {
        if (!this.active) return;

        // Skip MTE UI elements
        if (e.target.closest('#mte-color-panel') ||
            e.target.closest('.mte-color-tooltip') ||
            e.target.closest('.mte-floating-control')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
        }

        this.selectedElement = e.target;
        this.selectedElement.style.outline = '2px solid #6366f1';

        const style = window.getComputedStyle(e.target);
        const info = {
            textColor: style.color,
            textColorHex: Utils.rgbToHex(style.color),
            bgColor: style.backgroundColor,
            bgColorHex: Utils.rgbToHex(style.backgroundColor),
            borderColor: style.borderColor,
            borderColorHex: Utils.rgbToHex(style.borderColor)
        };

        this.showPanel(info);
    }

    showTooltip(x, y, color, bg) {
        if (!this.tooltip) {
            this.tooltip = Utils.createEl('div', 'mte-color-tooltip');
            this.tooltip.id = 'mte-color-tooltip';
            document.body.appendChild(this.tooltip);
        }

        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${x + 15}px`;
        this.tooltip.style.top = `${y + 15}px`;

        const colorHex = Utils.rgbToHex(color);
        const bgHex = Utils.rgbToHex(bg);

        this.tooltip.innerHTML = `
            <div class="mte-color-row">
                <span class="mte-swatch" style="background:${color}"></span>
                <span>Text: ${colorHex}</span>
            </div>
            <div class="mte-color-row">
                <span class="mte-swatch" style="background:${bg}"></span>
                <span>Bg: ${bgHex}</span>
            </div>
        `;
    }

    removeTooltip() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }

    showPanel(info) {
        this.removePanel();

        const panel = Utils.createEl('div', 'mte-color-panel');
        panel.id = 'mte-color-panel';

        // Header
        const header = Utils.createEl('div', 'mte-panel-header');
        header.innerHTML = '<strong>Color Picker</strong>';
        const closeBtn = Utils.createEl('button', 'mte-panel-close', '✕');
        closeBtn.onclick = () => this.removePanel();
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Content
        const content = Utils.createEl('div', 'mte-panel-content');

        // Color rows
        const section = Utils.createEl('div', 'mte-panel-section');
        section.appendChild(this.createColorRow('Text Color', info.textColor, info.textColorHex));
        section.appendChild(this.createColorRow('Background', info.bgColor, info.bgColorHex));
        section.appendChild(this.createColorRow('Border', info.borderColor, info.borderColorHex));
        content.appendChild(section);

        // Copy All button
        const copySection = Utils.createEl('div', 'mte-panel-section');
        const copyAllBtn = Utils.createEl('button', 'mte-copy-all-btn', '📋 Copy All Colors');
        copyAllBtn.onclick = (e) => {
            e.stopPropagation();
            const allData = [
                `Text: ${info.textColorHex}`,
                `Background: ${info.bgColorHex}`,
                `Border: ${info.borderColorHex}`
            ].join('\n');
            navigator.clipboard.writeText(allData);
            copyAllBtn.textContent = '✓ Copied!';
            setTimeout(() => copyAllBtn.textContent = '📋 Copy All Colors', 1500);
        };
        copySection.appendChild(copyAllBtn);
        content.appendChild(copySection);

        panel.appendChild(content);
        document.body.appendChild(panel);
        this.panel = panel;
    }

    createColorRow(label, rgbValue, hexValue) {
        const row = Utils.createEl('div', 'mte-panel-row');
        row.innerHTML = `
            <span class="mte-label">${label}</span>
            <span class="mte-value">
                <span class="mte-swatch" style="background:${rgbValue}"></span>
                ${hexValue}
            </span>
        `;

        const copyBtn = Utils.createEl('button', 'mte-copy-btn', '📋');
        copyBtn.title = 'Copy';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(hexValue);
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = '📋', 1000);
        };
        row.appendChild(copyBtn);
        return row;
    }

    removePanel() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        if (this.selectedElement) {
            this.selectedElement.style.outline = '';
            this.selectedElement = null;
        }
    }
}

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

/**
 * API Monitor Tool
 */
class ApiMonitorTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.overlay = null;
        this.interceptorInjected = false;
        this.displayedTimestamps = new Map();
        this.pendingRequests = [];

        this.handleMessage = this.handleMessage.bind(this);
    }

    toggle(forceState = null) {
        this.active = forceState !== null ? forceState : !this.active;

        if (this.active) {
            if (!this.interceptorInjected) {
                this.injectInterceptor();
                this.interceptorInjected = true;
            }

            if (window.top === window.self) {
                this.showOverlay();
            }

            window.removeEventListener('message', this.handleMessage);
            window.addEventListener('message', this.handleMessage);
            this.manager.showToast('API Monitor Active');
        } else {
            if (window.top === window.self) {
                this.removeOverlay();
                this.manager.showToast('API Monitor Hidden');
            }
        }

        if (window.top === window.self) {
            this.manager.updateToolState('apiMonitor', this.active);
        }
    }

    injectInterceptor() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('content/interceptor.js');
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    }

    handleMessage(e) {
        // Pre-init buffer handled by manager if needed, but here check source
        if (!e.data || e.data.source !== 'mte-api-monitor') return;
        if (!this.active) return;

        // Filter 'pvg' (keep existing logic)
        if (e.data.url && e.data.url.toLowerCase().includes('pvg')) return;

        if (window.top === window.self) {
            if (this.overlay) {
                this.addRequest(e.data);
            } else {
                this.pendingRequests.push(e.data);
            }
        } else {
            chrome.runtime.sendMessage({ action: 'forwardApiData', data: e.data });
        }
    }

    showOverlay() {
        const existing = document.getElementById('mte-api-monitor');
        if (existing) {
            this.overlay = existing;
            this.overlay.style.display = 'flex';
            return;
        }

        const overlay = Utils.createEl('div');
        overlay.id = 'mte-api-monitor';

        // Header
        const header = Utils.createEl('div');
        header.id = 'mte-api-header';

        const left = Utils.createEl('div', 'mte-api-controls');
        const title = Utils.createEl('span', 'mte-api-title', 'API Monitor');
        const count = Utils.createEl('span', '', '0');
        count.id = 'mte-req-count';
        left.appendChild(title);
        left.appendChild(count);

        const right = Utils.createEl('div', 'mte-api-controls');
        const clearBtn = Utils.createEl('button', '', 'Clear');
        clearBtn.id = 'mte-api-clear';
        clearBtn.onclick = () => this.clearRequests();

        const closeBtn = Utils.createEl('button', '', '✕');
        closeBtn.id = 'mte-api-close';
        closeBtn.onclick = () => this.toggle(false);

        right.appendChild(clearBtn);
        right.appendChild(closeBtn);

        header.appendChild(left);
        header.appendChild(right);

        // Content
        const content = Utils.createEl('div');
        content.id = 'mte-api-content';

        overlay.appendChild(header);
        overlay.appendChild(content);

        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Initialize Drag
        this.initDrag(header, overlay);

        // Flush pending
        this.pendingRequests.forEach(req => this.addRequest(req));
        this.pendingRequests = [];
    }

    removeOverlay() {
        if (this.overlay) this.overlay.remove();
        this.overlay = null;
    }

    clearRequests() {
        if (!this.overlay) return;
        const content = this.overlay.querySelector('#mte-api-content');
        if (content) content.innerHTML = '';
        this.displayedTimestamps.clear();
        const countEl = document.getElementById('mte-req-count');
        if (countEl) countEl.textContent = '0';
    }

    initDrag(handle, target) {
        let isDragging = false, startX, startY, initialX, initialY, xOffset = 0, yOffset = 0;

        handle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            if (e.target === handle || handle.contains(e.target)) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                const currentX = e.clientX - initialX;
                const currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                target.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            }
        }

        function dragEnd() {
            isDragging = false;
        }
    }

    addRequest(data) {
        if (!this.overlay) return;

        // Filter images
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.tiff', '.bmp'];
        try {
            if (data.url) {
                const urlLower = data.url.toLowerCase().split('?')[0];
                if (imageExtensions.some(ext => urlLower.endsWith(ext))) return;
            }
        } catch (e) { }

        const content = this.overlay.querySelector('#mte-api-content');
        const itemId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const item = Utils.createEl('div', 'mte-api-item');
        item.id = itemId;

        // Full URL for cURL
        let fullUrl = data.url;
        try {
            fullUrl = new URL(data.url, window.location.origin).href;
        } catch (e) { }

        // === Top Row (Time on left, Duration on right) ===
        const topRow = Utils.createEl('div', 'mte-top-row');
        topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';

        // Time on left
        const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString('en-US', { hour12: false });
        const dupKey = `${timeStr}|${data.method}|${data.url}`;
        let dupCount = (this.displayedTimestamps.get(dupKey) || 0) + 1;
        this.displayedTimestamps.set(dupKey, dupCount);

        // Time badge (Header style)
        const isDup = dupCount > 1;
        const timeSpan = Utils.createEl('span', 'mte-time', timeStr);
        timeSpan.style.cssText = `
            font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
            color: ${isDup ? '#dc2626' : '#475569'}; 
            background: ${isDup ? '#fee2e2' : '#e2e8f0'}; 
            padding: 2px 8px; border-radius: 4px;
        `;
        topRow.appendChild(timeSpan);

        // Duration on right with color coding
        if (data.duration) {
            const dur = parseInt(data.duration);
            let durColor, durBg, durBorder;
            if (dur < 250) {
                // Fast - Green
                durColor = '#15803d'; durBg = '#dcfce7'; durBorder = '#86efac';
            } else if (dur < 500) {
                // Medium - Yellow
                durColor = '#a16207'; durBg = '#fef9c3'; durBorder = '#fde047';
            } else {
                // Slow - Red
                durColor = '#b91c1c'; durBg = '#fee2e2'; durBorder = '#fca5a5';
            }
            const durationSpan = Utils.createEl('span', 'mte-duration', `${data.duration}ms`);
            durationSpan.style.cssText = `
                font-size: 11px; font-weight: 600; 
                color: ${durColor}; background: ${durBg}; 
                border: 1px solid ${durBorder};
                padding: 2px 8px; border-radius: 4px;
            `;
            topRow.appendChild(durationSpan);
        }

        item.appendChild(topRow);

        // === Header Row (Method, Status, URL) ===
        const header = Utils.createEl('div', 'mte-api-item-header');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 10px;';

        const methodClasses = `mte-method-badge mte-method-${data.method}`;
        const methodSpan = Utils.createEl('span', methodClasses, data.method);

        let statusClass = 'mte-status-DEFAULT';
        const s = data.status;
        if (s >= 200 && s < 300) statusClass = 'mte-status-2xx';
        else if (s >= 300 && s < 400) statusClass = 'mte-status-3xx';
        else if (s >= 400) statusClass = 'mte-status-4xx';

        const statusSpan = Utils.createEl('span', `mte-status-badge ${statusClass}`, s);

        let pathname = data.url;
        try {
            const urlObj = new URL(data.url, window.location.origin);
            pathname = urlObj.pathname;
        } catch (e) { }

        const urlSpan = Utils.createEl('span', 'mte-api-url', pathname);
        urlSpan.title = fullUrl;
        urlSpan.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; font-size: 13px;';

        header.appendChild(methodSpan);
        header.appendChild(statusSpan);
        header.appendChild(urlSpan);
        item.appendChild(header);

        // === Menu Button (will be added to tabs row) ===
        // === Menu Button (will be added to tabs row) ===
        const menuBtn = Utils.createEl('button', 'mte-menu-btn', '⋮');
        menuBtn.id = `menu-btn-${itemId}`;
        menuBtn.style.cssText = `
            background: transparent; border: none; 
            padding: 2px 6px; cursor: pointer; font-size: 16px; color: #94a3b8;
            font-weight: bold; line-height: 1; border-radius: 4px; transition: all 0.2s;
        `;
        menuBtn.onmouseover = () => { menuBtn.style.background = '#f1f5f9'; };
        menuBtn.onmouseout = () => { menuBtn.style.background = 'transparent'; };

        // Dropdown Menu
        // Use top instead of bottom to open downwards
        const menuDropdown = Utils.createEl('div', 'mte-menu-dropdown');
        menuDropdown.id = `menu-dropdown-${itemId}`;
        menuDropdown.style.cssText = `
            display: none; position: absolute; right: 0; top: calc(100% + 2px);
            background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
            z-index: 50; min-width: 120px; flex-direction: column; padding: 2px;
        `;

        // Check for payload data (body OR url params)
        let urlParamsObj = {};
        try {
            const urlObj = new URL(data.url, window.location.origin);
            if (urlObj.search && urlObj.search.length > 1) {
                urlObj.searchParams.forEach((value, key) => {
                    urlParamsObj[key] = value;
                });
            }
        } catch (e) { }

        const hasBodyPayload = data.payload && (typeof data.payload === 'object' ? Object.keys(data.payload).length > 0 : String(data.payload).trim().length > 0);
        const hasUrlParams = Object.keys(urlParamsObj).length > 0;
        const hasPayloadData = hasBodyPayload || hasUrlParams;
        const hasResponseData = data.response && String(data.response).trim().length > 0;

        const createMenuItem = (text, disabled = false) => {
            const btn = Utils.createEl('button', 'mte-menu-item', text);
            btn.style.cssText = `
                display: block; width: 100%; text-align: left; padding: 4px 8px;
                background: transparent; border: none; color: ${disabled ? '#cbd5e1' : '#334155'};
                font-size: 12px; font-weight: 500; cursor: ${disabled ? 'not-allowed' : 'pointer'};
                border-radius: 4px; transition: all 0.15s; margin-bottom: 2px;
            `;
            if (!disabled) {
                btn.onmouseover = () => { btn.style.background = '#f1f5f9'; btn.style.color = '#0f172a'; };
                btn.onmouseout = () => { btn.style.background = 'transparent'; btn.style.color = '#334155'; };
            }
            return btn;
        };

        const actionCurl = createMenuItem('Copy cURL');
        const actionPayload = createMenuItem('Copy Payload', !hasPayloadData);
        const actionResponse = createMenuItem('Copy Response', !hasResponseData);

        menuDropdown.appendChild(actionCurl);
        menuDropdown.appendChild(actionPayload);
        menuDropdown.appendChild(actionResponse);

        const menuContainer = Utils.createEl('div', 'mte-menu-container');
        menuContainer.style.cssText = 'position: relative;';
        menuContainer.appendChild(menuBtn);
        menuContainer.appendChild(menuDropdown);

        // === Tabs Row with Menu on right ===
        const tabsWrapper = Utils.createEl('div', 'mte-tabs-wrapper');
        tabsWrapper.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 1px solid #e2e8f0; margin-bottom: 10px; padding-bottom: 8px;
        `;

        const tabsRow = Utils.createEl('div', 'mte-tabs');
        tabsRow.style.cssText = 'display: inline-flex; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 2px;';

        const tabContentContainer = Utils.createEl('div', 'mte-tab-contents');
        tabContentContainer.style.cssText = 'padding-top: 4px;';

        // Helper to update tab styles
        const updateTabStyles = (btn, isActive) => {
            btn.style.background = isActive ? '#6366f1' : 'transparent';
            btn.style.color = isActive ? '#ffffff' : '#64748b';
            btn.style.boxShadow = isActive ? '0 2px 4px rgba(99, 102, 241, 0.3)' : 'none';
            btn.style.fontWeight = isActive ? '600' : '500';
        };

        // Create tab button
        const createTabBtn = (name, isActive) => {
            const btn = Utils.createEl('button', 'mte-tab-btn', name);
            btn.style.cssText = `
                border: none; border-radius: 4px; cursor: pointer;
                font-size: 12px; padding: 4px 16px; transition: all 0.15s ease;
            `;
            updateTabStyles(btn, isActive);
            return btn;
        };

        // Create content area (isResponse flag for different formatting)
        const createTabContent = (contentData, isVisible, noDataText, urlParamsHtml = '', isResponse = false) => {
            const content = Utils.createEl('div', 'mte-tab-content');
            content.style.cssText = `
                display: ${isVisible ? 'block' : 'none'}; 
                font-size: 13px; font-family: Consolas, Monaco, monospace;
                color: #334155; padding-top: 4px;
            `;

            const hasData = contentData && (typeof contentData === 'object' ? Object.keys(contentData).length > 0 : String(contentData).trim().length > 0);
            const hasUrlParams = urlParamsHtml && urlParamsHtml.length > 0;

            if (hasData || hasUrlParams) {
                // Both tabs use key-value grid format
                let html = '<div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 16px;">';

                // Add URL params first (for Payload tab)
                if (hasUrlParams) {
                    html += urlParamsHtml;
                }

                // Add body data
                if (hasData) {
                    try {
                        const obj = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
                        if (typeof obj === 'object' && obj !== null) {
                            for (const [key, value] of Object.entries(obj)) {
                                // Key column
                                html += `<div style="color: #64748b; font-weight: 600; font-size: 13px;">${Utils.escapeHtml(key)}</div>`;

                                // Value column - if object/array, show pretty JSON
                                if (typeof value === 'object' && value !== null) {
                                    const prettyVal = JSON.stringify(value, null, 2);
                                    html += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px; font-family: Consolas, monospace;">${Utils.escapeHtml(prettyVal)}</div>`;
                                } else {
                                    html += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px;">${Utils.escapeHtml(String(value))}</div>`;
                                }
                            }
                        } else {
                            html += `<div style="grid-column: 1 / -1;"><pre style="margin:0; white-space: pre-wrap; font-size: 12px;">${Utils.escapeHtml(String(contentData))}</pre></div>`;
                        }
                    } catch (e) {
                        html += `<div style="grid-column: 1 / -1;"><pre style="margin:0; white-space: pre-wrap; font-size: 12px;">${Utils.escapeHtml(String(contentData))}</pre></div>`;
                    }
                }

                html += '</div>';
                content.innerHTML = html;
            } else {
                content.innerHTML = `<span style="color: #94a3b8; font-style: italic;">${noDataText}</span>`;
            }

            return content;
        };

        // Parse URL params for Payload tab
        let urlParamsHtml = '';
        try {
            const urlObj = new URL(data.url, window.location.origin);
            if (urlObj.searchParams.size > 0) {
                urlObj.searchParams.forEach((value, key) => {
                    urlParamsHtml += `<div style="color: #64748b; font-weight: 600; font-size: 13px;">${Utils.escapeHtml(key)}</div>`;
                    urlParamsHtml += `<div style="color: #334155; white-space: pre-wrap; word-break: break-all; font-size: 13px;">${Utils.escapeHtml(value)}</div>`;
                });
            }
        } catch (e) { }

        const payloadBtn = createTabBtn('Payload', true);
        const responseBtn = createTabBtn('Response', false);
        const payloadContent = createTabContent(data.payload, true, 'No payload', urlParamsHtml, false);
        const responseContent = createTabContent(data.response, false, 'No response', '', true);

        // Tab switching with proper styles
        payloadBtn.onclick = () => {
            updateTabStyles(payloadBtn, true);
            updateTabStyles(responseBtn, false);
            payloadContent.style.display = 'block';
            responseContent.style.display = 'none';
        };

        responseBtn.onclick = () => {
            updateTabStyles(responseBtn, true);
            updateTabStyles(payloadBtn, false);
            responseContent.style.display = 'block';
            payloadContent.style.display = 'none';
        };

        // Hover effects
        [payloadBtn, responseBtn].forEach(btn => {
            btn.onmouseover = () => {
                if (!btn.classList.contains('active') && btn.style.background !== 'rgb(99, 102, 241)') {
                    btn.style.color = '#334155';
                    btn.style.background = 'rgba(255,255,255,0.5)';
                }
            };
            btn.onmouseout = () => {
                if (btn.style.background !== 'rgb(99, 102, 241)') {
                    const isActive = btn === payloadBtn ? payloadContent.style.display === 'block' : responseContent.style.display === 'block';
                    updateTabStyles(btn, isActive);
                }
            };
        });

        tabsRow.appendChild(payloadBtn);
        tabsRow.appendChild(responseBtn);
        tabsWrapper.appendChild(tabsRow);
        tabsWrapper.appendChild(menuContainer); // Menu on right of tabs row
        tabContentContainer.appendChild(payloadContent);
        tabContentContainer.appendChild(responseContent);

        item.appendChild(tabsWrapper);
        item.appendChild(tabContentContainer);

        // === Event Listeners ===
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('[id^="menu-dropdown-"]').forEach(el => el.style.display = 'none');
            menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'flex' : 'none';
        };

        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.style.display = 'none';
            }
        });

        actionCurl.onclick = () => {
            const cmd = this.generateCurl(data, fullUrl);
            navigator.clipboard.writeText(cmd);
            this.manager.showToast('cURL copied!');
            menuDropdown.style.display = 'none';
        };

        actionPayload.onclick = () => {
            if (!hasPayloadData) {
                menuDropdown.style.display = 'none';
                return;
            }
            // Prioritize body payload, fallback to URL params
            if (hasBodyPayload) {
                this.copyJson(data.payload);
            } else {
                this.copyJson(urlParamsObj);
            }
            menuDropdown.style.display = 'none';
        };

        actionResponse.onclick = () => {
            if (!data.response) return;
            this.copyJson(data.response);
            menuDropdown.style.display = 'none';
        };

        // Prepend to top
        if (content.firstChild) {
            content.insertBefore(item, content.firstChild);
        } else {
            content.appendChild(item);
        }

        const countEl = document.getElementById('mte-req-count');
        if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
    }

    copyJson(data) {
        let text = '';
        try {
            if (typeof data === 'string') {
                const obj = JSON.parse(data);
                text = JSON.stringify(obj, null, 2);
            } else {
                text = JSON.stringify(data, null, 2);
            }
        } catch (e) {
            text = String(data);
        }
        navigator.clipboard.writeText(text);
        this.manager.showToast('Copied!');
    }

    generateCurl(data, fullUrl) {
        let cmd = `curl -X ${data.method} "${fullUrl}"`;

        if (data.headers) {
            for (const [key, value] of Object.entries(data.headers)) {
                cmd += ` -H "${key}: ${value}"`;
            }
        }

        if (data.payload) {
            let body = data.payload;
            if (typeof body === 'object') {
                try { body = JSON.stringify(body); } catch (e) { }
            }
            if (typeof body === 'string') {
                body = body.replace(/'/g, "'\\''");
                cmd += ` -d '${body}'`;
            }
        }
        return cmd;
    }
}

/**
 * Font Scanner Tool
 */
const FontScanner = {
    scan() {
        const fontSizes = new Set();
        // Optimization: Use TreeWalker to filter text nodes only
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            const parent = node.parentElement;
            if (parent) {
                const style = window.getComputedStyle(parent);
                if (style.fontSize) fontSizes.add(style.fontSize);
            }
        }
        return Array.from(fontSizes).sort((a, b) => parseFloat(a) - parseFloat(b));
    },

    highlight(size) {
        document.querySelectorAll('.mte-highlight').forEach(el => el.classList.remove('mte-highlight'));
        if (!size) return;

        // Can't use TreeWalker easily for generic element highlighting by style, 
        // but querySelectorAll('*') is okay for highlighting if we filter fast.
        const all = document.querySelectorAll('*');
        for (const el of all) {
            // Basic visibility check could be added
            if (el.children.length === 0 && el.innerText) { // Leaf nodes mainly
                const s = window.getComputedStyle(el);
                if (s.fontSize === size) el.classList.add('mte-highlight');
            }
        }
    }
};

/**
 * Extension Manager
 */
class ExtensionManager {
    constructor() {
        this.inspector = new InspectorTool(this);
        this.colorPicker = new ColorPickerTool(this);
        this.apiMonitor = new ApiMonitorTool(this);
        this.liveEditor = new LiveEditorTool(this);
        this.floatingControl = null;

        this.init();
    }

    init() {
        // Listeners
        chrome.runtime.onMessage.addListener(this.handleRuntimeMessage.bind(this));

        // Storage Listener
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.activeTool) {
                const newVal = changes.activeTool.newValue;
                // Deactivate others?
                const tools = ['inspector', 'colorPicker', 'fontScanner', 'apiMonitor'];
                // Not necessarily, but let's follow logic

                if (newVal === 'apiMonitor') this.apiMonitor.toggle(true);
                else if (!newVal && this.apiMonitor.active) this.apiMonitor.toggle(false);
            }
        });

        // Initialize State
        this.restoreState();
    }

    restoreState() {
        chrome.storage.local.get(['persistentMode', 'activeTool', 'activeToolArgs'], (res) => {
            if (res.persistentMode && res.activeTool) {
                if (res.activeTool === 'apiMonitor') this.apiMonitor.toggle(true);
                if (res.activeTool === 'inspector') this.inspector.toggle(true);
                if (res.activeTool === 'colorPicker') this.colorPicker.toggle(true);
                if (res.activeTool === 'fontScanner' && res.activeToolArgs) {
                    FontScanner.highlight(res.activeToolArgs.fontSize);
                }
            }
        });
    }

    handleRuntimeMessage(req, sender, sendResp) {
        if (req.action === 'scanFonts') {
            const fonts = FontScanner.scan();
            chrome.runtime.sendMessage({ action: 'fontScanResults', data: fonts });
        } else if (req.action === 'toggleInspector') {
            this.inspector.toggle(req.force || null);
        } else if (req.action === 'toggleColorPicker') {
            this.colorPicker.toggle(req.force || null);
        } else if (req.action === 'highlightFont') {
            FontScanner.highlight(req.fontSize);
        } else if (req.action === 'toggleApiMonitor') {
            this.apiMonitor.toggle(req.force || null);
        } else if (req.action === 'receiveApiData') {
            if (window.top === window.self && this.apiMonitor.active) {
                this.apiMonitor.addRequest(req.data);
            }
        } else if (req.action === 'toggleLiveEditor') {
            this.liveEditor.toggle(req.mode);
        }
    }

    updateToolState(tool, active, args = null) {
        chrome.runtime.sendMessage({ action: 'toolStateUpdated', tool, active, args });
    }

    showToast(msg) {
        const toast = Utils.createEl('div', 'mte-toast', msg);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    showFloatingControl(text, onStop) {
        this.removeFloatingControl();
        const el = Utils.createEl('div', 'mte-floating-control');

        const span = Utils.createEl('span', '', text);
        const btn = Utils.createEl('button', '', 'Stop');
        btn.onclick = (e) => {
            e.stopPropagation();
            onStop();
        };

        el.appendChild(span);
        el.appendChild(btn);
        document.body.appendChild(el);
        this.floatingControl = el;
    }

    removeFloatingControl() {
        if (this.floatingControl) {
            this.floatingControl.remove();
            this.floatingControl = null;
        }
    }
}

// Instantiate
new ExtensionManager();
