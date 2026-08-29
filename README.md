# Theme Manager (SillyTavern extension)

A small grid-view manager for your SillyTavern custom UI themes
(`data/<user-handle>/themes/*.json`). Adds a **Theme Manager** entry to the
Extensions (wand ⚡) menu that opens a gallery of all your saved themes with:

- **Apply** a theme with one click
- **Set / remove a preview image** per theme (stored inside that theme's own
  JSON file, so it survives restarts)
- **Import** a theme from a `.json` file (the same format SillyTavern's own
  "Export theme" button produces)
- **Export** a theme back to a `.json` file (preview image stripped out, so
  the exported file stays a plain, shareable theme)
- **Delete** a theme, with confirmation
- Filter box to search by name

It's a pure client-side extension: it only calls SillyTavern's existing
`/api/settings/get`, `/api/themes/save` and `/api/themes/delete` endpoints —
no server plugin, no restart of the server required.

## Install

1. Copy the `theme-manager` folder into your SillyTavern installation at:
   `public/scripts/extensions/third-party/theme-manager/`
   (so the manifest ends up at
   `public/scripts/extensions/third-party/theme-manager/manifest.json`).
2. Reload SillyTavern in your browser.
3. Open the Extensions panel and make sure "Theme Manager" is enabled
   (third-party extensions are enabled by default unless you've turned that
   off globally).
4. Click the wand (⚡) icon in the bottom input bar → **Theme Manager**.

## Notes / limitations

- A theme you **import** in the gallery is written to disk immediately, but
  SillyTavern only loads the list of themes once per page load. After an
  import the page will auto-reload after a second so the new theme becomes
  selectable everywhere (including the normal User Settings panel).
- **Delete** and **preview image** changes don't require a reload — they take
  effect in the gallery immediately.
- Preview images are downscaled client-side (max ~480px, JPEG) before being
  saved, so they won't bloat your theme files much, but they are still base64
  text embedded in the theme's `.json` file. If you plan to share/export a
  theme, use the gallery's **Export** button — it strips the preview image
  out automatically.
- This only manages the UI **theme** presets (colors/CSS/layout prefs saved
  via SillyTavern's own theme dropdown), not character cards, presets, or
  other asset types.
