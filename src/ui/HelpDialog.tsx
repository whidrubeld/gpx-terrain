import { useSelector } from '@tanstack/react-store'
import type { ReactNode } from 'react'

import { HOTKEY_GROUPS, HOTKEYS } from '../hotkeys'
import { type MessageKey, useT } from '../i18n'
import { Rich } from '../i18n/Rich'
import { installApp, pwaStore, standalone } from '../pwa'
import { settingsStore } from '../state/settings'
import { setHelp, uiStore } from '../state/viewer'
import { cx, Kbd, Keys, Modal, useTouch } from './controls'
import { Icon } from './Icon'
import { LIBRARY, NPM, REPOSITORY } from './Toolbar'

type Row = [input: MessageKey, action: MessageKey]

const POINTER: Row[] = [
  ['help.pointer.drag', 'help.pointer.pan'],
  ['help.pointer.rightDrag', 'help.pointer.rotateTilt'],
  ['help.pointer.shiftDrag', 'help.pointer.rotateTilt'],
  ['help.pointer.scroll', 'help.pointer.zoomToCursor'],
  ['help.pointer.arrows', 'help.pointer.panFocused'],
  ['help.pointer.hoverRoute', 'help.pointer.inspectPoint'],
  ['help.pointer.clickRoute', 'help.pointer.seekThere'],
  ['help.pointer.dragProfile', 'help.pointer.scrub'],
  ['help.pointer.dropFile', 'help.pointer.loadFile']
]

const TOUCH: Row[] = [
  ['help.pointer.oneFinger', 'help.pointer.pan'],
  ['help.pointer.twoFingers', 'help.pointer.zoomRotate'],
  ['help.pointer.tapRoute', 'help.pointer.inspectSeek'],
  ['help.pointer.dragProfile', 'help.pointer.scrub']
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='grid content-start gap-2'>
      <div className='flex items-center gap-2'>
        <h3 className='hud-label text-fg!'>{title}</h3>
        <span className='rule' />
      </div>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: Row[] }) {
  const t = useT()
  return (
    <dl className='grid gap-1 text-2xs uppercase tracking-[0.06em]'>
      {rows.map(([input, action]) => (
        <div key={input} className='flex items-center justify-between gap-3'>
          <dt>
            <span className='tag'>{t(input)}</span>
          </dt>
          <dd className='text-right text-muted'>{t(action)}</dd>
        </div>
      ))}
    </dl>
  )
}

function Keyboard() {
  const t = useT()
  const shortcuts = useSelector(settingsStore, (s) => s.shortcuts)
  return (
    <Section title={t('help.keyboard')}>
      {!shortcuts && (
        <p className='border border-line-strong p-2 text-2xs uppercase leading-4 tracking-[0.06em]'>
          {t('help.shortcutsOff')}
        </p>
      )}
      <div className='grid gap-3'>
        {HOTKEY_GROUPS.map((group) => (
          <div key={group} className='grid gap-1'>
            <span className='hud-label'>{t(`help.groups.${group}`)}</span>
            {HOTKEYS.filter((h) => h.group === group).map((hotkey) => (
              <div
                key={hotkey.label}
                className='flex items-center justify-between gap-3 text-2xs uppercase tracking-[0.06em]'
              >
                <span>{t(hotkey.label)}</span>
                <Keys hotkey={hotkey} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

function About() {
  const t = useT()
  const installable = useSelector(pwaStore, (s) => s.installable)
  const link = 'text-fg underline decoration-dotted underline-offset-4'
  return (
    <Section title={t('help.about')}>
      <p className='text-2xs leading-4 text-muted'>
        <Rich
          text={t('help.text')}
          parts={{
            library: (
              <a
                className={link}
                href={LIBRARY}
                target='_blank'
                rel='noreferrer'
              >
                three-map-terrain
              </a>
            )
          }}
        />
      </p>
      <p className='text-2xs leading-4 text-muted'>{t('help.offline')}</p>
      <div className='flex flex-wrap gap-2'>
        {installable && !standalone() && (
          <button
            type='button'
            className='btn btn-primary'
            onClick={() => void installApp()}
          >
            <Icon name='download' cell={1} />
            {t('help.install')}
          </button>
        )}
        <a className='btn' href={REPOSITORY} target='_blank' rel='noreferrer'>
          {t('help.sourceCode')} <Icon name='external' cell={1} />
        </a>
        <a className='btn' href={LIBRARY} target='_blank' rel='noreferrer'>
          three-map-terrain <Icon name='external' cell={1} />
        </a>
        <a className='btn' href={NPM} target='_blank' rel='noreferrer'>
          npm <Icon name='external' cell={1} />
        </a>
      </div>
      <p className='text-3xs uppercase leading-3 tracking-[0.08em] text-muted'>
        {t('chooser.credits')}
      </p>
      <p className='text-3xs uppercase leading-3 tracking-[0.08em] text-muted tabular-nums'>
        {t('help.versions', {
          app: `v${__APP_VERSION__}`,
          library: `v${__LIBRARY_VERSION__}`
        })}
      </p>
    </Section>
  )
}

export function HelpDialog() {
  const t = useT()
  const open = useSelector(uiStore, (s) => s.help)
  // touch gestures on phones and tablets, mouse and keyboard elsewhere
  const touch = useTouch()

  return (
    <Modal
      open={open}
      onClose={() => setHelp(false)}
      labelledBy='help-title'
      className='w-[min(60rem,calc(100vw-2rem))]'
    >
      <header className='sticky top-0 z-10 flex h-11 items-center gap-3 border-b border-line bg-panel-solid pl-4 pr-2'>
        <Icon name={touch ? 'help' : 'keyboard'} cell={1} />
        <h2 id='help-title' className='dot text-lg'>
          {t('help.title')}
        </h2>
        <span className='rule' />
        <Kbd always>Esc</Kbd>
        <button
          type='button'
          className='btn btn-icon h-7! w-7!'
          onClick={() => setHelp(false)}
          aria-label={t('help.close')}
        >
          <Icon name='close' cell={1} />
        </button>
      </header>

      <div
        className={cx(
          'grid gap-6 p-4',
          touch ? 'md:grid-cols-2' : 'md:grid-cols-[1fr_1.15fr_1fr]'
        )}
      >
        {touch ? (
          <Section title={t('help.touch')}>
            <Rows rows={TOUCH} />
          </Section>
        ) : (
          <>
            <Section title={t('help.mouse')}>
              <Rows rows={POINTER} />
            </Section>
            <Keyboard />
          </>
        )}
        <About />
      </div>
    </Modal>
  )
}
