import { TablerIcon, type TablerIconName } from '../lib/TablerIcon'
import { useI18n, type TranslationKey } from '../i18n'
import { Button, type ButtonProps } from '@/components/ui/button'

export interface ControlPanelProps {
  onInstall: () => void
  onBuild: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  canInstall: boolean
  canBuild: boolean
  canStart: boolean
  canStop: boolean
  canRestart: boolean
  disabled?: boolean
  activeCommand?: string
}

interface ActionButtonProps {
  labelKey: TranslationKey
  onClick: () => void
  disabled?: boolean
  active?: boolean
  icon: TablerIconName
  variant?: ButtonProps['variant']
}

function ActionButton({ labelKey, onClick, disabled, active, icon, variant = 'secondary' }: ActionButtonProps) {
  const { t } = useI18n()
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      variant={variant}
      className="h-auto flex-col gap-1.5 py-2.5"
      aria-label={active ? t('controls.working') : t(labelKey)}
    >
      <TablerIcon name={active ? 'loader' : icon} size={18} className={active ? 'animate-spin' : undefined} />
      <span className="text-[11px] font-medium">{active ? t('controls.working') : t(labelKey)}</span>
    </Button>
  )
}

/** Group the lifecycle actions into one consistent control surface. */
export function ControlPanel({
  onInstall, onBuild, onStart, onStop, onRestart,
  canInstall, canBuild, canStart, canStop, canRestart,
  disabled, activeCommand,
}: ControlPanelProps) {
  const { t } = useI18n()
  return (
    <section aria-label={t('controls.title')}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold text-foreground/90">{t('controls.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('controls.subtitle')}</p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <ActionButton labelKey="controls.install" onClick={onInstall} disabled={disabled || !canInstall} active={activeCommand === 'install'} icon="package" />
        <ActionButton labelKey="controls.build" onClick={onBuild} disabled={disabled || !canBuild} active={activeCommand === 'build'} icon="hammer" />
        <ActionButton labelKey="controls.start" onClick={onStart} disabled={disabled || !canStart} active={activeCommand === 'start'} icon="play" variant="default" />
        <ActionButton labelKey="controls.restart" onClick={onRestart} disabled={disabled || !canRestart} active={activeCommand === 'restart'} icon="refresh" />
        <ActionButton labelKey="controls.stop" onClick={onStop} disabled={disabled || !canStop} active={activeCommand === 'stop'} icon="pause" variant="destructive" />
      </div>
    </section>
  )
}
