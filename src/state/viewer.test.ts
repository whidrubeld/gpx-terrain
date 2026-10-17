// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { loadPreset, viewerStore } from './viewer'

describe('loadPreset', () => {
  it('reports a network failure in the app language, not the browser text', async () => {
    // Safari's wording; Chrome says "Failed to fetch"
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Load failed')))
    await loadPreset('eiger-trail')
    expect(viewerStore.state.error).toEqual({ code: 'network' })
    expect(viewerStore.state.loading).toBeNull()
  })

  it('keeps the detail of other failures', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('', { status: 404 }))
    )
    await loadPreset('eiger-trail')
    expect(viewerStore.state.error).toEqual({
      code: 'loadFailed',
      detail: 'HTTP 404'
    })
  })
})
