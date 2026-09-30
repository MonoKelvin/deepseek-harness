import { TablerIcon, type TablerIconName } from '../lib/TablerIcon'
import { useI18n, type TranslationKey } from '../i18n'
import { Button } from '@/components/ui/button'
import type { ServerState } from '../types/server-status'

export type LauncherCommand = 'install' | 'build' | 'start' | 'stop' | 'restart' | 'open' | 'project'

interface ControlPanelProps {
  state?: ServerState
  canOpen: boolean
  disabled: boolean
  dshDirectoryValid: boolean
  activeCommand: LauncherCommand | null
  onCommand: (command: LauncherCommand) => void
}

interface ActionProps {
  command: LauncherCommand
  label: TranslationKey
  icon: TablerIconName
  kind?: 'primary' | 'expand' | 'secondary'
  disabled: boolean
  activeCommand: LauncherCommand | null
  tooltip?: string
  onCommand: (command: LauncherCommand) => void
}

function Action({ command, label, icon, kind = 'secondary', disabled, activeCommand, tooltip, onCommand }: ActionProps) {
  const { t } = useI18n()
  const active = activeCommand === command
  const text = active ? t('controls.working') : t(label)
  return (
    <Button
      variant={kind === 'primary' ? 'default' : kind === 'expand' ? 'utility' : 'ghost'}
      size={kind === 'primary' ? 'default' : kind === 'expand' ? 'tool' : 'sm'}
      onClick={() => onCommand(command)}
      disabled={disabled || activeCommand !== null}
      aria-label={t(label)}
      data-tooltip={tooltip}
      aria-busy={active}
    >
      <TablerIcon name={active ? 'loader' : icon} size={kind === 'secondary' ? 16 : undefined} className={active ? 'animate-spin' : undefined} />
      {kind === 'expand' ? <span className="action-label" aria-hidden="true">{text}</span> : text}
    </Button>
  )
}

/** Lifecycle actions follow service ownership; preparation requires a stopped service. */
export function ControlPanel({ state, canOpen, disabled, dshDirectoryValid, activeCommand, onCommand }: ControlPanelProps) {
  const { t } = useI18n()
  const running = state === 'running-managed' || state === 'running-external'
  const preparingDisabled = disabled || !dshDirectoryValid || state !== 'stopped'
  const common = { activeCommand, onCommand }
  const preparationHint = (label: TranslationKey) => activeCommand ? t('controls.wait') : preparingDisabled ? t('controls.stopFirst') : t(label)

  return (
    <div className="service-actions">
      <div className="lifecycle-actions">
        <Action {...common} command={running ? 'open' : 'start'} label={running ? 'controls.open' : 'controls.start'} icon={running ? 'externalLink' : 'play'} kind="primary" disabled={disabled || !dshDirectoryValid || (running ? !canOpen : state !== 'stopped')} />
        <Action {...common} command="install" label="controls.install" icon="package" kind="expand" disabled={preparingDisabled} tooltip={preparationHint('controls.installHint')} />
        <Action {...common} command="build" label="controls.build" icon="hammer" kind="expand" disabled={preparingDisabled} tooltip={preparationHint('controls.buildHint')} />
        {state === 'running-managed' && (
          <>
            <Action {...common} command="restart" label="controls.restart" icon="refresh" disabled={disabled || !dshDirectoryValid} />
            <Action {...common} command="stop" label="controls.stop" icon="stop" disabled={disabled || !dshDirectoryValid} />
          </>
        )}
      </div>
      {state === 'running-external' && <span className="external-note">{t('status.externalNote')}</span>}
    </div>
  )
}
