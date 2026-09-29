/** General Settings control for relocating the DeepSeek Harness data directory. */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DataDirectoryStore } from './data-directory-store.ts'
import css from './DataDirectoryRow.module.css'

/** Registrant-owned dependencies of {@link DataDirectoryRow}. */
export interface DataDirectoryRowInjected {
  /** Data-directory state owner and relocation actions. */
  controller: DataDirectoryStore
  hooks: {
    /** Controller snapshot bound by the UI renderer as useSnapshot. */
    snapshot: DataDirectoryStore['store']
  }
}

/** General row owner share, localized copy, and the registrant's state face. */
export type DataDirectoryRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DataDirectoryRowInjected>

/** Folder outline glyph shared by the icon buttons. */
function FolderGlyph(): ReactNode {
  return (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      d="M2 4.25A1.25 1.25 0 0 1 3.25 3h2.4a1 1 0 0 1 .8.4l.7.95a1 1 0 0 0 .8.4h4A1.25 1.25 0 0 1 13.2 6.4v5.35A1.25 1.25 0 0 1 12 13H3.25A1.25 1.25 0 0 1 2 11.75z"
    />
  )
}

/**
 * Render the data-directory path, an open-location icon button, and the
 * relocation control with a directory-picker icon button; the restart notice
 * appears once a migration has been staged.
 * @param props - General owner props, localized copy, and injected state.
 * @returns the row, or null while the Host answer is unresolved.
 */
export function DataDirectoryRow({ controller, useSnapshot, t }: DataDirectoryRowProps): ReactNode {
  const state = useSnapshot(snapshot => snapshot)

  useEffect(() => {
    void controller.load()
  }, [controller])

  if (state.status !== 'ready') return null

  return (
    <div className={css.row}>
      <div className={css.header}>
        <div className={css.title}>{t('dataDirectory.title')}</div>
        {state.canOpen && (
          <button
            type="button"
            className={css.iconButton}
            disabled={state.opening}
            aria-label={t('dataDirectory.open')}
            title={t('dataDirectory.open')}
            onClick={() => { void controller.open() }}
          >
            <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <FolderGlyph />
              <path fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" d="M7.7 9.3 10.5 6.5M10.5 6.5H8.5M10.5 6.5v2" />
            </svg>
          </button>
        )}
      </div>
      <div className={css.description}>{t('dataDirectory.description')}</div>
      <div className={css.path}>{state.path}</div>
      <div className={css.controls}>
        <div className={css.field}>
          <input
            className={css.input}
            value={state.target}
            disabled={state.migrating}
            placeholder={t('dataDirectory.placeholder')}
            aria-label={t('dataDirectory.title')}
            onChange={(event) => { controller.setTarget(event.currentTarget.value) }}
          />
          <button
            type="button"
            className={css.inlineIcon}
            disabled={state.migrating || state.picking}
            aria-label={t('dataDirectory.pick')}
            title={t('dataDirectory.pick')}
            onClick={() => { void controller.pickTarget() }}
          >
            <svg className={css.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <FolderGlyph />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className={css.migrate}
          disabled={state.migrating || state.target.trim() === ''}
          onClick={() => { void controller.migrate() }}
        >
          {t('dataDirectory.migrate')}
        </button>
      </div>
      {state.error === 'migrate' && <div className={css.error} role="alert">{t('dataDirectory.error.migrate')}</div>}
      {state.error === 'open' && <div className={css.error} role="alert">{t('dataDirectory.error.open')}</div>}
      {state.restartRequired && <div className={css.notice} role="status">{t('dataDirectory.restart')}</div>}
    </div>
  )
}
