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
                // Global activeTool is deprecated for API Monitor in favor of per-tab state.
                // We keep it for other tools if they still rely on it, OR we simply ignore it for API Monitor.
                // For now, let's strictly ignore API Monitor updates here to prevent auto-opening.
                const newVal = changes.activeTool.newValue;
                if (newVal !== 'apiMonitor' && newVal) {
                    // Handle other tools if needed
                } else if (!newVal && this.apiMonitor.active) {
                    // If global tool is cleared, maybe we should close?
                    // No, per-tab isolation means global state doesn't dictate specific tab state unless explicitly requested.
                    // However, "Close All" might set activeTool to null?
                    // Let's rely on 'requestCloseAll' message instead.
                }
            }
        });

        // Initialize State
        this.restoreState();
    }

    restoreState() {
        chrome.storage.local.get(['persistentMode', 'activeTool', 'activeToolArgs'], (res) => {
            if (res.persistentMode && res.activeTool) {
                // API Monitor state is now handled by background script 'onUpdated' -> sending specific message
                // So we do NOT auto-enable here for API Monitor.

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
            const forceState = (typeof req.force === 'boolean') ? req.force : null;
            this.apiMonitor.toggle(forceState, req.silent || false);
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
