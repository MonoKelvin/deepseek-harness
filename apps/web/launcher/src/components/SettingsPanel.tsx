import { useEffect, useState } from 'react'
import { homepage } from '../../package.json'
import { useI18n } from '../i18n'
import type { ThemePreference } from '../hooks/useTheme'
import type { AppSettings } from '../types/server-status'
import { Button } from './ui/button'
import { SegmentedControl } from './SegmentedControl'
import { TablerIcon } from '../lib/TablerIcon'

interface SettingsPanelProps {
  version: string
  theme: ThemePreference
  settings: AppSettings | null
  dshDirectoryValid?: boolean
  onThemeChange: (theme: ThemePreference) => void
  onDshDirectoryChange: (path: string) => void
  onBrowseDshDirectory: () => void
  onLocaleChange: (locale: 'zh' | 'en') => void
  onOpenProject: () => void
}

/** Edit persisted settings; directory changes save on blur or Enter. */
export function SettingsPanel({
  version, theme, settings, dshDirectoryValid,
  onThemeChange, onDshDirectoryChange, onBrowseDshDirectory, onLocaleChange, onOpenProject,
}: SettingsPanelProps) {
  const { t, locale } = useI18n()
  const [directory, setDirectory] = useState(settings?.dshDirectory ?? '')
  const directoryInvalid = dshDirectoryValid === false

  useEffect(() => {
    setDirectory(settings?.dshDirectory ?? '')
  }, [settings?.dshDirectory])

  return (
    <section className="settings-panel" aria-label={t('settings.title')}>
      <div className="settings-header">
        <img className="settings-icon" src="./appicon-512.png" alt="" aria-hidden="true" />
        <div className="settings-info">
          <div className="settings-app-title">
            <span>{t('app.title')}</span>
            {version && <span className="settings-app-version">v{version}</span>}
          </div>
          <p className="settings-app-description">{t('app.description')}</p>
        </div>
      </div>

      <div className="settings-fields">
        <div className="setting-row">
          <div className="setting-label">
            <label htmlFor="dsh-directory">{t('settings.dshDirectory')}</label>
            <p className="setting-caption" id="dsh-directory-hint">{t('settings.dshDirectoryHint')}</p>
          </div>
          <div className="setting-control">
            <div className="setting-path">
              <input
                id="dsh-directory"
                type="text"
                className="setting-input"
                placeholder={t('settings.dshDirectoryPlaceholder')}
                value={directory}
                disabled={!settings}
                onChange={event => setDirectory(event.target.value)}
                onBlur={() => {
                  if (directory !== (settings?.dshDirectory ?? '')) onDshDirectoryChange(directory)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                data-invalid={directoryInvalid}
                aria-invalid={directoryInvalid}
                aria-describedby={directoryInvalid ? 'dsh-directory-error' : 'dsh-directory-hint'}
              />
              <Button variant="ghost" size="sm" className="setting-browse-btn" onClick={onBrowseDshDirectory} aria-label={t('settings.dshDirectoryBrowse')} data-tooltip={t('settings.dshDirectoryBrowse')}>
                <TablerIcon name="folder" size={16} />
              </Button>
            </div>
          </div>
          {directoryInvalid && <p className="setting-error" id="dsh-directory-error">{t('settings.dshDirectoryInvalid')}</p>}
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.theme')}</span>
            <p className="setting-caption">{t('settings.themeHint')}</p>
          </div>
          <div className="setting-control">
            <SegmentedControl
              ariaLabel={t('settings.theme')}
              items={[
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
                { value: 'system', label: t('settings.theme.system') },
              ]}
              value={theme}
              onChange={onThemeChange}
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.language')}</span>
            <p className="setting-caption">{t('settings.languageHint')}</p>
          </div>
          <div className="setting-control">
            <SegmentedControl
              ariaLabel={t('settings.language')}
              items={[
                { value: 'zh', label: t('settings.language.zh') },
                { value: 'en', label: t('settings.language.en') },
              ]}
              value={locale}
              onChange={onLocaleChange}
            />
          </div>
        </div>
      </div>

      <div className="settings-about">
        <div className="settings-open-source">
          <span className="settings-open-source-title">{t('settings.openSource')}</span>
          <span className="settings-open-source-subtitle">{t('settings.license')}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpenProject} data-tooltip={homepage}>
          GitHub <TablerIcon name="externalLink" size={14} />
        </Button>
      </div>
    </section>
  )
}
