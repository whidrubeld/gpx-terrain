import { useSelector } from '@tanstack/react-store'
import { shallow } from '@tanstack/react-store'

import { useT } from '../i18n'
import { Rich } from '../i18n/Rich'
import {
  elevationParts,
  formatDecimal,
  formatLat,
  formatLon,
  joinParts
} from '../lib/format'
import { drawsFeatures } from '../scene/layers'
import { showsImagery } from '../scene/look'
import { settingsStore, shownFeatures } from '../state/settings'
import { hoverStore, terrainStore, viewerStore } from '../state/viewer'
import { useOnline } from './controls'
import { LIBRARY } from './Toolbar'

const link = 'hover:text-fg'

export function StatusBar() {
  const t = useT()
  const online = useOnline()
  const cursor = useSelector(hoverStore, (s) => s.cursor)
  const terrain = useSelector(
    terrainStore,
    (s) => ({
      fit: s.fit,
      loaded: s.loaded,
      textured: s.textured,
      total: s.total
    }),
    { compare: shallow }
  )
  const exaggeration = useSelector(settingsStore, (s) => s.exaggeration)
  const preset = useSelector(viewerStore, (s) => s.source?.kind === 'preset')
  const features = useSelector(
    settingsStore,
    (s) =>
      terrain.fit !== null && drawsFeatures(shownFeatures(s), terrain.fit.zoom)
  )
  const imagery = useSelector(settingsStore, (s) => showsImagery(s.look))

  return (
    <footer className='panel pointer-events-auto flex h-7 items-center gap-4 overflow-hidden px-2.5 text-3xs font-semibold uppercase tracking-[0.12em] tabular-nums'>
      {!online && <span className='tag tag-strong'>{t('status.offline')}</span>}
      <span
        className='flex min-w-0 flex-none gap-3 sm:w-[19rem]'
        aria-live='off'
      >
        <span className='text-muted'>{t('status.cursor')}</span>
        {cursor ? (
          <>
            <span>{formatLat(cursor.lat)}</span>
            <span>{formatLon(cursor.lon)}</span>
            <span>{joinParts(elevationParts(cursor.alt))}</span>
          </>
        ) : (
          <span className='text-muted'>{t('status.offTerrain')}</span>
        )}
      </span>
      {terrain.fit && (
        <span className='hidden flex-none gap-3 md:flex'>
          <span>Z{terrain.fit.zoom}</span>
          <span>
            {terrain.fit.nTiles}×{terrain.fit.nTiles}
          </span>
          <span>
            Dem {terrain.loaded}/{terrain.total}
          </span>
          <span>
            Img {terrain.textured}/{terrain.total}
          </span>
          <span>Z×{formatDecimal(exaggeration, 2)}</span>
        </span>
      )}

      <span className='min-w-0 flex-1 truncate text-muted'>
        <Rich
          text={t(imagery ? 'status.attribution' : 'status.elevation')}
          parts={{
            imagery: (
              <a
                className={link}
                href='https://s2maps.eu'
                target='_blank'
                rel='noreferrer'
              >
                Sentinel-2 cloudless by EOX
              </a>
            ),
            elevation: (
              <a
                className={link}
                href='https://registry.opendata.aws/terrain-tiles/'
                target='_blank'
                rel='noreferrer'
              >
                AWS Terrain Tiles
              </a>
            )
          }}
        />
        {features ? (
          <>
            {' · '}
            <Rich
              text={t('status.mapData')}
              parts={{
                openfreemap: (
                  <a
                    className={link}
                    href='https://openfreemap.org'
                    target='_blank'
                    rel='noreferrer'
                  >
                    OpenFreeMap
                  </a>
                ),
                openmaptiles: (
                  <a
                    className={link}
                    href='https://www.openmaptiles.org'
                    target='_blank'
                    rel='noreferrer'
                  >
                    OpenMapTiles
                  </a>
                ),
                osm: (
                  <a
                    className={link}
                    href='https://www.openstreetmap.org/copyright'
                    target='_blank'
                    rel='noreferrer'
                  >
                    OpenStreetMap
                  </a>
                )
              }}
            />
          </>
        ) : (
          preset && (
            <>
              {' · '}
              <Rich
                text={t('status.routes')}
                parts={{
                  osm: (
                    <a
                      className={link}
                      href='https://www.openstreetmap.org/copyright'
                      target='_blank'
                      rel='noreferrer'
                    >
                      OpenStreetMap
                    </a>
                  )
                }}
              />
            </>
          )
        )}
      </span>
      <a
        className='hidden flex-none hover:underline sm:inline'
        href={LIBRARY}
        target='_blank'
        rel='noreferrer'
      >
        {t('status.builtWith')}
      </a>
    </footer>
  )
}
