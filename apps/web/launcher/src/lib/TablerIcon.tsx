import type { IconProps } from '@tabler/icons-react'
import {
  IconActivity,
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconHammer,
  IconLoader2,
  IconMaximize,
  IconMinus,
  IconPackage,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconRocket,
  IconServer,
  IconWifi,
  IconX,
} from '@tabler/icons-react'

const icons = {
  activity: IconActivity,
  alert: IconAlertTriangle,
  check: IconCheck,
  externalLink: IconExternalLink,
  hammer: IconHammer,
  loader: IconLoader2,
  maximize: IconMaximize,
  minimize: IconMinus,
  package: IconPackage,
  play: IconPlayerPlay,
  pause: IconPlayerStop,
  refresh: IconRefresh,
  rocket: IconRocket,
  server: IconServer,
  wifi: IconWifi,
  x: IconX,
} as const

export type TablerIconName = keyof typeof icons

interface TablerIconProps extends IconProps {
  name: TablerIconName
}

/** Render one of the launcher's shared Tabler icons with consistent stroke weight. */
export function TablerIcon({ name, size = 18, stroke = 1.8, ...props }: TablerIconProps) {
  const Icon = icons[name]
  return <Icon size={size} stroke={stroke} aria-hidden="true" {...props} />
}
