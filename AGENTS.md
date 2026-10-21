# AGENTS.md

Guidance for AI coding agents working on **GPX Terrain** — a web app (PWA)
that shows a GPX track on real 3D terrain, built with
[three-map-terrain](https://github.com/whidrubeld/three-map-terrain) (its
showcase). Deployed to GitHub Pages from `master`:
https://whidrubeld.github.io/gpx-terrain/. Branches: `dev` → PR → `master`.

## Layout

```
src/
  main.tsx, App.tsx     entry; layouts, theme/language/document hooks, launch queue
  sw.ts                 service worker (Workbox, injectManifest): app shell + tile cache
  pwa.ts                registration, update prompt, install prompt (pwaStore)
  hotkeys.ts            one table for the key handler and the help dialog
  i18n/                 locales/en.json, ru.json; translate/useT/useLocale; Rich
  gpx/                  parse.ts (GPX → points), track.ts (stats), presets.ts (examples)
  lib/                  geo math, locale-aware formatting, terrain fitting
  state/                TanStack stores: settings (persisted), viewer (track, terrain,
                        hover, playback, ui, commands)
  scene/                R3F scene: terrain and its looks, map features and base
                        (layers.ts), route, markers, grid, camera rig, probes
  ui/                   Chooser (start screen + "Change track" dialog), TopBar, panels,
                        overlays/toasts, HelpDialog, Toolbar, controls, pixel icons
e2e/                    Playwright tests against the production build, tiles mocked
public/                 favicon, icons/ (yarn icons), presets/*.gpx (yarn presets)
scripts/                make-presets.mjs, make-icons.mjs, screenshots.mjs
docs/                   README screenshots (yarn screenshots)
.skills/                agent skills (symlinked as .claude/skills)
```

## Commands (Yarn classic 1.x, Node 24)

```bash
yarn                 # install
yarn dev             # http://localhost:5173 (no service worker in dev)
yarn typecheck       # tsc -b: app, service worker and node configs (3 tsconfigs)
yarn lint            # eslint (typescript-eslint strictTypeChecked + react-hooks)
yarn format          # prettier --write   (format:check in CI)
yarn test            # vitest unit tests (src/**/*.test.ts)
yarn test:e2e        # playwright; first time: yarn playwright install chromium
yarn build           # tsc -b + vite build + service worker → dist/
yarn preview         # serve dist/ (check PWA behavior here)
yarn validate        # lint + format:check + test + build (what deploy runs)
yarn presets         # regenerate public/presets/*.gpx (network: Overpass, AWS)
yarn icons           # regenerate public/icons/*.png from the pixel logo
yarn screenshots     # docs/*.webp from a running `yarn dev` (Chrome + cwebp)
```

Do **not** name a script `check`: `yarn check` is a built-in Yarn 1 command.

## How it works (read before changing src/)

- **Flow.** Without a track the page is the chooser (`Welcome`): drop or
  pick a `.gpx`, or open one of the examples. With a track, the logo, the
  track title in the top bar and `O` open the same chooser as a modal dialog
  (`ChooserDialog`); Esc or the backdrop keep the current track. There are no
  URL parameters. `loadFile`/`loadPreset` (state/viewer.ts) parse, build the
  track, close the chooser; only the latest request wins.
- **Errors are codes** (`GpxError.code`, `LoadError`), translated when shown,
  so they follow a change of language. Same for unnamed waypoints:
  `name: null` in the data, `waypointName()` numbers them in the UI.
- **i18n.** Every visible string is a key in `src/i18n/locales/en.json`;
  `ru.json` must have the same keys (TypeScript checks it through
  `Record<Locale, Messages>`; tests check placeholders and plural forms).
  Components call `useT()` (it re-renders them when the language changes);
  outside React use `t()`. Placeholders: `{name}`; plural messages are objects
  of `Intl.PluralRules` categories picked by `params.count`. Links inside a
  message: leave the placeholder and render with `<Rich>`. The language
  setting is `auto` until the user picks one (`detectLocale`: first supported
  language in `navigator.languages`, else English). `lib/format.ts` formats
  numbers, dates and units in the current language — components that only
  format must still call `useLocale()`. Coordinates stay international
  (decimal point, N/S/E/W). Doto has no Cyrillic: Russian falls back to
  JetBrains Mono in `.dot` text.
