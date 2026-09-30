import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'

export interface SegmentedItem<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  items: SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/**
 * Mutually-exclusive segmented control with a single sliding indicator.
 * The active background is one absolutely-positioned block that animates its
 * position/width to the selected button instead of each button toggling a
 * background on/off.
 */
export function SegmentedControl<T extends string>({ items, value, onChange, ariaLabel }: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const active = container.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      if (!active) return
      const containerRect = container.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      setIndicator({ left: activeRect.left - containerRect.left, width: activeRect.width })
    }
    measure()
    // Re-measure when labels change width (e.g. locale switch) or on resize.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [value, ariaLabel])

  return (
    <div className="compact-choice" role="group" aria-label={ariaLabel} ref={containerRef}>
      <span className="segment-indicator" style={{ left: indicator.left, width: indicator.width }} aria-hidden="true" />
      {items.map(item => (
        <Button
          key={item.value}
          variant="tab-sm"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  )
}
