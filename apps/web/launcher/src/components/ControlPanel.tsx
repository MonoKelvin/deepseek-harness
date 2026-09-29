import React from 'react'
import { TablerIcon } from '../lib/TablerIcon'

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
  icon: string
  variant?: 'primary' | 'secondary' | 'danger'
}

function ActionButton({ label, onClick, disabled, active, icon, variant = 'primary' }: ActionButtonProps) {
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
  }

  const bgClasses = {
    primary: 'bg-primary hover:bg-primary-hover',
    secondary: 'bg-bg-card-hover hover:bg-bg-card',
    danger: 'bg-danger hover:opacity-90',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      className={`
        ${variantClasses[variant]}
        ${bgClasses[variant]}
        ${active ? 'btn-active' : ''}
        flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
        text-sm font-medium transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        border border-border hover:border-border-hover
      `}
    >
      {active ? (
        <TablerIcon name="refresh" size={14} className="animate-spin-slow" />
      ) : (
        <TablerIcon name={icon} size={14} />
      )}
      {label}
    </button>
  )
}

export function ControlPanel({
  onInstall, onBuild, onStart, onStop, onRestart,
  canInstall, canBuild, canStart, canStop, canRestart,
  disabled, activeCommand,
}: ControlPanelProps) {
  return (
    <section className="control-section">
      <div className="glass-card control-card">
        <div className="grid grid-cols-5 gap-2">
          <ActionButton
            label="Install"
            onClick={onInstall}
            disabled={!canInstall}
            active={activeCommand === 'install'}
            icon="download"
            variant="secondary"
          />
          <ActionButton
            label="Build"
            onClick={onBuild}
            disabled={!canBuild}
            active={activeCommand === 'build'}
            icon="terminal"
            variant="secondary"
          />
          <ActionButton
            label="Start"
            onClick={onStart}
            disabled={!canStart}
            active={activeCommand === 'start'}
            icon="play"
            variant="primary"
          />
          <ActionButton
            label="Restart"
            onClick={onRestart}
            disabled={!canRestart}
            active={activeCommand === 'restart'}
            icon="refresh"
            variant="secondary"
          />
          <ActionButton
            label="Stop"
            onClick={onStop}
            disabled={!canStop}
            active={activeCommand === 'stop'}
            icon="pause"
            variant="danger"
          />
        </div>
      </div>
    </section>
  )
}
