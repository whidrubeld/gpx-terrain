import { useSelector } from '@tanstack/react-store'
import { useState } from 'react'

import { progressAtIndex, type Track } from '../gpx/track'
import { activityLabel, type Translate, useT } from '../i18n'
import {
  distanceParts,
  elevationParts,
  formatBytes,
  formatClock,
  formatCount,
  formatDate,
  formatDuration,
  formatLat,
  formatLon,
  gradeParts,
  joinParts,
  speedParts,
  timezoneLabel
} from '../lib/format'
import {
  focusOn,
  hoverStore,
  seek,
  setHoverWaypoint,
  viewerStore
} from '../state/viewer'
import { cx, Panel, Stat } from './controls'

/** A waypoint's name, or its number when the file has none. */
export const waypointName = (
  t: Translate,
  waypoint: { name: string | null },
  index: number
) => waypoint.name ?? t('waypoint.untitled', { n: index + 1 })

export function TrackPanel({ className }: { className?: string }) {
  const t = useT()
  return (
    <Panel
      id='track'
      index='01'
      title={t('panels.track')}
      icon='flag'
      className={className}
    >
      <TrackBody />
    </Panel>
  )
}

export function TrackBody() {
  const t = useT()
  const track = useSelector(viewerStore, (s) => s.track)
  return track ? (
    <TrackDetails track={track} />
  ) : (
    <p className='hud-label caret'>{t('track.loading')}</p>
  )
}

function TrackDetails({ track }: { track: Track }) {
  const t = useT()
  const source = useSelector(viewerStore, (s) => s.source)
  const [expanded, setExpanded] = useState(false)
  const { stats, metadata } = track
  const recorded = stats.startTime ?? metadata.time
  const kind = track.type
    ? activityLabel(t, track.type)
    : t(source?.kind === 'preset' ? 'track.example' : 'track.track')
  const segments = track.segmentStarts.length

  const meta: [string, string][] = [
    [
      t('track.created'),
      metadata.time !== null
        ? `${formatDate(metadata.time)} ${formatClock(metadata.time, false)}`
        : '—'
    ],
    [t('track.creator'), metadata.creator ?? '—'],
    [t('track.author'), metadata.author ?? '—'],
    [
      t('track.points'),
      `${formatCount(stats.points)}${segments > 1 ? ` · ${t('track.segments', { count: segments })}` : ''}`
    ],
    [
      t('track.elevation'),
      track.elevationSource === 'gpx'
        ? t('track.fromGpx')
        : track.elevationSource === 'dem'
          ? t('track.fromDem')
          : '—'
    ],
    [t('track.north'), formatLat(track.bounds.north)],
    [t('track.south'), formatLat(track.bounds.south)],
    [t('track.west'), formatLon(track.bounds.west)],
    [t('track.east'), formatLon(track.bounds.east)]
  ]
  if (source?.kind === 'file')
    meta.push([t('track.file'), `${source.name} · ${formatBytes(source.size)}`])
  if (metadata.copyright) meta.push([t('track.copyright'), metadata.copyright])

  return (
    <div className='grid gap-3'>
      <div className='grid gap-1'>
        <div className='hud-label flex gap-2'>
          <span className='text-fg'>{kind}</span>
          <span>{formatDate(recorded)}</span>
        </div>
        <h3 className='text-sm font-bold uppercase leading-tight tracking-[0.08em]'>
          {track.name}
        </h3>
        {stats.startTime !== null && stats.endTime !== null && (
          <div className='text-2xs uppercase tracking-[0.1em] text-muted tabular-nums'>
            {formatClock(stats.startTime, false)} →{' '}
            {formatClock(stats.endTime, false)} {timezoneLabel(stats.startTime)}
          </div>
        )}
        {metadata.desc && (
          <button
            type='button'
            className={cx(
              'mt-1 text-left text-2xs leading-4 text-muted',
              !expanded && 'line-clamp-3'
            )}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {metadata.desc}
          </button>
        )}
        {metadata.link && (
          <a
            className='text-2xs uppercase tracking-[0.1em] underline decoration-dotted underline-offset-4'
            href={metadata.link}
            target='_blank'
            rel='noreferrer'
          >
            {t('track.source')}
          </a>
        )}
      </div>

      <dl className='grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3'>
        <div className='col-span-2'>
          <Stat
            label={t('track.distance')}
            parts={distanceParts(stats.distance)}
            size='lg'
          />
        </div>
        <Stat
          label={t('track.duration')}
          parts={[formatDuration(stats.duration), '']}
        />
        <Stat
          label={t('track.moving')}
          parts={[formatDuration(stats.movingTime), '']}
        />
        <Stat label={t('track.ascent')} parts={elevationParts(stats.ascent)} />
        <Stat
          label={t('track.descent')}
          parts={elevationParts(stats.descent)}
        />
        <Stat label={t('track.highest')} parts={elevationParts(stats.maxEle)} />
        <Stat label={t('track.lowest')} parts={elevationParts(stats.minEle)} />
        <Stat
          label={t('track.avgSpeed')}
          parts={speedParts(stats.movingSpeed)}
        />
        <Stat label={t('track.maxGrade')} parts={gradeParts(stats.maxGrade)} />
        {stats.avgHr !== null && (
          <Stat
            label={t('track.avgHr')}
            parts={[String(Math.round(stats.avgHr)), t('units.bpm')]}
          />
        )}
        {stats.maxHr !== null && (
          <Stat
            label={t('track.maxHr')}
            parts={[String(Math.round(stats.maxHr)), t('units.bpm')]}
          />
        )}
      </dl>

      <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-2xs uppercase tracking-[0.06em]'>
        {meta.map(([key, value]) => (
          <div key={key} className='contents'>
            <dt className='text-muted'>{key}</dt>
            <dd className='truncate text-right tabular-nums' title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {track.waypoints.length > 0 && <Waypoints track={track} />}
    </div>
  )
}

function Waypoints({ track }: { track: Track }) {
  const t = useT()
  const hovered = useSelector(hoverStore, (s) => s.waypoint)
  const waypoints = track.waypoints
    .map((waypoint, index) => ({ waypoint, index }))
    .sort((a, b) => a.waypoint.distance - b.waypoint.distance)
  return (
    <div className='grid gap-1'>
      <div className='flex items-center gap-2'>
        <span className='hud-label'>{t('track.waypoints')}</span>
        <span className='rule' />
        <span className='hud-label'>{waypoints.length}</span>
      </div>
      <ol className='grid'>
        {waypoints.map(({ waypoint, index }) => (
          <li key={index}>
            <button
              type='button'
              className={cx(
                'grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-2 px-1 py-0.5 text-left text-2xs uppercase tracking-[0.06em] hover:bg-fg hover:text-bg',
                hovered === index && 'bg-fg text-bg'
              )}
              onPointerEnter={() => setHoverWaypoint(index)}
              onPointerLeave={() => setHoverWaypoint(null)}
              onFocus={() => setHoverWaypoint(index)}
              onBlur={() => setHoverWaypoint(null)}
              onClick={() => {
                seek(progressAtIndex(track, waypoint.index))
                focusOn({ lat: waypoint.lat, lon: waypoint.lon })
              }}
            >
              <span className='truncate'>
                {waypointName(t, waypoint, index)}
              </span>
              <span className='tabular-nums opacity-70'>
                {joinParts(distanceParts(waypoint.distance))}
              </span>
              <span className='w-14 text-right tabular-nums opacity-70'>
                {joinParts(elevationParts(waypoint.ele))}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
