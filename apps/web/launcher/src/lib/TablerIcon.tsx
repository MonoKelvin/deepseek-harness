import type { IconProps } from '@tabler/icons-react'
import { cn } from './utils'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFolder,
  IconHammer,
  IconLanguage,
  IconLoader2,
  IconPalette,
  IconPackage,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconX,
  IconBleach,
} from '@tabler/icons-react'

const icons = {
  alert: IconAlertTriangle,
  check: IconCheck,
  copy: IconCopy,
  externalLink: IconExternalLink,
  folder: IconFolder,
  hammer: IconHammer,
  language: IconLanguage,
  loader: IconLoader2,
  palette: IconPalette,
  package: IconPackage,
  play: IconBleach,
  stop: IconPlayerStop,
  refresh: IconRefresh,
  trash: IconTrash,
  x: IconX,
} as const

export type TablerIconName = keyof typeof icons

interface TablerIconProps extends IconProps {
  name: TablerIconName
}

/** Render the launcher's action icons with a consistent stroke weight. */
export function TablerIcon({ name, size = 16, stroke = 2, className, ...props }: TablerIconProps) {
  const Icon = icons[name]
  return <Icon size={size} stroke={stroke} aria-hidden="true" className={cn(name === 'play' && 'rotate-90', className)} {...props} />
}
