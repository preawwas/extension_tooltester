# Extension Tool Tester

**Owner / Creator**: Praew (แพรว)

A comprehensive browser extension toolkit designed for developers and testers to debug, inspect, and analyze web pages efficiently.

## Features

*   **🎨 Color Picker**: Easily extract and copy text, background, and border colors from any element.
*   **🔍 Inspector**: Inspect element properties like size, margin, padding, font, and more with a single click.
*   **📝 Live Editor**: Edit text, move elements, delete nodes, and modify CSS in real-time directly on the page.
*   **📡 API Monitor**: Monitor background API requests (Fetch/XHR), inspect payloads/responses, and copy as cURL or JSON.
*   **🔤 Font Scanner**: Scan and list all font sizes used on the current page.
*   **📱 Responsive Viewer**: Preview the application in multiple screen sizes simultaneously to ensure responsiveness.
*   **🧹 Clear Cache**: Quickly clear cache, cookies, local storage, and history.

## Installation

1.  Clone or download this repository.
2.  Open Chrome/Edge and navigate to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `extension_tooltester` directory.

## Project Structure

This project has been modularized for better maintainability:

```
extension_tooltester/
├── manifest.json            # Extension configuration
├── background/
│   └── background.js        # Service worker
├── content/
│   ├── main.js              # Entry point
│   ├── manager.js           # Extension Manager class
│   ├── utils.js             # Shared utilities
│   ├── tools/               # Individual tool modules
│   │   ├── api-monitor.js
│   │   ├── color-picker.js
│   │   ├── font-scanner.js
│   │   ├── inspector.js
│   │   └── live-editor.js
│   ├── interceptor.js       # Network request interceptor
│   └── content.css          # Shared styles
└── popup/
    ├── popup.html           # Popup UI
    └── popup.js             # Popup logic
```

## Usage

Click the extension icon in your browser toolbar to open the popup. From there, you can toggle individual tools on or off. Most tools will show a floating control panel or an overlay on the web page when active.
