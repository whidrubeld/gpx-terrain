import { useSelector } from '@tanstack/react-store'
import { useEffect, useReducer, useRef } from 'react'

import { useT } from '../i18n'
import { formatBytes, formatCount, formatDecimal } from '../lib/format'
import { coarseSegments } from '../scene/lod'
import { meanFrame, perf } from '../scene/perf'
import { settingsStore } from '../state/settings'
import { terrainStore, uiStore } from '../state/viewer'
import { Panel, Value } from './controls'

/** Frame time (ms) at the top of the graph. */
const GRAPH_MS = 50
const GRAPH_HEIGHT = 24

function heap() {
  const memory = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory
  return memory ? formatBytes(memory.usedJSHeapSize) : null
}

/** One pixel column per frame; the dotted line marks 60 FPS. */
function drawGraph(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return
  const style = getComputedStyle(canvas)
  const ink = style.getPropertyValue('--fg')
  const faint = style.getPropertyValue('--line-strong')
  const { width, height } = canvas
  context.clearRect(0, 0, width, height)
  context.fillStyle = faint
  const sixty = height - Math.round((16.7 / GRAPH_MS) * height)
  for (let x = 0; x < width; x += 2) context.fillRect(x, sixty, 1, 1)
  context.fillStyle = ink
  const n = perf.frames.length
  for (let i = 0; i < Math.min(perf.count, width); i++) {
    const ms = perf.frames[(perf.head - 1 - i + n) % n]
    const h = Math.max(
      1,
      Math.min(height, Math.round((ms / GRAPH_MS) * height))
    )
    context.fillRect(width - 1 - i, height - h, 1, h)
  }
}

export function PerfPanel({ className }: { className?: string }) {
  const t = useT()
  return (
    <Panel
      id='perf'
      index='04'
      title={t('panels.perf')}
      icon='gauge'
      className={className}
    >
      <PerfBody />
    </Panel>
  )
}

/** Polls the renderer statistics while it is on screen. */
export function PerfBody() {
  const t = useT()
  const theme = useSelector(uiStore, (s) => s.theme)
  const tiles = useSelector(
    terrainStore,
    (s) => ({
      loaded: s.loaded,
      textured: s.textured,
      total: s.total,
      detailed: s.detailed
    }),
    {
      compare: (a, b) =>
        a.loaded === b.loaded &&
        a.textured === b.textured &&
        a.total === b.total &&
        a.detailed === b.detailed
    }
  )
  const segments = useSelector(settingsStore, (s) => s.segments)
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const graph = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const timer = setInterval(refresh, 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (graph.current) drawGraph(graph.current)
  })

  const ms = meanFrame(30)
  const rows: [string, string][] = [
    [t('perf.calls'), formatCount(perf.calls)],
    [t('perf.triangles'), formatCount(perf.triangles)],
    [
      t('perf.lines'),
      `${formatCount(perf.lines)} · ${formatCount(perf.points)}`
    ],
    [t('perf.geometries'), formatCount(perf.geometries)],
    [t('perf.textures'), formatCount(perf.textures)],
    [t('perf.programs'), formatCount(perf.programs)],
    [
      t('perf.tiles'),
      `${tiles.loaded}/${tiles.total} dem · ${tiles.textured}/${tiles.total} img`
    ],
    [
      t('perf.lod'),
      // tiles in detail, and the meshes: coarse → detailed
      tiles.detailed === null
        ? t('view.off')
        : `${tiles.detailed}/${tiles.total} · ${coarseSegments(segments)}→${segments}`
    ],
    [
      t('perf.resolution'),
      `${Math.round(perf.width * perf.dpr)}×${Math.round(perf.height * perf.dpr)} @${perf.dpr.toFixed(2)}`
    ]
  ]
  const memory = heap()
  if (memory) rows.push([t('perf.heap'), memory])

  return (
    <>
      {/* labels on one line, both values (and units) on one baseline */}
      <div className='grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1'>
        <span className='hud-label'>{t('perf.frameRate')}</span>
        <span className='hud-label text-right'>{t('perf.frame')}</span>
        <Value
          parts={[ms ? String(Math.round(1000 / ms)) : '—', t('units.fps')]}
          size='lg'
        />
        <span className='justify-self-end'>
          <Value
            parts={[ms ? formatDecimal(ms, 1) : '—', t('units.ms')]}
            size='lg'
          />
        </span>
      </div>
      <canvas
        key={theme}
        ref={graph}
        width={120}
        height={GRAPH_HEIGHT}
        className='mt-2 h-9 w-full border border-line [image-rendering:pixelated]'
        aria-label={t('perf.frameTimes', { ms: Math.round(ms) })}
      />
      <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs uppercase tracking-[0.06em]'>
        {rows.map(([key, value]) => (
          <div key={key} className='contents'>
            <dt className='text-muted'>{key}</dt>
            <dd className='truncate text-right tabular-nums'>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
