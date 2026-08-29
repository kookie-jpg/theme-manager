// Theme Manager — grid view to browse, apply, preview, import and delete
// SillyTavern UI theme presets (data/<user>/themes/*.json).
//
// Pure client-side extension: it only talks to SillyTavern's existing
// /api/settings/get, /api/themes/save and /api/themes/delete endpoints.
// No server plugin required.

const PREVIEW_FIELD = '_tm_preview_image';
const PREVIEW_MAX_DIM = 480;
const PREVIEW_QUALITY = 0.75;

function ctx() {
    return SillyTavern.getContext();
}

// ---------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------

async function fetchThemes() {
    const response = await fetch('/api/settings/get', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (!response.ok) {
        throw new Error(`Failed to load settings (${response.status})`);
    }

    const data = await response.json();
    return Array.isArray(data.themes) ? data.themes : [];
}

async function saveThemeToServer(themeObject) {
    const response = await fetch('/api/themes/save', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify(themeObject),
    });

    if (!response.ok) {
        throw new Error(`Failed to save theme (${response.status})`);
    }
}

async function deleteThemeFromServer(name) {
    const response = await fetch('/api/themes/delete', {
        method: 'POST',
        headers: ctx().getRequestHeaders(),
        body: JSON.stringify({ name }),
    });

    if (!response.ok) {
        throw new Error(`Failed to delete theme (${response.status})`);
    }
}

// ---------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** Downscales an image file to a JPEG data URL so preview thumbnails stay small. */
async function resizeImageToDataURL(file, maxDim = PREVIEW_MAX_DIM, quality = PREVIEW_QUALITY) {
    const dataUrl = await readFileAsDataURL(file);
    const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = dataUrl;
    });

    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context2d = canvas.getContext('2d');
    context2d.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
}

