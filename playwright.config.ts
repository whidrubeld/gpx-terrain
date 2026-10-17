import { defineConfig } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // every test renders the terrain with software WebGL: two at a time
  workers: 2,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // page.route() does not see requests a service worker makes: tests that
    // mock the tile servers run without it (pwa.spec.ts turns it on)
    serviceWorkers: 'block'
  },
  projects: [
    {
      name: 'chromium',
      // no device preset: they emulate another OS in half of navigator
      // (platform vs userAgentData), and the app picks ⌘ or Ctrl from it
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          // software WebGL, so the tests also run on GPU-less CI runners
          args: ['--enable-unsafe-swiftshader']
        }
      }
    }
  ],
  // the production build: the service worker and the manifest only exist there
  webServer: {
    command: `yarn build && yarn preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
