---
name: release
description: Release a new version of GPX Terrain — pick the version, update three-map-terrain if a new one is out, refresh screenshots, verify, merge dev into master (which deploys to GitHub Pages) and tag a GitHub release. Use when asked to release, deploy, publish or ship the app, or to bump its version.
---

# Release

The app is not published to npm. A push to `master` runs
`.github/workflows/deploy.yml` (`pnpm validate`, then `dist/` to the
`gh-pages` branch): https://whidrubeld.github.io/gpx-terrain/. Installed
copies pick the new version up through the service worker and show the
"new version" toast.

## 1. Pick the version

`package.json` → `version` (shown in About). Compare with the last tag
(`git describe --tags --abbrev=0`, `git log <tag>..HEAD`):

- **major** — a change users must relearn (layout, flows, dropped features);
- **minor** — new features, languages, settings;
- **patch** — fixes only.

## 2. Prepare (on `dev`)

1. A new **three-map-terrain**? `npm view three-map-terrain version`; bump
   the range in `package.json`, `pnpm install`, read its changelog/README
   for API changes (`src/scene/` uses `Map`, `Source`, `Utils`, `pick`,
   `getLocation`, `getTerrainPositionSync`). About shows its version.
2. Settings format changed incompatibly? Bump the `@1` suffix of
   `STORAGE_KEY` in `src/state/settings.ts` and the inline script in
   `index.html`.
3. `pnpm validate && pnpm test:e2e`, then the `verify-app` skill.
4. UI changed visibly: `pnpm dev`, then `pnpm screenshots` (Google Chrome,
   `cwebp`) and look at `docs/*.webp`.
5. README: features, screenshots, anything the release changes.

## 3. Ship (needs the user's go-ahead — it is public)

```bash
gh pr create --base master --head dev --title "Release v<version>" --body-file <notes.md>
# after the merge:
gh run watch                                   # the deploy workflow
gh release create v<version> --target master --title "v<version>" --notes-file <notes.md>
```

Check the live site: the version in About, the console, an example track,
offline start after one visit. If the deploy fails, nothing changed on
Pages: fix on `dev`, merge again (or `gh workflow run deploy.yml --ref master`).
