import { useEffect } from 'react'
import { installTooltips } from '../lib/tooltip'

/** Install one delegated tooltip host and dispose it when the React root unmounts. */
export function TooltipHost() {
  useEffect(() => installTooltips(document.body), [])
  return null
}
