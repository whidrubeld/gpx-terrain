/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import library from 'three-map-terrain/package.json' with { type: 'json' }
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import app from './package.json' with { type: 'json' }

const BACKGROUND = '#0a0a0a'

export default defineConfig({
  // relative asset URLs: served from https://<user>.github.io/gpx-terrain/
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // our own service worker (src/sw.ts): app shell + a tile cache
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // a new version waits until the user reloads (see `UpdateToast`)
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,gpx}'],
        // three.js alone is ~1 MB
        maximumFileSizeToCacheInBytes: 4 * 1024 ** 2
      },
      manifest: {
        id: './',
        name: 'GPX Terrain',
        short_name: 'GPX Terrain',
        description: app.description,
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: BACKGROUND,
        theme_color: BACKGROUND,
        categories: ['navigation', 'sports', 'travel'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // the installed app opens .gpx files from the OS (see `useLaunchQueue`)
        file_handlers: [
          {
            action: './',
            accept: { 'application/gpx+xml': ['.gpx'] }
          }
        ],
        launch_handler: { client_mode: ['focus-existing', 'auto'] }
      }
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(app.version),
    __LIBRARY_VERSION__: JSON.stringify(library.version)
  },
  resolve: {
    // one three.js, also when three-map-terrain is `pnpm link`ed to a local
    // build that has its own copy in node_modules
    dedupe: ['three']
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600
  },
  test: {
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true
  }
})
