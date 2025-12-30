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
