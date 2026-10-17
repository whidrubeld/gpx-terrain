import { createStore } from '@tanstack/react-store'

/** Chromium's install prompt (not in the DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaState {
  /** a new version is installed and waits for a reload */
  needRefresh: boolean
  /** the app shell is cached: the app starts offline */
  offlineReady: boolean
  /** the browser lets the page offer installation (Chromium) */
  installable: boolean
}

export const pwaStore = createStore<PwaState>({
  needRefresh: false,
  offlineReady: false,
  installable: false
})

let update: ((reloadPage?: boolean) => Promise<void>) | undefined
let installPrompt: BeforeInstallPromptEvent | null = null

/** Registers the service worker (production builds only) and listens for installability. */
export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    installPrompt = event as BeforeInstallPromptEvent
    pwaStore.setState((s) => ({ ...s, installable: true }))
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    pwaStore.setState((s) => ({ ...s, installable: false }))
  })

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  void import('virtual:pwa-register').then(({ registerSW }) => {
    update = registerSW({
      immediate: true,
      onNeedRefresh: () =>
        pwaStore.setState((s) => ({ ...s, needRefresh: true })),
      onOfflineReady: () =>
        pwaStore.setState((s) => ({ ...s, offlineReady: true }))
    })
  })
}

/** Activates the waiting service worker; the page reloads once it controls it. */
export function applyUpdate() {
  void update?.(true)
}

export function dismissUpdate() {
  pwaStore.setState((s) => ({ ...s, needRefresh: false }))
}

export async function installApp() {
  const prompt = installPrompt
  if (!prompt) return
  await prompt.prompt()
  await prompt.userChoice
  // a prompt can be shown once
  installPrompt = null
  pwaStore.setState((s) => ({ ...s, installable: false }))
}

/** Running as an installed app (not in a browser tab). */
export const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true
