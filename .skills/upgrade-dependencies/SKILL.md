---
name: upgrade-dependencies
description: Upgrade the npm dependencies of GPX Terrain (three-map-terrain, three.js, React Three Fiber, TanStack Store, Tailwind CSS, Vite, vite-plugin-pwa/Workbox, Vitest, Playwright, TypeScript, ESLint) to the latest compatible versions, resolve breaking changes and verify the app. Use when asked to update, bump or upgrade packages, refresh the lockfile, fix outdated or vulnerable dependencies, or move to a new three.js or three-map-terrain release.
---

# Upgrade dependencies

One package root, pnpm 12 (pinned by `packageManager`), `pnpm-lock.yaml`.

## 1. Inventory

```bash
pnpm outdated
pnpm self-update   # pnpm itself: rewrites `packageManager`
npm view <pkg>@latest version peerDependencies engines --json   # every major bump
```

Also the pinned tooling outside `package.json`:

- `.mcp.json` — `@playwright/mcp`, `threejs-devtools-mcp`, `@upstash/context7-mcp`
- `.github/workflows/*.yml` — `actions/checkout`, `pnpm/action-setup`,
  `actions/setup-node`, `actions/upload-artifact`,
  `JamesIves/github-pages-deploy-action`

Prefer versions published at least two weeks ago.

## 2. Couplings — check these first

| Coupling                                             | Rule                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `three-map-terrain` ↔ `three`                        | `three` inside the library's `peerDependencies.three`. A new library major: read its README "Upgrading" section.        |
| `three` ↔ `@types/three`                             | Same minor.                                                                                                             |
| `@react-three/fiber` ↔ `react`/`react-dom`           | Fiber pins an upper bound (`<19.4` for 9.x): never bump React past it. `@react-three/drei` major follows fiber's.       |
| `typescript` ↔ `typescript-eslint`                   | TS inside typescript-eslint's peer range (`~6.0` today; TS 7 has no JS compiler API yet).                               |
| `vite-plugin-pwa` ↔ `vite`, `workbox-*`              | The plugin lists the Vite majors it supports; all `workbox-*` packages and `workbox-build` on one version.              |
| `vitest` ↔ `vite`, `jsdom`                           | Vitest lists supported Vite majors and its jsdom range (DOM tests use `// @vitest-environment jsdom`).                  |
| `tailwindcss` ↔ `@tailwindcss/vite`                  | Same version; Tailwind majors change the CSS-first config in `src/index.css` (`@theme`, `@custom-variant`).             |
| `@tanstack/react-store`                              | 0.x: minors may change `createStore`, `useSelector`, `shallow`.                                                         |
| `eslint` ↔ `@eslint/js`, `eslint-plugin-react-hooks` | Same ESLint major; react-hooks: keep only `rules-of-hooks` and `exhaustive-deps` (the compiler rules misread R3F code). |
| `@playwright/test` ↔ browsers                        | After a bump: `pnpm exec playwright install chromium`.                                                                  |
| Node                                                 | CI runs Node 24; check `engines` before raising requirements.                                                           |

Record every upgrade you **cannot** do and why — in the report and in
AGENTS.md → Version constraints.

## 3. Apply

Edit ranges in `package.json` (caret; tilde for `typescript`), then
`pnpm install` (`pnpm update --latest <pkg>` does both). A dependency whose
build scripts pnpm blocks needs an `allowBuilds` entry in
`pnpm-workspace.yaml` (none does today); a release younger than pnpm's
`minimumReleaseAge` a `minimumReleaseAgeExclude` entry there — remove the
entries of versions that have aged since. If the lockfile fights back, delete
`node_modules` and `pnpm-lock.yaml` and install again.

three.js releases: read the [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
between the versions. The app uses more of three than the library: `Line2`
(`three/addons`), `Points`, `MapControls`, the camera's view offset, material
swaps at runtime (src/scene/). React Three Fiber still uses `THREE.Clock`.

## 4. Verify — everything must pass

```bash
pnpm validate
pnpm test:e2e
```

Then the `verify-app` skill: real tiles in both layouts, the PWA in the
production build (vite-plugin-pwa and Workbox bumps change the service
worker), and the alignment script after Tailwind or font bumps.

## 5. Report

A table `package | old | new`, the blocked upgrades with the reason, and
every code change the upgrade required.
