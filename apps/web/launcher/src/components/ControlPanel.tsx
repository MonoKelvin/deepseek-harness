import { TablerIcon, type TablerIconName } from '../lib/TablerIcon'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

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
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  icon: TablerIconName
  variant?: ButtonProps['variant']
}

function ActionButton({ label, onClick, disabled, active, icon, variant = 'secondary' }: ActionButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      variant={variant}
      className="action-button"
      aria-label={active ? `${label} in progress` : label}
    >
      <TablerIcon name={active ? 'loader' : icon} size={16} className={active ? 'animate-spin' : undefined} />
      <span>{active ? 'Working' : label}</span>
    </Button>
  )
}

/** Group the lifecycle actions into one consistent control surface. */
export function ControlPanel({
  onInstall, onBuild, onStart, onStop, onRestart,
  canInstall, canBuild, canStart, canStop, canRestart,
  disabled, activeCommand,
}: ControlPanelProps) {
  return (
    <section aria-label="Server controls">
      <div className="section-heading">
        <h2>Lifecycle</h2>
        <p>Run the common workspace commands</p>
      </div>
      <Card className="surface control-card">
        <div className="control-grid">
          <ActionButton label="Install" onClick={onInstall} disabled={disabled || !canInstall} active={activeCommand === 'install'} icon="package" />
          <ActionButton label="Build" onClick={onBuild} disabled={disabled || !canBuild} active={activeCommand === 'build'} icon="hammer" />
          <ActionButton label="Start server" onClick={onStart} disabled={disabled || !canStart} active={activeCommand === 'start'} icon="play" variant="default" />
          <ActionButton label="Restart" onClick={onRestart} disabled={disabled || !canRestart} active={activeCommand === 'restart'} icon="refresh" />
          <ActionButton label="Stop" onClick={onStop} disabled={disabled || !canStop} active={activeCommand === 'stop'} icon="pause" variant="destructive" />
        </div>
      </Card>
    </section>
  )
}
