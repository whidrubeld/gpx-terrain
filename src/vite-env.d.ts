/// <reference types="vite/client" />

/** `version` of this app (package.json). */
declare const __APP_VERSION__: string
/** `version` of the three-map-terrain package it is built with. */
declare const __LIBRARY_VERSION__: string

/** File Handling API: files the installed app was launched with (Chromium). */
interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[]
}

interface Window {
  readonly launchQueue?: {
    setConsumer(consumer: (params: LaunchParams) => void): void
  }
}