- **Looks.** `settings.look` — `photo`, `mono`, `model`, `wireframe` (the
  default) — is the one choice of how the scene is drawn; each is complete
  on its own anywhere, mountains or a city. `LOOK_STYLES` (scene/look.ts)
  gives its imagery (the photo, the photo in gray through a `process`,
  none), wireframe and the colors of the terrain and every feature, per
  theme. The map's own look stays solid: the terrain's material is our
  `material.create`, which reads the look (lines included) when the library
  calls it — a change restyles the tiles through `map.setMaterial()`, and
  only a new `process` reloads the imagery — and the features take the
  look's lines themselves. The imagery loads in every look, so switching is
  immediate; it is credited only where it shows (`showsImagery`). W goes
  into lines and back to `solidLook`.
- **Map features** (scene/layers.ts): `Buildings`, `Roads`, `Water`, `Trees`
  from OpenFreeMap (no key; one vector tile for all four), made once per map.
  Which of them show is per look (`lookFeatures`, defaults in
  `LOOK_FEATURES`: on the photo only buildings, since the photo has the
  rest), under one switch (`features`, C). A layer joins the map the first
  time it is shown and is only hidden after that. Another look or theme is
  `layer.setMaterial()`: colors, and in lines the outlines over a light fill
  (`fillOpacity`) — the materials change, not the geometry. The library
  draws a few tiles per frame, the nearest to `map.focus` (the controls'
  target) first. Below their `FEATURE_MIN_ZOOM` they draw nothing: the View
  panel says from which zoom, and the credit (`drawsFeatures`) follows.
- **The base** is two `TerrainBase`s: walls in a dot pattern (a material of
  ours: the dots follow the position, the base has no UVs) and their
  outline. It stays solid in lines because the map's look does.
- **`map.terrain` is not a list of tiles**: it also holds the layers' groups.
  Use `placedTiles(map)` (scene/tiles.ts).
- **View panel**: the look, exaggeration and what is drawn first; the
  camera, rendering and input behind "Advanced" (`settings.advanced`).
- **Hotkeys** (`hotkeys.ts`) match `KeyboardEvent.code`, so they work on any
  layout. Viewer controls are single keys (skipped with Ctrl/⌘/Alt held, in
  text fields, and when `settings.shortcuts` is off — WCAG 2.1.4). Document
  commands use the platform modifier: only `⌘O` / `Ctrl+O` (`mod: true`). Do
  not add other ⌘/Ctrl letters (the browser owns them; ⌘W, Ctrl+T… cannot
  even be intercepted) or Alt combinations (browser menus on Windows/Linux,
  special characters on macOS). `IS_APPLE` reads
  `navigator.userAgentData.platform` first. `Kbd always` marks hints that
  work with shortcuts off (combos, Esc); other hints hide then.
- **Touch or mouse.** `useTouch()` (ui/controls.tsx) splits the UI: phones
  and tablets get touch gestures only (first-visit hint, help, no drop
  area, no key hints), everything else mouse and keyboard only. Never both
  in one place; use this hook, not another query. CSS hides `.kbd` by the
  same `(hover: none) and (pointer: coarse)`.
- **Dialogs** use `Modal` (ui/controls.tsx): the store opens and closes the
  `<dialog>` in an effect, Esc is turned into a state change (`cancel` is
  prevented), and a late `close` event is ignored when the dialog is open
  again. Keep it that way: otherwise Esc followed quickly by O leaves the
  chooser shut. `data-autofocus` marks the element focused on open.
- **Toasts** (errors, "new version") are manual popovers: they live in the
  top layer and stay visible above modal dialogs.
- **File input.** Exactly one `FileInput` is mounted: inside the chooser while
  it shows (everything outside a modal dialog is inert), else in `App`. It
  listens to the `open-file` command in a layout effect, so a key pressed
  right after a track appears already finds it.
- **PWA.** `vite-plugin-pwa` with `injectManifest` and our `src/sw.ts`:
  precache of the build (scripts, CSS, fonts, icons, example tracks), an app
  shell route for navigations, and a `CacheFirst` tile cache for AWS Terrain
  Tiles and EOX (2000 entries, 30 days). Only tiles that decode are stored,
  and requests with `cache: 'reload'` — three-map-terrain's retry of a
  truncated body — bypass the cache. OpenFreeMap: its TileJSON (it names the
  current planet build) network first, the vector tiles cache first. `registerType: 'prompt'`: a new version
  waits for "Reload" in `UpdateToast` (`SKIP_WAITING` message). The manifest
  has `file_handlers` for `.gpx`; `useLaunchQueue` opens files the installed
  app was launched with. The service worker only exists in production builds.
