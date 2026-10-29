---
name: verify-app
description: Check that GPX Terrain works and looks right in a real browser — the start screen and the chooser, example and file tracks on real tiles, both layouts, both languages and themes, the help dialog, keyboard shortcuts, the PWA (service worker, manifest, offline start) in the production build, and the vertical alignment of UI rows measured from pixels. Use after changing UI, styles, translations, the scene, the service worker or dependencies, and whenever a task says "make sure it still works / looks right".
---

# Verify the app

Unit tests (`pnpm test`) cover parsing, stats, i18n, formats, hotkeys and
settings; `pnpm test:e2e` covers the flows against the production build with
**mocked** tiles. This skill covers the rest: real data, real look.

## 1. Automated baseline

```bash
pnpm validate      # lint, format, unit tests, build
pnpm test:e2e      # chooser, examples, files, ⌘/Ctrl+O, shortcuts off, PWA offline
```

## 2. The app with real tiles

`pnpm dev` → http://localhost:5173 (no service worker in dev). With the
**playwright** MCP server (or a script), check in both viewports — 1280×800
and a phone, 390×844 — and in both languages (the EN | RU switch next to
the theme; `locale: 'ru-RU'` in a fresh context must pick Russian by itself):

1. Start screen: the chooser (drop area, Choose file, three examples with
   stats), toolbar (theme, language, help, source). No horizontal scroll.
2. `1` (or a click on an example): the terrain builds (the tile HUD), the
   route draws, the top bar shows the track name and its source. In dev the
   stores are on `window.__viewer`; wait for
   `terrainStore.state.drape && terrainStore.state.textured === terrainStore.state.total`.
3. Hover the route: the point card; drag the profile; play / pause.
4. `O` or a click on the track title: the chooser opens as a dialog with the
   focus on Choose file; Esc returns to the same track; `2` there loads
   another example and closes it.
5. Choose file / drop a `.gpx` (one without elevations and without waypoint
   names is a good test: heights come from the terrain, waypoints get
   numbered "Waypoint 1"). A broken file shows an error toast and keeps the
   current track.
6. `?`: the help dialog — keys show `⌘ O` on macOS, `Ctrl O` elsewhere.
   View → Keyboard shortcuts off: single keys stop working and their hints
   disappear; `⌘/Ctrl+O` and Esc still work.
7. Switch the language with a track open: panels, scene labels, units
   (`KM` / `КМ`), decimal separators and dates change; GPX content does not.
8. Console: no errors. One warning is expected: `THREE.Clock` is deprecated
   (React Three Fiber's, not ours).

`pnpm screenshots` renders the README images from the running dev server
(Google Chrome for GPU rendering, `cwebp`); look at them, too.

## 3. PWA (production build only)

```bash
pnpm build && pnpm preview      # http://localhost:4173
```

- DevTools → Application: the manifest (name, icons incl. maskable,
  `file_handlers` for `.gpx`), the service worker activated, the precache
  (JS, CSS, fonts, icons, `presets/*.gpx`).
- Offline (DevTools or `context.setOffline(true)`): reload → the start
  screen; the examples open; the status bar shows "Offline". Tracks viewed
  before have their tiles in the `tiles` cache.
- An update: build again with a change and reload — the "new version" toast
  appears; Reload activates it.

## 4. Vertical alignment

Icons, text, rules and key hints in a row must share one optical center.
Browsers round baselines and odd-sized boxes to whole pixels, so judge from
pixels, not from the CSS:

```bash
node .agents/skills/verify-app/scripts/align.mjs http://localhost:5173/ 2 ru   # and: … 1 en
```

It prints, per row, the center of each atom relative to the row's center in
CSS px. Atoms of a row should agree within about 0.5 px (today: icons and
rules +0.5, 10 px text +0.35, `kbd` boxes and switches 0). Single characters
in boxes at fractional positions can read off by up to ~2 px: confirm a
suspicious value with a zoomed screenshot of the element (Playwright,
`deviceScaleFactor: 2`, scaled up without smoothing) before changing CSS. The
rules behind the current values are in AGENTS.md → Visual conventions.

## 5. Report

Screenshots (or a description) per layout/language/theme checked, console
errors verbatim, the alignment output if UI changed, and what was not checked.