function downloadJSON(object, filename) {
    const blob = new Blob([JSON.stringify(object, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Builds a rough CSS gradient swatch out of a theme's own color fields, used when no preview image was set. */
function fallbackGradient(theme) {
    const a = theme.chat_tint_color || theme.blur_tint_color || '#26272a';
    const b = theme.main_text_color || '#8c8c8c';
    return `linear-gradient(135deg, ${a} 0%, ${b}22 100%)`;
}

/** Applies a theme that is already present in the current session's #themes dropdown. */
function applyLoadedTheme(name) {
    const select = document.getElementById('themes');
    if (!(select instanceof HTMLSelectElement)) {
        return false;
    }
    const option = Array.from(select.options).find(o => o.value === name);
    if (!option) {
        return false;
    }
    select.value = name;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

/** Keeps the native #themes dropdown in sync after we add/remove a theme file behind its back. */
function syncThemeOption(name, action) {
    const select = document.getElementById('themes');
    if (!(select instanceof HTMLSelectElement)) {
        return;
    }
    const existing = Array.from(select.options).find(o => o.value === name);

    if (action === 'add' && !existing) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }

    if (action === 'remove' && existing) {
        const wasSelected = existing.selected;
        existing.remove();
        if (wasSelected && select.options.length > 0) {
            select.value = select.options[0].value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

// ---------------------------------------------------------------------
// Popup / grid rendering
// ---------------------------------------------------------------------

let cachedThemes = [];
let gridEl = null;
let countEl = null;
let filterValue = '';

function currentThemeName() {
    return ctx().powerUserSettings?.theme;
}

function buildCard(theme) {
    const card = document.createElement('div');
    card.className = 'tm-card';
    if (theme.name === currentThemeName()) {
        card.classList.add('tm-active');
    }

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'tm-thumb';
    if (theme[PREVIEW_FIELD]) {
        thumb.style.backgroundImage = `url("${theme[PREVIEW_FIELD]}")`;
    } else {
        thumb.style.background = fallbackGradient(theme);
        const fallback = document.createElement('div');
        fallback.className = 'tm-thumb-fallback';
        fallback.innerHTML = '<i class="fa-solid fa-palette"></i>';
        thumb.appendChild(fallback);
    }

    if (theme.name === currentThemeName()) {
        const badge = document.createElement('div');
        badge.className = 'tm-active-badge';
        badge.textContent = 'Active';
        thumb.appendChild(badge);
    }

    const overlay = document.createElement('div');
    overlay.className = 'tm-thumb-overlay';

    const setPreviewIcon = document.createElement('i');
    setPreviewIcon.className = 'fa-solid fa-image';
    setPreviewIcon.title = 'Set preview image';
    setPreviewIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        promptSetPreview(theme);
    });
    overlay.appendChild(setPreviewIcon);

    if (theme[PREVIEW_FIELD]) {
        const clearPreviewIcon = document.createElement('i');
        clearPreviewIcon.className = 'fa-solid fa-circle-xmark';
        clearPreviewIcon.title = 'Remove preview image';
        clearPreviewIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPreview(theme);
        });
        overlay.appendChild(clearPreviewIcon);
    }

    thumb.appendChild(overlay);
    thumb.addEventListener('click', () => applyTheme(theme));

    // Body
    const body = document.createElement('div');
    body.className = 'tm-body';

    const name = document.createElement('div');
    name.className = 'tm-name';
    name.textContent = theme.name;
    name.title = theme.name;
    body.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'tm-actions';

    const applyBtn = document.createElement('div');
    applyBtn.className = 'menu_button';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', () => applyTheme(theme));

    const exportBtn = document.createElement('div');
    exportBtn.className = 'menu_button';
    exportBtn.textContent = 'Export';
    exportBtn.addEventListener('click', () => {
        const clean = { ...theme };
        delete clean[PREVIEW_FIELD];
        downloadJSON(clean, `${theme.name}.json`);
    });

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'menu_button tm-danger';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.title = 'Delete theme';
    deleteBtn.addEventListener('click', () => promptDelete(theme));

    actions.appendChild(applyBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(deleteBtn);
    body.appendChild(actions);

    card.appendChild(thumb);
    card.appendChild(body);
    return card;
}

function renderGrid() {
    if (!gridEl) {
        return;
    }
    gridEl.innerHTML = '';

    const filtered = cachedThemes
        .filter(t => t.name && t.name.toLowerCase().includes(filterValue.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (countEl) {
        countEl.textContent = `${filtered.length} / ${cachedThemes.length} theme${cachedThemes.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tm-empty';
        empty.textContent = cachedThemes.length === 0
            ? 'No custom themes found yet. Import one to get started.'
            : 'No themes match your search.';
        gridEl.appendChild(empty);
        return;
    }

    for (const theme of filtered) {
        gridEl.appendChild(buildCard(theme));
    }
}

async function refreshThemes() {
    cachedThemes = await fetchThemes();
    renderGrid();
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

function applyTheme(theme) {
    const applied = applyLoadedTheme(theme.name);
    if (applied) {
        toastr.success(`Applied theme "${theme.name}"`);
        renderGrid();
    } else {
        toastr.info('This theme was added in this session. Reload the page once, then Apply will work.');
    }
}

async function promptSetPreview(theme) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.className = 'tm-hidden-input';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
            return;
        }
        try {
            const dataUrl = await resizeImageToDataURL(file);
            const updated = { ...theme, [PREVIEW_FIELD]: dataUrl };
            await saveThemeToServer(updated);
            const idx = cachedThemes.findIndex(t => t.name === theme.name);
            if (idx !== -1) {
                cachedThemes[idx] = updated;
            }
            renderGrid();
            toastr.success('Preview image updated.');
        } catch (err) {
            console.error(err);
            toastr.error('Could not set the preview image. See console for details.');
        }
    }, { once: true });

    input.click();
}

async function clearPreview(theme) {
    try {
        const updated = { ...theme };
        delete updated[PREVIEW_FIELD];
        await saveThemeToServer(updated);
        const idx = cachedThemes.findIndex(t => t.name === theme.name);
        if (idx !== -1) {
            cachedThemes[idx] = updated;
        }
        renderGrid();
    } catch (err) {
        console.error(err);
        toastr.error('Could not remove the preview image. See console for details.');
    }
}

async function promptDelete(theme) {
    const confirmed = await ctx().callGenericPopup(
        `Delete theme "${theme.name}"? This cannot be undone.`,
        ctx().POPUP_TYPE.CONFIRM,
    );

    if (!confirmed) {
        return;
    }

    try {
        await deleteThemeFromServer(theme.name);
        syncThemeOption(theme.name, 'remove');
        cachedThemes = cachedThemes.filter(t => t.name !== theme.name);
        renderGrid();
        toastr.success(`Deleted theme "${theme.name}"`);
    } catch (err) {
        console.error(err);
        toastr.error('Could not delete the theme. See console for details.');
    }
}

async function promptImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.className = 'tm-hidden-input';
    document.body.appendChild(input);

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(await readFileAsText(file));
        } catch (err) {
            toastr.error('That file is not valid JSON.');
            return;
        }

        if (!parsed || typeof parsed !== 'object' || !parsed.name) {
            toastr.error('This does not look like a SillyTavern theme file (missing "name").');
            return;
        }

        const collides = cachedThemes.some(t => t.name === parsed.name);
        if (collides) {
            const overwrite = await ctx().callGenericPopup(
                `A theme named "${parsed.name}" already exists. Overwrite it?`,
                ctx().POPUP_TYPE.CONFIRM,
            );
            if (!overwrite) {
                return;
            }
        }

        try {
            await saveThemeToServer(parsed);
            toastr.success(`Imported "${parsed.name}". Reloading to activate it…`);
            setTimeout(() => location.reload(), 900);
        } catch (err) {
            console.error(err);
            toastr.error('Could not import the theme. See console for details.');
        }
    }, { once: true });

    input.click();
}

// ---------------------------------------------------------------------
// Popup shell
// ---------------------------------------------------------------------

function buildManagerElement() {
    const root = document.createElement('div');
    root.className = 'tm-root';

    const toolbar = document.createElement('div');
    toolbar.className = 'tm-toolbar';

    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Filter themes…';
    search.addEventListener('input', () => {
        filterValue = search.value;
        renderGrid();
    });

    const importBtn = document.createElement('div');
    importBtn.className = 'menu_button';
    importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import theme';
    importBtn.addEventListener('click', () => promptImport());

    const refreshBtn = document.createElement('div');
    refreshBtn.className = 'menu_button';
    refreshBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', () => refreshThemes());

    countEl = document.createElement('div');
    countEl.className = 'tm-count';

    toolbar.appendChild(search);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(countEl);

    gridEl = document.createElement('div');
    gridEl.className = 'tm-grid';

    root.appendChild(toolbar);
    root.appendChild(gridEl);
    return root;
}

async function openManager() {
    filterValue = '';
    const element = buildManagerElement();

    const popupPromise = ctx().callGenericPopup(element, ctx().POPUP_TYPE.DISPLAY, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    try {
        await refreshThemes();
    } catch (err) {
        console.error(err);
        toastr.error('Could not load themes. See console for details.');
    }

    await popupPromise;
    gridEl = null;
    countEl = null;
}

// ---------------------------------------------------------------------
// Menu button
// ---------------------------------------------------------------------

function addMenuButton() {
    const container = document.getElementById('extensionsMenu');
    if (!(container instanceof HTMLElement) || document.getElementById('tm_open_manager_button')) {
        return;
    }

    const button = document.createElement('div');
    button.id = 'tm_open_manager_button';
    button.className = 'list-group-item flex-container flexGap5';

    const icon = document.createElement('div');
    icon.className = 'fa-solid fa-palette extensionsMenuExtensionButton';

    const label = document.createElement('span');
    label.textContent = 'Theme Manager';

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', () => openManager());

    container.appendChild(button);
}

jQuery(() => {
    addMenuButton();
    // The extensions menu can be (re)built slightly after extensions load; retry briefly.
    let attempts = 0;
    const interval = setInterval(() => {
        attempts += 1;
        addMenuButton();
        if (document.getElementById('tm_open_manager_button') || attempts > 20) {
            clearInterval(interval);
        }
    }, 500);
});