- **Settings** persist under `gpx-terrain/settings@1` (the old
  `three-map-terrain/gpx-viewer/settings@1` is read once as a fallback).
  Unknown or out-of-range stored values fall back to the defaults; `imagery`
  and `wireframe` of before looks become a look. The inline
  script in `index.html` applies theme and language before the first paint —
  keep it in sync with `settings.ts` and `i18n/locales.ts`.
- **Scene**: `fitTerrain` picks the deepest zoom whose grid holds the track
  (at most 14: a city fits there, with trees); the route is draped with
  `getTerrainPositionSync`; exaggeration is `scale.z` of the world group;
  the canvas renders on demand while there is no track.

## Visual conventions

- Black and white, square, no radii, no shadows; tokens in `src/index.css`
  (`--fg`, `--muted`, `--line`…), both themes. Pixel icons in `ui/Icon.tsx`.
  Color only where the scene has it: the looks' features, and their swatches
  in the legend.
- **Vertical alignment is measured, not eyeballed.** Browsers round text
  baselines and the boxes of odd-sized elements to whole CSS pixels. The
  10 px UI text uses a 15 px line height (`--text-2xs--line-height`): its
  capitals then land on the same pixel as the 9 px icons and 1 px rules next
  to it. `.kbd` uses `line-height: 12px`. Do not "fix" one element with a
  nudge; check rows with `.skills/verify-app/scripts/align.mjs`.
- Text that cycles through values (the theme button) uses `StableLabel`, so
  the button keeps the width of its longest option in every language.

## Conventions

- TypeScript `strict`, ESM, React 19 function components, TanStack Store for
  state (no React context). Use TS `private`, not `#private`.
- No UI kit: plain elements, Tailwind 4 utilities and the component classes
  in `index.css`.
- Every GPX string is untrusted: render it as text; links keep only
  `http(s)` URLs (`safeLink`).
- Prettier: no semicolons, single quotes, no trailing commas, JSX single
  quotes. Don't hand-format; run `yarn format`.
- Every behaviour change needs a unit test; user flows (chooser, files,
  hotkeys, PWA) are covered by `e2e/`. Unit tests that need the DOM declare
  `// @vitest-environment jsdom`.
- Playwright: no `devices[...]` presets — they emulate another OS in half of
  `navigator`, and the app picks ⌘ or Ctrl from it. Tile servers are mocked
  (`e2e/tiles.ts`: terrain, imagery, OpenFreeMap with empty vector tiles)
  with service workers blocked; `pwa.spec.ts` allows them.

## Version constraints

- `three-map-terrain` comes from npm (`^3.1`: layers drawn between frames,
  looks changed in place, `fillOpacity`); its version is shown in About
  (`__LIBRARY_VERSION__`, read from its package.json at build time).
- `three` and `@types/three` share the same minor, inside the library's peer
  range.
- React stays `<19.4` — the `@react-three/fiber` 9.x peer range.
- TypeScript `~6.0`: typescript-eslint's peer range is `<6.1.0`.
- `vite-plugin-pwa` 2.x ↔ Vite 8 and Workbox 7 (`workbox-*` packages and
  `workbox-build` on the same version).
- `tailwindcss` ↔ `@tailwindcss/vite`: same version.
- `@tanstack/react-store` is 0.x: minors may break the API.
- React Three Fiber 9 still uses `THREE.Clock` (deprecated in r186): the
  console warning comes from there.

## MCP servers (`.mcp.json`)

- **playwright** — drive the app, read the console, take screenshots.
- **threejs-devtools** — inspect the live scene of `yarn dev` (`DEV_PORT=5173`).
- **context7** — up-to-date docs (three.js, R3F, Vite, Workbox…).

In development the stores are on `window.__viewer`
(`viewerStore`, `terrainStore`, `uiStore`, `settingsStore`, `loadPreset`,
`setHoverIndex`, `seek`, `sceneRefs` …).

## Skills (`.skills/`)

- `verify-app` — check the app in a browser: both layouts, languages and
  themes, the chooser, real tiles, PWA in the production build, alignment.
- `upgrade-dependencies` — bump packages, handle the couplings above, verify.
- `release` — version bump, three-map-terrain update, screenshots, deploy.
