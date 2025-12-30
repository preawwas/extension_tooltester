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
