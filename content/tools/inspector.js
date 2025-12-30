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
