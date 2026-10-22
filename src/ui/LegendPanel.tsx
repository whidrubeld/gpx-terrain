import { shallow, useSelector } from '@tanstack/react-store'
import type { ReactNode } from 'react'

import { useT } from '../i18n'
import {
  distanceParts,
  elevationParts,
  formatDecimal,
  joinParts
} from '../lib/format'
import { FEATURES, settingsStore, shownFeatures } from '../state/settings'
import { terrainStore, uiStore, viewerStore } from '../state/viewer'
import { graticuleStep } from '../scene/Graticule'
import { FEATURE_MIN_ZOOM } from '../scene/layers'
import { GLYPHS, type GlyphName, LOOK_STYLES, WIRE_FILL } from '../scene/look'
import { markStep } from '../scene/Markers'
import { Panel } from './controls'

/** The scene's marker glyph, from the same pixel pattern. */
function Glyph({ name }: { name: GlyphName }) {
  const rows = GLYPHS[name]
  return (
    <svg
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      width={rows[0].length * 2}
      height={rows.length * 2}
      shapeRendering='crispEdges'
      fill='currentColor'
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        Array.from(row, (cell, x) =>
          cell === '#' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
          ) : null
        )
      )}
    </svg>
  )
}

function Line({
  width,
  opacity = 1,
  dashed = false
}: {
  width: number
  opacity?: number
  dashed?: boolean
}) {
  return (
    <svg width={28} height={8} aria-hidden>
      <line
        x1={0}
        x2={28}
        y1={4}
        y2={4}
        stroke='currentColor'
        strokeWidth={width}
        strokeOpacity={opacity}
        strokeDasharray={dashed ? '2 2' : undefined}
        shapeRendering='crispEdges'
      />
    </svg>
  )
}

/**
 * A map feature in the current look: roads as a line, the others as an
 * area — solid, or in lines its outline over the scene's light fill.
 */
function Swatch({
  color,
  line,
  outline
}: {
  color: string
  line: boolean
  outline: boolean
}) {
  return (
    <svg width={28} height={8} aria-hidden>
      {line ? (
        <line
          x1={0}
          x2={28}
          y1={4}
          y2={4}
          stroke={color}
          strokeWidth={2}
          shapeRendering='crispEdges'
        />
      ) : (
        <rect
          x={6.5}
          y={0.5}
          width={15}
          height={7}
          fill={color}
          fillOpacity={outline ? WIRE_FILL : 1}
          stroke={outline ? color : 'currentColor'}
          strokeOpacity={outline ? 1 : 0.4}
          shapeRendering='crispEdges'
        />
      )}
    </svg>
  )
}

function Row({
  symbol,
  label,
  detail
}: {
  symbol: ReactNode
  label: string
  detail?: string
}) {
  return (
    <li className='grid h-5 grid-cols-[32px_1fr_auto] items-center gap-2 text-2xs uppercase tracking-[0.08em]'>
      <span className='grid place-items-center'>{symbol}</span>
      <span className='truncate'>{label}</span>
      {detail && <span className='text-muted tabular-nums'>{detail}</span>}
    </li>
  )
}

export function LegendPanel({ className }: { className?: string }) {
  const t = useT()
  return (
    <Panel
      id='legend'
      index='03'
      title={t('panels.legend')}
      icon='legend'
      className={className}
    >
      <LegendBody />
    </Panel>
  )
}

export function LegendBody() {
  const t = useT()
  const track = useSelector(viewerStore, (s) => s.track)
  const fit = useSelector(terrainStore, (s) => s.fit)
  const heights = useSelector(terrainStore, (s) => s.heights)
  const exaggeration = useSelector(settingsStore, (s) => s.exaggeration)
  const look = useSelector(settingsStore, (s) => s.look)
  const shown = useSelector(settingsStore, shownFeatures, { compare: shallow })
  const theme = useSelector(uiStore, (s) => s.theme)
  const step = fit ? graticuleStep(fit) : null
  const style = LOOK_STYLES[look][theme]
  // the features drawn at this zoom
  const features = FEATURES.filter(
    (feature) =>
      shown[feature] && fit !== null && fit.zoom >= FEATURE_MIN_ZOOM[feature]
  )

  return (
    <>
      <ul className='grid gap-0.5'>
        <Row symbol={<Line width={3} />} label={t('legend.travelled')} />
        <Row
          symbol={<Line width={2} opacity={0.5} />}
          label={t('legend.ahead')}
        />
        <Row
          symbol={<Line width={1} opacity={0.4} dashed />}
          label={t('legend.hidden')}
        />
        <Row symbol={<Glyph name='start' />} label={t('markers.start')} />
        <Row symbol={<Glyph name='finish' />} label={t('markers.finish')} />
        <Row
          symbol={<Glyph name='waypoint' />}
          label={t('legend.waypoint')}
          detail={track ? String(track.waypoints.length) : undefined}
        />
        <Row
          symbol={<Glyph name='mark' />}
          label={t('legend.mark')}
          detail={
            track
              ? t('legend.every', {
                  distance: joinParts(
                    distanceParts(markStep(track.stats.distance))
                  )
                })
              : undefined
          }
        />
        <Row symbol={<Glyph name='playhead' />} label={t('legend.playhead')} />
        <Row symbol={<Glyph name='hover' />} label={t('legend.hover')} />
        <Row symbol={<Glyph name='cursor' />} label={t('legend.cursor')} />
        <Row
          symbol={<Line width={1} opacity={0.4} />}
          label={t('legend.graticule')}
          detail={step ? `${step}°` : undefined}
        />
        {features.map((feature) => (
          <Row
            key={feature}
            symbol={
              <Swatch
                color={style[feature]}
                line={feature === 'roads'}
                outline={style.wireframe}
              />
            }
            label={t(`view.${feature}`)}
          />
        ))}
      </ul>

      {fit && (
        <dl className='mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-line pt-2 text-2xs uppercase tracking-[0.06em]'>
          <dt className='text-muted'>{t('legend.zoom')}</dt>
          <dd className='text-right tabular-nums'>
            {t('legend.zoomValue', {
              zoom: fit.zoom,
              imagery: fit.imageryZoom
            })}
          </dd>
          <dt className='text-muted'>{t('legend.grid')}</dt>
          <dd className='text-right tabular-nums'>
            {fit.nTiles}×{fit.nTiles} ·{' '}
            {t('legend.perTile', {
              size: joinParts(distanceParts(fit.metersPerUnit * fit.tileSize))
            })}
          </dd>
          <dt className='text-muted'>{t('legend.scale')}</dt>
          <dd className='text-right tabular-nums'>
            {t('legend.scaleValue', {
              meters: formatDecimal(fit.metersPerUnit, 1)
            })}
          </dd>
          {heights && (
            <>
              <dt className='text-muted'>{t('legend.terrain')}</dt>
              <dd className='text-right tabular-nums'>
                {joinParts(elevationParts(heights.min / fit.zScale))} –{' '}
                {joinParts(elevationParts(heights.max / fit.zScale))}
              </dd>
            </>
          )}
          <dt className='text-muted'>{t('legend.vertical')}</dt>
          <dd className='text-right tabular-nums'>
            ×{formatDecimal(exaggeration, 2)}
          </dd>
        </dl>
      )}
    </>
  )
}
