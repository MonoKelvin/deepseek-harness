import { useEffect, useState } from 'react'
import { homepage } from '../../package.json'
import { useI18n } from '../i18n'
import type { ThemePreference } from '../hooks/useTheme'
import type { AppSettings } from '../types/server-status'
import { Button } from './ui/button'
import { SegmentedControl } from './SegmentedControl'
import { Switch } from './ui/switch'
import { TablerIcon } from '../lib/TablerIcon'

// Derive the MIT License URL from the project homepage; the LICENSE file lives at the repo root.
const LICENSE_URL = homepage.replace(/\/tree\/master\/apps\/web\/launcher$/, '/blob/master/LICENSE')

interface SettingsPanelProps {
  version: string
  theme: ThemePreference
  settings: AppSettings | null
  dshDirectoryValid?: boolean
  serverRunning?: boolean
  onThemeChange: (theme: ThemePreference) => void
  onDshDirectoryChange: (path: string) => void
  onBrowseDshDirectory: () => void
  onServerPortChange: (port: number) => void
  onLocaleChange: (locale: 'zh' | 'en') => void
  onAutostartChange: (enabled: boolean) => void
  onStopServicesOnExitChange: (enabled: boolean) => void
  onOpenProject: () => void
}

/** Edit persisted settings; directory and port changes save on blur or Enter. */
export function SettingsPanel({
  version, theme, settings, dshDirectoryValid, serverRunning,
  onThemeChange, onDshDirectoryChange, onBrowseDshDirectory, onServerPortChange,
  onLocaleChange, onAutostartChange, onStopServicesOnExitChange, onOpenProject,
}: SettingsPanelProps) {
  const { t, locale } = useI18n()
  const [directory, setDirectory] = useState(settings?.dshDirectory ?? '')
  const [port, setPort] = useState(settings?.port != null ? String(settings.port) : '')
  const directoryInvalid = dshDirectoryValid === false

  useEffect(() => {
    setDirectory(settings?.dshDirectory ?? '')
  }, [settings?.dshDirectory])

  useEffect(() => {
    setPort(settings?.port != null ? String(settings.port) : '')
  }, [settings?.port])

  // Save a port edit only when it is a valid TCP port and actually changed;
  // otherwise snap the field back to the persisted value.
  const commitPort = () => {
    const parsed = Number(port)
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
      if (parsed !== settings?.port) onServerPortChange(parsed)
    } else {
      setPort(settings?.port != null ? String(settings.port) : '')
    }
  }

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
                onKeyDown={(event) => {
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
            <label htmlFor="server-port">{t('settings.serverPort')}</label>
            <p className="setting-caption">{serverRunning ? t('settings.serverPortLocked') : t('settings.serverPortHint')}</p>
          </div>
          <div className="setting-control">
            <input
              id="server-port"
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              className="setting-input setting-input-port"
              value={port}
              disabled={!settings || serverRunning}
              onChange={event => setPort(event.target.value)}
              onBlur={commitPort}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>
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

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.autostart')}</span>
            <p className="setting-caption">{t('settings.autostartHint')}</p>
          </div>
          <div className="setting-control">
            <Switch
              ariaLabel={t('settings.autostart')}
              checked={settings?.autostart ?? false}
              disabled={!settings}
              onChange={onAutostartChange}
            />
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.stopOnExit')}</span>
            <p className="setting-caption">{t('settings.stopOnExitHint')}</p>
          </div>
          <div className="setting-control">
            <Switch
              ariaLabel={t('settings.stopOnExit')}
              checked={settings?.stopServicesOnExit ?? true}
              disabled={!settings}
              onChange={onStopServicesOnExitChange}
            />
          </div>
        </div>
      </div>

      <div className="settings-about">
        <div className="settings-open-source">
          <span className="settings-open-source-title">{t('settings.openSource')}</span>
          <a className="settings-open-source-subtitle" href={LICENSE_URL} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{t('settings.license')}</a>
        </div>
        <a className="settings-source-link" href={homepage} target="_blank" rel="noreferrer" onClick={onOpenProject} data-tooltip={homepage}><TablerIcon name="externalLink" size={14} /> GitHub</a>
      </div>
    </section>
  )
}
