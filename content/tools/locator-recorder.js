/**
 * Locator Recorder Tool
 * -----------------------------------------------------------------------------
 * Records elements from the page that is currently open and keeps two parallel
 * views of every captured element (rendered as two UI tabs):
 *
 *   1. Raw        — id / data-testid / name / class / aria-* ... each one checked
 *                   for uniqueness against the live DOM.
 *   2. Playwright — generated code, picking the HIGHEST usable tier in order:
 *                   getByRole() > getByLabel() > getByPlaceholder() >
 *                   getByTestId() > getByText() > locator(css) > XPath
 */

const LocatorEngine = {
    TEST_ATTRS: [
        'data-testid', 'data-test-id', 'data-test', 'data-cy',
        'data-qa', 'data-automation-id', 'data-e2e'
    ],

    ATTR_ROWS: ['name', 'aria-label', 'placeholder', 'role', 'type', 'title', 'alt', 'href', 'value'],

    // Roles whose accessible name may come from their own text content
    NAME_FROM_CONTENT: new Set([
        'button', 'link', 'heading', 'cell', 'gridcell', 'columnheader', 'rowheader',
        'option', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem',
        'switch', 'checkbox', 'radio', 'listitem', 'row', 'tooltip', 'status'
    ]),

    // Candidate pools used to count how many elements share a role
    ROLE_SELECTORS: {
        button: 'button, summary, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]',
        link: 'a[href], area[href], [role="link"]',
        textbox: 'input, textarea, [role="textbox"], [contenteditable="true"]',
        searchbox: 'input[type="search"], [role="searchbox"]',
        checkbox: 'input[type="checkbox"], [role="checkbox"]',
        radio: 'input[type="radio"], [role="radio"]',
        switch: '[role="switch"]',
        slider: 'input[type="range"], [role="slider"]',
        spinbutton: 'input[type="number"], [role="spinbutton"]',
        combobox: 'select, input[list], [role="combobox"]',
        listbox: 'select[multiple], [role="listbox"]',
        option: 'option, [role="option"]',
        heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
        img: 'img, [role="img"]',
        list: 'ul, ol, menu, [role="list"]',
        listitem: 'li, [role="listitem"]',
        table: 'table, [role="table"]',
        row: 'tr, [role="row"]',
        cell: 'td, [role="cell"], [role="gridcell"]',
        columnheader: 'th, [role="columnheader"]',
        rowheader: 'th[scope="row"], [role="rowheader"]',
        navigation: 'nav, [role="navigation"]',
        main: 'main, [role="main"]',
        banner: 'header, [role="banner"]',
        contentinfo: 'footer, [role="contentinfo"]',
        complementary: 'aside, [role="complementary"]',
        form: 'form, [role="form"]',
        search: 'search, [role="search"]',
        dialog: 'dialog, [role="dialog"], [role="alertdialog"]',
        region: 'section, [role="region"]',
        article: 'article, [role="article"]',
        group: 'fieldset, details, [role="group"]',
        progressbar: 'progress, [role="progressbar"]',
        separator: 'hr, [role="separator"]',
        status: 'output, [role="status"]',
        tab: '[role="tab"]',
        tabpanel: '[role="tabpanel"]',
        menuitem: '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
        treeitem: '[role="treeitem"]',
        alert: '[role="alert"]'
    },

    TIERS: {
        1: { name: 'getByRole', quality: 'Excellent', color: '#16a34a' },
        2: { name: 'getByLabel', quality: 'Excellent', color: '#16a34a' },
        3: { name: 'getByPlaceholder', quality: 'Good', color: '#0d9488' },
        4: { name: 'getByTestId', quality: 'Good', color: '#0d9488' },
        5: { name: 'getByText', quality: 'Fair', color: '#ca8a04' },
        6: { name: 'locator(css)', quality: 'Weak', color: '#ea580c' },
        7: { name: 'XPath', quality: 'Poor', color: '#dc2626' }
    },

    /* ------------------------------------------------------------------ *
     * Small helpers
     * ------------------------------------------------------------------ */

    esc(value) {
        if (window.CSS && CSS.escape) return CSS.escape(String(value));
        return String(value).replace(/([^\w-])/g, '\\$1');
    },

    quote(str) {
        return "'" + String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r?\n/g, '\\n') + "'";
    },

    normalize(str) {
        return String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
    },

    isOwnUi(el) {
        if (!el || !el.closest) return false;
        return !!el.closest('#mte-locator-recorder, #mte-api-monitor, .mte-toast, .mte-floating-control, .mte-lr-highlight, .mte-lr-tip, .mte-inspector-panel, .mte-inspector-tooltip, .mte-live-editor-toolbar');
    },

    // Ids that frameworks generate on every render — useless for a locator
    isDynamicId(id) {
        if (!id) return true;
        const v = String(id);
        if (v.length > 60) return true;
        return /^:r[0-9a-z]+:$/i.test(v)          // React useId
            || /^(ember|mui-|radix-|headlessui-|mat-|ng-|rc_select_|downshift-)/i.test(v)
            || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)   // uuid
            || /\d{6,}/.test(v)                        // long numeric run
            || /^[a-z]{0,3}[0-9a-f]{16,}$/i.test(v);
    },

    // Hashed / utility classes that are not stable between builds
    isDynamicClass(cls) {
        if (!cls) return true;
        const v = String(cls);
        if (v.startsWith('mte-')) return true;
        if (v.length > 40) return true;
        return /^(css|sc|jss|emotion|styles?|makeStyles)[-_]/i.test(v)
            || /^[\w]+__[a-z0-9]{5,}$/i.test(v)        // CSS-modules hash suffix
            || /--[0-9a-f]{5,}$/i.test(v)
            || /\d{5,}/.test(v)
            || /^[a-z]{1,3}[0-9a-f]{6,}$/i.test(v);
    },

    stableClasses(el) {
        return Array.from(el.classList || []).filter(c => !this.isDynamicClass(c));
    },

    query(selector) {
        try {
            return Array.from(document.querySelectorAll(selector)).filter(n => !this.isOwnUi(n));
        } catch (e) {
            return [];
        }
    },

    /* ------------------------------------------------------------------ *
     * Text extraction
     * ------------------------------------------------------------------ */

    // Playwright matches input[type=button|submit] by their value, not text
    elementText(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (['button', 'submit', 'reset'].includes(type)) return this.normalize(el.value);
            return '';
        }
        return this.normalize(el.innerText || el.textContent || '');
    },

    /* ------------------------------------------------------------------ *
     * ARIA role + accessible name
     * ------------------------------------------------------------------ */

    getRole(el) {
        if (!el || el.nodeType !== 1) return null;

        const explicit = this.normalize(el.getAttribute('role')).split(' ')[0];
        if (explicit) return explicit;

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        switch (tag) {
            case 'a':
            case 'area':
                return el.hasAttribute('href') ? 'link' : null;
            case 'button':
            case 'summary':
                return 'button';
            case 'input':
                if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
                if (type === 'checkbox') return 'checkbox';
                if (type === 'radio') return 'radio';
                if (type === 'range') return 'slider';
                if (type === 'number') return 'spinbutton';
                if (type === 'search') return el.hasAttribute('list') ? 'combobox' : 'searchbox';
                if (['text', 'email', 'tel', 'url', ''].includes(type)) {
                    return el.hasAttribute('list') ? 'combobox' : 'textbox';
                }
                return null; // password / file / hidden / date have no useful role
            case 'textarea': return 'textbox';
            case 'select': return (el.multiple || Number(el.size) > 1) ? 'listbox' : 'combobox';
            case 'option': return 'option';
            case 'img': return el.getAttribute('alt') === '' ? null : 'img';
            case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
            case 'ul': case 'ol': case 'menu': return 'list';
            case 'li': return 'listitem';
            case 'table': return 'table';
            case 'tr': return 'row';
            case 'td': return 'cell';
            case 'th': return el.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
            case 'nav': return 'navigation';
            case 'main': return 'main';
            case 'aside': return 'complementary';
            case 'header': return el.closest('article, aside, main, nav, section') ? null : 'banner';
            case 'footer': return el.closest('article, aside, main, nav, section') ? null : 'contentinfo';
            case 'form': return 'form';
            case 'search': return 'search';
            case 'dialog': return 'dialog';
            case 'article': return 'article';
            case 'fieldset': case 'details': return 'group';
            case 'progress': return 'progressbar';
            case 'output': return 'status';
            case 'hr': return 'separator';
            case 'section': return this.getAccessibleName(el, 'region') ? 'region' : null;
            default: return null;
        }
    },

    getLabelText(el) {
        const texts = [];
        try {
            if (el.labels && el.labels.length) {
                Array.from(el.labels).forEach(l => texts.push(l.innerText || l.textContent));
            }
        } catch (e) { /* element has no labels collection */ }

        if (!texts.length && el.closest) {
            const wrapper = el.closest('label');
            if (wrapper) texts.push(wrapper.innerText || wrapper.textContent);
        }
        return this.normalize(texts.join(' '));
    },

    getAccessibleName(el, role) {
        if (!el || el.nodeType !== 1) return '';

        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const parts = labelledBy.split(/\s+/)
                .map(id => {
                    const target = document.getElementById(id);
                    return target ? this.normalize(target.innerText || target.textContent) : '';
                })
                .filter(Boolean);
            if (parts.length) return this.normalize(parts.join(' '));
        }

        const ariaLabel = this.normalize(el.getAttribute('aria-label'));
        if (ariaLabel) return ariaLabel;

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        if (['input', 'textarea', 'select', 'meter', 'progress', 'output'].includes(tag)) {
            const labelText = this.getLabelText(el);
            if (labelText) return labelText;
        }

        if (tag === 'input') {
            if (['button', 'submit', 'reset'].includes(type)) {
                return this.normalize(el.value || (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : ''));
            }
            if (type === 'image') return this.normalize(el.getAttribute('alt') || el.title || 'Submit');
            return this.normalize(el.getAttribute('placeholder') || el.title);
        }
        if (tag === 'textarea') return this.normalize(el.getAttribute('placeholder') || el.title);
        if (tag === 'img' || tag === 'area') return this.normalize(el.getAttribute('alt') || el.title);
        if (tag === 'fieldset') {
            const legend = el.querySelector('legend');
            if (legend) return this.normalize(legend.innerText || legend.textContent);
        }
        if (tag === 'table') {
            const caption = el.querySelector('caption');
            if (caption) return this.normalize(caption.innerText || caption.textContent);
        }

        if (role && this.NAME_FROM_CONTENT.has(role)) {
            const text = this.elementText(el) || this.normalize(el.textContent);
            if (text) return text;
        }

        return this.normalize(el.title);
    },

    /* ------------------------------------------------------------------ *
     * Query engines that mirror the Playwright matching rules
     * ------------------------------------------------------------------ */

    matches(actual, expected, exact) {
        if (exact) return actual === expected;
        return actual.toLowerCase().includes(expected.toLowerCase());
    },

    queryByRole(role, name, exact) {
        const selector = this.ROLE_SELECTORS[role] || `[role="${role}"]`;
        const pool = this.query(selector).filter(n => this.getRole(n) === role);
        if (!name) return pool;
        return pool.filter(n => this.matches(this.getAccessibleName(n, role), name, exact));
    },

    queryByLabel(text, exact) {
        const pool = this.query('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [role="slider"], [role="spinbutton"], [role="switch"]');
        return pool.filter(n => {
            const label = this.getLabelText(n) || this.normalize(n.getAttribute('aria-label'));
            return label && this.matches(label, text, exact);
        });
    },

    queryByPlaceholder(text, exact) {
        return this.query('[placeholder]')
            .filter(n => this.matches(this.normalize(n.getAttribute('placeholder')), text, exact));
    },

    queryByAttr(attr, value) {
        return this.query(`[${attr}]`).filter(n => n.getAttribute(attr) === value);
    },

    attrSelector(attr, value, tag) {
        const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `${tag || ''}[${attr}="${escaped}"]`;
    },

    /**
     * Playwright's text engine resolves to the *smallest* element containing
     * the text, so a match is dropped when a descendant matches too.
     */
    queryByText(text, exact) {
        const root = document.body;
        if (!root) return [];
        const all = root.getElementsByTagName('*');
        if (all.length > 40000) return [];

        const hits = [];
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            if (this.isOwnUi(el)) continue;
            const value = this.elementText(el);
            if (!value) continue;
            if (this.matches(value, text, exact)) hits.push(el);
            if (hits.length > 300) return hits;
        }
        return hits.filter(el => !hits.some(other => other !== el && el.contains(other)));
    },

    /**
     * Runs a query loosely (Playwright default) and falls back to exact
     * matching when the loose form is ambiguous.
     */
    evaluate(el, queryFn) {
        let list = queryFn(false);
        let exact = false;

        if (list.length !== 1) {
            const strict = queryFn(true);
            if (strict.length && strict.length < list.length && strict.indexOf(el) !== -1) {
                list = strict;
                exact = true;
            } else if (strict.length === 1 && strict[0] === el) {
                list = strict;
                exact = true;
            }
        }

        return { count: list.length, index: list.indexOf(el), exact };
    },

    /* ------------------------------------------------------------------ *
     * CSS / XPath builders
     * ------------------------------------------------------------------ */

    buildCssSelector(el) {
        if (el.id && !this.isDynamicId(el.id)) {
            const byId = `#${this.esc(el.id)}`;
            if (this.query(byId).length === 1) return byId;
        }

        for (const attr of this.TEST_ATTRS) {
            const value = el.getAttribute(attr);
            if (value && this.queryByAttr(attr, value).length === 1) {
                return this.attrSelector(attr, value);
            }
        }

        const parts = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === 1 && depth < 12) {
            depth++;

            if (current.id && !this.isDynamicId(current.id)) {
                parts.unshift(`#${this.esc(current.id)}`);
                if (this.query(parts.join(' > ')).length === 1) return parts.join(' > ');
                break;
            }

            let part = current.tagName.toLowerCase();
            const classes = this.stableClasses(current).slice(0, 2);
            if (classes.length) part += '.' + classes.map(c => this.esc(c)).join('.');

            const parent = current.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (sameTag.length > 1) {
                    let siblingMatches = [];
                    try {
                        siblingMatches = Array.from(parent.children).filter(c => c.matches(part));
                    } catch (e) { siblingMatches = sameTag; }
                    if (siblingMatches.length > 1) {
                        part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
                    }
                }
            }

            parts.unshift(part);
            if (this.query(parts.join(' > ')).length === 1) return parts.join(' > ');
            current = parent;
        }

        return parts.join(' > ');
    },

    buildXPath(el) {
        const parts = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === 1 && depth < 25) {
            depth++;
            const tag = current.tagName.toLowerCase();

            if (current.id && !this.isDynamicId(current.id)) {
                parts.unshift(`*[@id="${current.id}"]`);
                return '//' + parts.join('/');
            }

            const parent = current.parentElement;
            if (!parent) {
                parts.unshift(tag);
                break;
            }

            const sameTag = Array.from(parent.children).filter(c => c.tagName === current.tagName);
            parts.unshift(sameTag.length > 1 ? `${tag}[${sameTag.indexOf(current) + 1}]` : tag);
            current = parent;
        }

        return '/' + parts.join('/');
    },

    queryXPath(xpath) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const nodes = [];
            for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
            return nodes;
        } catch (e) {
            return null;
        }
    },

    /* ------------------------------------------------------------------ *
     * Tab 1 — Raw attribute (one winner, priority order, unique first)
     * ------------------------------------------------------------------ */

    pickRaw(el) {
        const attempts = [];

        // Priority: test attributes -> id -> name -> aria-label -> ... -> class
        this.TEST_ATTRS.forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) attempts.push({ key: attr, value, matches: this.queryByAttr(attr, value) });
        });

        if (el.id) {
            attempts.push({
                key: 'id',
                value: el.id,
                matches: this.query(`#${this.esc(el.id)}`),
                warn: this.isDynamicId(el.id) ? 'auto-generated?' : ''
            });
        }

        this.ATTR_ROWS.forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) attempts.push({ key: attr, value, matches: this.queryByAttr(attr, value) });
        });

        const classes = this.stableClasses(el);
        if (classes.length) {
            attempts.push({
                key: 'class',
                value: classes.join(' '),
                matches: this.query('.' + classes.map(c => this.esc(c)).join('.'))
            });
        }

        // Highest priority that is unique — a stable one wins over a generated one
        const chosen = attempts.find(a => a.matches.length === 1 && !a.warn)
            || attempts.find(a => a.matches.length === 1)
            || attempts[0];

        if (!chosen) {
            const css = this.buildCssSelector(el);
            return { key: 'css', value: css, line: css, count: this.query(css).length, warn: '' };
        }

        return {
            key: chosen.key,
            value: chosen.value,
            line: `${chosen.key}="${chosen.value}"`,
            count: chosen.matches.length,
            warn: chosen.warn || ''
        };
    },

    /* ------------------------------------------------------------------ *
     * Tab 2 — Playwright candidates (tier ordered)
     * ------------------------------------------------------------------ */

    buildPlaywrightCandidates(el) {
        const candidates = [];
        const add = (tier, code, result, note) => {
            candidates.push({
                tier,
                api: this.TIERS[tier].name,
                quality: this.TIERS[tier].quality,
                color: this.TIERS[tier].color,
                code,
                count: result.count,
                index: result.index,
                note: note || ''
            });
        };

        // --- Tier 1: getByRole ------------------------------------------------
        const role = this.getRole(el);
        if (role) {
            const name = this.getAccessibleName(el, role);
            if (name && name.length <= 120) {
                const result = this.evaluate(el, exact => this.queryByRole(role, name, exact));
                const options = `{ name: ${this.quote(name)}${result.exact ? ', exact: true' : ''} }`;
                add(1, `getByRole(${this.quote(role)}, ${options})`, result);
            } else {
                const pool = this.queryByRole(role, '', false);
                add(1, `getByRole(${this.quote(role)})`, { count: pool.length, index: pool.indexOf(el) },
                    name ? 'accessible name too long to use' : 'no accessible name');
            }
        }

        // --- Tier 2: getByLabel ----------------------------------------------
        const label = this.getLabelText(el) || this.normalize(el.getAttribute('aria-label'));
        const labelable = /^(input|textarea|select)$/i.test(el.tagName) ||
            ['textbox', 'combobox', 'checkbox', 'radio', 'slider', 'spinbutton', 'switch', 'listbox'].includes(role);
        if (label && labelable) {
            const result = this.evaluate(el, exact => this.queryByLabel(label, exact));
            add(2, `getByLabel(${this.quote(label)}${result.exact ? ', { exact: true }' : ''})`, result);
        }

        // --- Tier 3: getByPlaceholder ----------------------------------------
        const placeholder = this.normalize(el.getAttribute('placeholder'));
        if (placeholder) {
            const result = this.evaluate(el, exact => this.queryByPlaceholder(placeholder, exact));
            add(3, `getByPlaceholder(${this.quote(placeholder)}${result.exact ? ', { exact: true }' : ''})`, result);
        }

        // --- Tier 4: getByTestId ---------------------------------------------
        for (const attr of this.TEST_ATTRS) {
            const value = el.getAttribute(attr);
            if (!value) continue;
            const matches = this.queryByAttr(attr, value);
            const note = attr === 'data-testid'
                ? ''
                : `needs testIdAttribute: '${attr}' in playwright.config`;
            add(4, `getByTestId(${this.quote(value)})`, { count: matches.length, index: matches.indexOf(el) }, note);
            break;
        }

        // --- Tier 5: getByText ------------------------------------------------
        let text = this.elementText(el);
        if (text) {
            let truncated = false;
            if (text.length > 80) {
                text = text.slice(0, 80).trim();
                truncated = true;
            }
            const result = this.evaluate(el, exact => this.queryByText(text, exact));
            add(5, `getByText(${this.quote(text)}${result.exact ? ', { exact: true }' : ''})`, result,
                truncated ? 'text truncated — matched as substring' : '');
        }

        // --- Tier 6: locator(css) --------------------------------------------
        const css = this.buildCssSelector(el);
        if (css) {
            const matches = this.query(css);
            add(6, `locator(${this.quote(css)})`, { count: matches.length, index: matches.indexOf(el) });
        }

        // --- Tier 7: XPath ----------------------------------------------------
        const xpath = this.buildXPath(el);
        if (xpath) {
            const nodes = this.queryXPath(xpath);
            add(7, `locator(${this.quote('xpath=' + xpath)})`,
                nodes ? { count: nodes.length, index: nodes.indexOf(el) } : { count: -1, index: -1 });
        }

        return candidates;
    },

    /**
     * Selector Priority — take the highest tier that actually resolves to a
     * single element. Nothing unique? Take the highest tier we can disambiguate
     * with .nth().
     */
    pickBest(candidates) {
        // Only trust a "unique" tier when the match is really our element
        const unique = candidates.find(c => c.count === 1 && c.index === 0);
        if (unique) return { ...unique, suffix: '' };

        const usable = candidates.find(c => c.count > 1 && c.index >= 0);
        if (usable) return { ...usable, suffix: `.nth(${usable.index})` };

        const fallback = candidates[candidates.length - 1];
        return fallback ? { ...fallback, suffix: '' } : null;
    },

    suggestAction(el) {
        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        if (tag === 'select') return { call: `.selectOption(${this.quote(el.value || 'value')})`, name: 'selectOption' };
        if (tag === 'textarea') return { call: `.fill(${this.quote(el.value || '')})`, name: 'fill' };
        if (tag === 'input') {
            if (['checkbox', 'radio'].includes(type)) return { call: '.check()', name: 'check' };
            if (['button', 'submit', 'reset', 'image'].includes(type)) return { call: '.click()', name: 'click' };
            if (type === 'file') return { call: `.setInputFiles('path/to/file')`, name: 'setInputFiles' };
            return { call: `.fill(${this.quote(el.value || '')})`, name: 'fill' };
        }
        if (el.isContentEditable) return { call: `.fill('')`, name: 'fill' };
        return { call: '.click()', name: 'click' };
    },

    /* ------------------------------------------------------------------ *
     * Capture
     * ------------------------------------------------------------------ */

    capture(el) {
        const raw = this.pickRaw(el);
        const best = this.pickBest(this.buildPlaywrightCandidates(el));
        const action = this.suggestAction(el);
        const text = this.elementText(el) || this.normalize(el.textContent);

        return {
            id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ts: Date.now(),
            tag: el.tagName.toLowerCase(),
            text: text.length > 60 ? text.slice(0, 60) + '…' : text,
            url: location.href,
            inIframe: window.top !== window.self,
            raw,
            pw: best ? {
                line: `${best.code}${best.suffix}${action.call}`,
                action: action.name,
                tier: best.tier,
                api: best.api,
                quality: best.quality,
                color: best.color,
                count: best.count,
                note: best.note || (best.suffix ? 'ไม่มี tier ไหน unique — ใส่ .nth() ให้แล้ว' : '')
            } : { line: '', action: '', tier: 0, api: '', quality: '', color: '#94a3b8', count: 0, note: '' }
        };
    }
};

class LocatorRecorderTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.picking = true;
        this.overlay = null;
        this.records = [];
        this.activeTab = 'raw';
        this.highlight = null;
        this.tip = null;
        this.isTop = window.top === window.self;

        this.onMouseOver = this.onMouseOver.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onClick = this.onClick.bind(this);
        this.swallow = this.swallow.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onScroll = this.onScroll.bind(this);
    }

    /* ---------------------------------------------------------------- *
     * Lifecycle
     * ---------------------------------------------------------------- */

    toggle(force = null) {
        const next = force !== null ? force : !this.active;
        if (next === this.active) {
            if (next && this.isTop && this.overlay) this.overlay.classList.remove('mte-minimized');
            return;
        }
        this.active = next;

        if (this.active) this.start();
        else this.stop();

        if (this.isTop) this.manager.updateToolState('locatorRecorder', this.active);
    }

    start() {
        const boot = () => {
            if (!this.active) return;
            document.addEventListener('mouseover', this.onMouseOver, true);
            document.addEventListener('mousemove', this.onMouseMove, true);
            document.addEventListener('click', this.onClick, true);
            document.addEventListener('mousedown', this.swallow, true);
            document.addEventListener('mouseup', this.swallow, true);
            document.addEventListener('keydown', this.onKeyDown, true);
            window.addEventListener('scroll', this.onScroll, true);

            if (this.isTop) {
                this.showOverlay();
                this.manager.showToast('Locator Recorder — click an element to record');
            }
        };

        if (document.body) boot();
        else document.addEventListener('DOMContentLoaded', boot, { once: true });
    }

    stop() {
        document.removeEventListener('mouseover', this.onMouseOver, true);
        document.removeEventListener('mousemove', this.onMouseMove, true);
        document.removeEventListener('click', this.onClick, true);
        document.removeEventListener('mousedown', this.swallow, true);
        document.removeEventListener('mouseup', this.swallow, true);
        document.removeEventListener('keydown', this.onKeyDown, true);
        window.removeEventListener('scroll', this.onScroll, true);

        this.removeHighlight();
        if (this.isTop) {
            this.removeOverlay();
            this.manager.showToast('Locator Recorder stopped');
        }
    }

    setPicking(on) {
        this.picking = on;
        if (!on) this.removeHighlight();

        if (this.overlay) {
            const btn = this.overlay.querySelector('#mte-lr-pick');
            if (btn) {
                btn.textContent = on ? '⏸ Pause' : '▶ Pick';
                btn.classList.toggle('mte-lr-paused', !on);
            }
            this.overlay.classList.toggle('mte-lr-idle', !on);
        }
    }

    /* ---------------------------------------------------------------- *
     * Page interaction
     * ---------------------------------------------------------------- */

    onMouseOver(e) {
        if (!this.active || !this.picking) return;
        if (LocatorEngine.isOwnUi(e.target)) {
            this.removeHighlight();
            return;
        }
        this.drawHighlight(e.target);
    }

    onMouseMove(e) {
        if (!this.active || !this.picking || !this.tip) return;
        if (LocatorEngine.isOwnUi(e.target)) return;
        this.positionTip(e.clientX, e.clientY);
    }

    onScroll() {
        if (this.hovered && this.picking) this.drawHighlight(this.hovered);
    }

    // Keep the page from reacting while in pick mode (Alt = click through)
    swallow(e) {
        if (!this.active || !this.picking) return;
        if (e.altKey) return;
        if (LocatorEngine.isOwnUi(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }

    onClick(e) {
        if (!this.active || !this.picking) return;
        if (LocatorEngine.isOwnUi(e.target)) return;

        // Alt+Click = interact with the page normally, record nothing
        if (e.altKey) return;

        e.preventDefault();
        e.stopPropagation();

        const target = e.target;
        this.removeHighlight();

        let record;
        try {
            record = LocatorEngine.capture(target);
        } catch (err) {
            console.error('[Locator Recorder] capture failed', err);
            this.manager.showToast('Capture failed');
            return;
        }

        if (this.isTop) {
            this.addRecord(record);
        } else {
            record.inIframe = true;
            chrome.runtime.sendMessage({ action: 'forwardLocatorRecord', data: record });
        }

        this.flash(target);
    }

    onKeyDown(e) {
        if (!this.active) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.toggle(false);
        }
    }

    flash(el) {
        try {
            const rect = el.getBoundingClientRect();
            const box = Utils.createEl('div', 'mte-lr-flash');
            box.style.cssText = `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;
            document.body.appendChild(box);
            setTimeout(() => box.remove(), 400);
        } catch (e) { /* element detached */ }
    }

    /* ---------------------------------------------------------------- *
     * Hover highlight
     * ---------------------------------------------------------------- */

    drawHighlight(el) {
        this.hovered = el;
        const rect = el.getBoundingClientRect();

        if (!this.highlight) {
            this.highlight = Utils.createEl('div', 'mte-lr-highlight');
            document.body.appendChild(this.highlight);
        }
        this.highlight.style.cssText =
            `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;`;

        if (!this.tip) {
            this.tip = Utils.createEl('div', 'mte-lr-tip');
            document.body.appendChild(this.tip);
        }
        this.tip.innerHTML = this.previewHtml(el, rect);
    }

    // Cheap preview — no full-DOM uniqueness scan on hover
    previewHtml(el, rect) {
        const tag = el.tagName.toLowerCase();
        const testAttr = LocatorEngine.TEST_ATTRS.find(a => el.getAttribute(a));
        let hint = '';

        if (testAttr) {
            hint = `${testAttr}="${Utils.escapeHtml(el.getAttribute(testAttr))}"`;
        } else {
            const role = LocatorEngine.getRole(el);
            if (role) {
                const name = LocatorEngine.getAccessibleName(el, role);
                hint = name ? `role=${role} · "${Utils.escapeHtml(name.slice(0, 40))}"` : `role=${role}`;
            } else if (el.id) {
                hint = `#${Utils.escapeHtml(el.id)}`;
            } else {
                const classes = LocatorEngine.stableClasses(el).slice(0, 2);
                hint = classes.length ? '.' + classes.map(c => Utils.escapeHtml(c)).join('.') : '—';
            }
        }

        return `<strong>&lt;${tag}&gt;</strong><span>${hint}</span>` +
            `<em>${Math.round(rect.width)} × ${Math.round(rect.height)}</em>`;
    }

    positionTip(x, y) {
        const offset = 16;
        const width = this.tip.offsetWidth || 220;
        const height = this.tip.offsetHeight || 40;
        const left = Math.min(x + offset, window.innerWidth - width - 8);
        const top = (y + offset + height > window.innerHeight) ? y - height - offset : y + offset;
        this.tip.style.left = `${Math.max(8, left)}px`;
        this.tip.style.top = `${Math.max(8, top)}px`;
    }

    removeHighlight() {
        if (this.highlight) { this.highlight.remove(); this.highlight = null; }
        if (this.tip) { this.tip.remove(); this.tip = null; }
        this.hovered = null;
    }

    /* ---------------------------------------------------------------- *
     * Records
     * ---------------------------------------------------------------- */

    addRecord(record) {
        this.records.push(record);
        this.persist();
        this.renderList();
        this.updateCount();
    }

    removeRecord(id) {
        this.records = this.records.filter(r => r.id !== id);
        this.persist();
        this.renderList();
        this.updateCount();
    }

    clearRecords() {
        this.records = [];
        this.persist();
        this.renderList();
        this.updateCount();
    }

    persist() {
        try {
            chrome.storage.local.set({ mteLocatorRecords: this.records });
        } catch (e) { /* extension context invalidated */ }
    }

    restore(done) {
        chrome.storage.local.get(['mteLocatorRecords'], (res) => {
            const stored = Array.isArray(res.mteLocatorRecords) ? res.mteLocatorRecords : [];
            // Drop anything saved by an older shape of the recorder
            this.records = stored.filter(r => r && r.raw && r.raw.line && r.pw);
            if (done) done();
        });
    }

    updateCount() {
        if (!this.overlay) return;
        const n = this.records.length;
        const count = this.overlay.querySelector('#mte-lr-count');
        if (count) count.textContent = n;
        const badge = this.overlay.querySelector('#mte-lr-min-count');
        if (badge) {
            badge.textContent = n;
            badge.style.display = n > 0 ? 'block' : 'none';
        }
    }

    /* ---------------------------------------------------------------- *
     * Panel
     * ---------------------------------------------------------------- */

    showOverlay() {
        const existing = document.getElementById('mte-locator-recorder');
        if (existing) {
            this.overlay = existing;
            this.overlay.style.display = 'flex';
            this.overlay.classList.remove('mte-minimized');
            return;
        }

        const overlay = Utils.createEl('div');
        overlay.id = 'mte-locator-recorder';

        // ---- header ----
        const header = Utils.createEl('div');
        header.id = 'mte-lr-header';

        const left = Utils.createEl('div', 'mte-lr-group');
        const dot = Utils.createEl('span', 'mte-lr-dot');
        const title = Utils.createEl('span', 'mte-lr-title', 'Locator Recorder');
        const count = Utils.createEl('span', 'mte-lr-count', '0');
        count.id = 'mte-lr-count';
        left.appendChild(dot);
        left.appendChild(title);
        left.appendChild(count);

        const right = Utils.createEl('div', 'mte-lr-group');

        const pickBtn = Utils.createEl('button', 'mte-lr-btn mte-lr-btn-pick', '⏸ Pause');
        pickBtn.id = 'mte-lr-pick';
        pickBtn.title = 'Pause / resume picking (Alt+Click always clicks through)';
        pickBtn.onclick = (e) => { e.stopPropagation(); this.setPicking(!this.picking); };

        const copyBtn = Utils.createEl('button', 'mte-lr-btn', 'Copy All');
        copyBtn.title = 'Copy everything in the active tab';
        copyBtn.onclick = (e) => { e.stopPropagation(); this.copyAll(); };

        const clearBtn = Utils.createEl('button', 'mte-lr-btn mte-lr-btn-danger', 'Clear');
        clearBtn.onclick = (e) => { e.stopPropagation(); this.clearRecords(); };

        const minBtn = Utils.createEl('button', 'mte-lr-btn mte-lr-btn-icon', '−');
        minBtn.onclick = (e) => { e.stopPropagation(); overlay.classList.toggle('mte-minimized'); };

        const closeBtn = Utils.createEl('button', 'mte-lr-btn mte-lr-btn-icon', '✕');
        closeBtn.onclick = (e) => { e.stopPropagation(); this.toggle(false); };

        [pickBtn, copyBtn, clearBtn, minBtn, closeBtn].forEach(b => right.appendChild(b));

        header.appendChild(left);
        header.appendChild(right);

        // ---- tabs ----
        const tabs = Utils.createEl('div');
        tabs.id = 'mte-lr-tabs';

        const rawTab = Utils.createEl('button', 'mte-lr-tab', 'Raw Attributes');
        rawTab.dataset.tab = 'raw';
        const pwTab = Utils.createEl('button', 'mte-lr-tab', 'Playwright');
        pwTab.dataset.tab = 'pw';

        [rawTab, pwTab].forEach(tab => {
            tab.onclick = (e) => {
                e.stopPropagation();
                this.activeTab = tab.dataset.tab;
                tabs.querySelectorAll('.mte-lr-tab').forEach(t => t.classList.toggle('active', t === tab));
                this.renderList();
            };
            tabs.appendChild(tab);
        });
        rawTab.classList.add('active');

        // ---- hint ----
        const hint = Utils.createEl('div', 'mte-lr-hint');
        hint.innerHTML = 'คลิก element เพื่อเก็บ locator · <b>Alt+Click</b> = คลิกทะลุไปที่หน้าเว็บ · <b>Esc</b> = หยุด';

        // ---- content ----
        const content = Utils.createEl('div');
        content.id = 'mte-lr-content';

        const minText = Utils.createEl('div', 'mte-minimized-text', 'loc');
        const minBadge = Utils.createEl('div', 'mte-minimized-badge', '0');
        minBadge.id = 'mte-lr-min-count';

        overlay.appendChild(header);
        overlay.appendChild(tabs);
        overlay.appendChild(hint);
        overlay.appendChild(content);
        overlay.appendChild(minText);
        overlay.appendChild(minBadge);

        document.body.appendChild(overlay);
        this.overlay = overlay;

        this.initDrag(header, overlay);
        this.restore(() => {
            this.renderList();
            this.updateCount();
        });
    }

    removeOverlay() {
        if (this.dragCleanup) {
            this.dragCleanup();
            this.dragCleanup = null;
        }
        if (this.overlay) this.overlay.remove();
        this.overlay = null;
    }

    initDrag(handle, target) {
        let dragging = false, startX = 0, startY = 0, offsetX = 0, offsetY = 0, moved = false;

        const dragStart = (e) => {
            if (['BUTTON', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
            const isMinimized = target.classList.contains('mte-minimized');
            if (!(e.target === handle || handle.contains(e.target) || isMinimized)) return;
            startX = e.clientX - offsetX;
            startY = e.clientY - offsetY;
            dragging = true;
            moved = false;
        };

        const drag = (e) => {
            if (!dragging) return;
            e.preventDefault();
            moved = true;
            offsetX = e.clientX - startX;
            offsetY = e.clientY - startY;
            target.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        };

        const dragEnd = () => {
            dragging = false;
            setTimeout(() => { moved = false; }, 50);
        };

        handle.addEventListener('mousedown', dragStart);
        target.addEventListener('mousedown', (e) => {
            if (target.classList.contains('mte-minimized')) dragStart(e);
        });
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        target.addEventListener('click', () => {
            if (target.classList.contains('mte-minimized') && !moved) {
                target.classList.remove('mte-minimized');
            }
        });

        this.dragCleanup = () => {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);
        };
    }

    /* ---------------------------------------------------------------- *
     * Rendering
     * ---------------------------------------------------------------- */

    renderList() {
        if (!this.overlay) return;
        const content = this.overlay.querySelector('#mte-lr-content');
        if (!content) return;

        content.innerHTML = '';

        if (!this.records.length) {
            const empty = Utils.createEl('div', 'mte-lr-empty');
            empty.innerHTML = '🎯<br>ยังไม่มี locator ที่บันทึก<br><small>คลิกที่ element บนหน้าเว็บเพื่อเริ่มเก็บ</small>';
            content.appendChild(empty);
            return;
        }

        this.records.forEach((record, i) => content.appendChild(this.renderRow(record, i)));
    }

    /**
     * One record = one line. The tier logic already picked the winner, so the
     * panel shows that single answer — no alternatives to choose from.
     */
    renderRow(record, index) {
        const isRaw = this.activeTab === 'raw';
        const data = (isRaw ? record.raw : record.pw) || {};

        const item = Utils.createEl('div', 'mte-lr-item');
        const row = Utils.createEl('div', 'mte-lr-line-row');

        const idx = Utils.createEl('span', 'mte-lr-index', String(index + 1));

        const line = Utils.createEl('code', 'mte-lr-line', data.line || '—');
        line.title = `<${record.tag}>${record.text ? ' · ' + record.text : ''}`;

        row.appendChild(idx);
        row.appendChild(line);

        if (!isRaw && data.tier) {
            const tier = Utils.createEl('span', 'mte-lr-tier', `T${data.tier}`);
            tier.style.background = data.color;
            tier.title = `${data.api} — ${data.quality}`;
            row.appendChild(tier);
        }

        if (data.count !== 1) {
            row.insertAdjacentHTML('beforeend', this.countChip(data.count));
        }
        if (data.warn) {
            row.insertAdjacentHTML('beforeend',
                `<span class="mte-lr-chip mte-lr-chip-warn">${Utils.escapeHtml(data.warn)}</span>`);
        }
        if (record.inIframe) {
            row.insertAdjacentHTML('beforeend', '<span class="mte-lr-chip mte-lr-chip-info">iframe</span>');
        }

        const del = Utils.createEl('button', 'mte-lr-del', '🗑');
        del.title = 'Remove';
        del.onclick = (e) => { e.stopPropagation(); this.removeRecord(record.id); };
        row.appendChild(del);

        item.appendChild(row);

        if (!isRaw && data.note) {
            item.appendChild(Utils.createEl('div', 'mte-lr-note', `⚠ ${data.note}`));
        }

        return item;
    }

    countChip(count) {
        if (count === 1) return '<span class="mte-lr-chip mte-lr-chip-ok">unique</span>';
        if (count === 0) return '<span class="mte-lr-chip mte-lr-chip-bad">no match</span>';
        if (count < 0) return '<span class="mte-lr-chip">n/a</span>';
        return `<span class="mte-lr-chip mte-lr-chip-warn">${count} matches</span>`;
    }

    /* ---------------------------------------------------------------- *
     * Export — copies every line of the active tab
     * ---------------------------------------------------------------- */

    copyAll() {
        if (!this.records.length) {
            this.manager.showToast('ยังไม่มี locator ให้ copy');
            return;
        }

        const isRaw = this.activeTab === 'raw';
        const text = this.records
            .map(r => (isRaw ? (r.raw && r.raw.line) : (r.pw && r.pw.line)) || '')
            .filter(Boolean)
            .join('\n');

        navigator.clipboard.writeText(text);
        this.manager.showToast(`Copied ${this.records.length} ${isRaw ? 'attributes' : 'locators'}`);
    }
}
