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
  kind: 'primary' | 'expand' | 'round'
  disabled: boolean
  activeCommand: LauncherCommand | null
  tooltip?: string
  onCommand: (command: LauncherCommand) => void
}

/**
 * An action button. `round` is an icon-only circle on the same blurred surface
 * as `expand`, without the label that expands on hover; its label stays as the
 * accessible name and tooltip.
 */
function Action({ command, label, icon, kind, disabled, activeCommand, tooltip, onCommand }: ActionProps) {
  const { t } = useI18n()
  const active = activeCommand === command
  const text = active ? t('controls.working') : t(label)
  return (
    <Button
      variant={kind === 'primary' ? 'default' : 'utility'}
      size={kind === 'primary' ? 'default' : 'tool'}
      onClick={() => onCommand(command)}
      disabled={disabled || activeCommand !== null}
      aria-label={t(label)}
      data-tooltip={tooltip ?? (kind === 'round' ? t(label) : undefined)}
      aria-busy={active}
    >
      <TablerIcon name={active ? 'loader' : icon} className={active ? 'animate-spin' : undefined} />
      {kind === 'expand' ? <span className="action-label" aria-hidden="true">{text}</span> : kind === 'primary' ? text : null}
    </Button>
  )
}

/** Lifecycle actions run against whichever server holds the port; preparation requires a stopped service. */
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
      </div>
      {running && (
        <div className="lifecycle-icons">
          <Action {...common} command="restart" label="controls.restart" icon="restart" kind="round" disabled={disabled || !dshDirectoryValid} />
          <Action {...common} command="stop" label="controls.stop" icon="power" kind="round" disabled={disabled || !dshDirectoryValid} />
        </div>
      )}
    </div>
  )
}
