import { author, homepage } from '../../package.json'
import { useI18n } from '../i18n'
import type { ThemePreference } from '../hooks/useTheme'
import type { AppSettings } from '../types/server-status'
import { Button } from './ui/button'
import { TablerIcon } from '../lib/TablerIcon'

interface SettingsPanelProps {
  version: string
  theme: ThemePreference
  settings: AppSettings | null
  dshDirectoryValid: boolean
  onThemeChange: (theme: ThemePreference) => void
  onDshDirectoryChange: (path: string) => void
  onBrowseDshDirectory: () => void
  onLocaleChange: (locale: 'zh' | 'en') => void
  onOpenProject: () => void
}

export function SettingsPanel({
  version, theme, settings, dshDirectoryValid,
  onThemeChange, onDshDirectoryChange, onBrowseDshDirectory, onLocaleChange, onOpenProject,
}: SettingsPanelProps) {
  const { t, locale } = useI18n()
  const dshDirValue = settings?.dshDirectory ?? ''
  const dshDirInvalid = settings?.dshDirectory !== null && !dshDirectoryValid

  return (
    <section className="settings-panel" aria-label={t('settings.title')}>
      <div className="settings-header">
        <img className="settings-icon" src="./appicon-512.png" alt="" aria-hidden="true" />
        <div className="settings-info">
          <div className="settings-app-title">{t('app.title')}</div>
          <p className="settings-app-description">{t('app.description')}</p>
        </div>
      </div>

      <div className="settings-fields">
        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.dshDirectory')}</span>
            <p className="setting-caption">{t('settings.dshDirectoryHint')}</p>
          </div>
          <div className="setting-control">
            <input
              type="text"
              className="setting-input"
              placeholder={t('settings.dshDirectoryPlaceholder')}
              value={dshDirValue}
              onChange={event => onDshDirectoryChange(event.target.value)}
              data-invalid={dshDirInvalid}
              aria-invalid={dshDirInvalid}
            />
            <Button variant="ghost" size="sm" className="setting-browse-btn" onClick={onBrowseDshDirectory} aria-label={t('settings.dshDirectoryAuto')}>
              <TablerIcon name="folder" size={16} />
            </Button>
          </div>
          {dshDirInvalid && <p className="setting-error">{t('settings.dshDirectoryInvalid')}</p>}
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.theme')}</span>
            <p className="setting-caption">{t('settings.theme')}</p>
          </div>
          <div className="setting-control">
            <div className="compact-choice" role="group" aria-label={t('settings.theme')}>
              {(['light', 'dark', 'system'] as const).map(value => (
                <Button key={value} variant="tab-sm" aria-pressed={theme === value} onClick={() => onThemeChange(value)}>
                  {t(`settings.theme.${value}`)}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-label">
            <span>{t('settings.language')}</span>
            <p className="setting-caption">界面显示语言 / Interface language</p>
          </div>
          <div className="setting-control">
            <div className="compact-choice" role="group" aria-label={t('settings.language')}>
              <Button variant="tab-sm" aria-pressed={locale === 'zh'} onClick={() => onLocaleChange('zh')}>{t('settings.language.zh')}</Button>
              <Button variant="tab-sm" aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>{t('settings.language.en')}</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-about">
        <span>{t('settings.version')} {version ? `v${version}` : '—'}</span>
        <span>{t('settings.author')} {author}</span>
        <Button variant="ghost" size="sm" onClick={onOpenProject} data-tooltip={homepage}>
          GitHub <TablerIcon name="externalLink" size={14} />
        </Button>
      </div>
    </section>
  )
}
